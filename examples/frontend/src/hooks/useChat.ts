import { useState, useEffect, useRef, useCallback } from "react";
import { Message, Tool } from "../types/chat";
import {
  loadChatHistory,
  saveChatHistory,
  clearChatHistory as clearStorageHistory,
} from "../utils/storage";
import { ChatMessage, X402Client } from "@x402-agent-gateway/client";
import { formatPrice } from "../utils/priceFormatter";

export const useChat = (client: X402Client | null) => {
  const [messages, setMessages] = useState<Message[]>(() => {
    // Initialize state directly from localStorage to avoid flash of empty state
    try {
      const history = loadChatHistory();
      return history.messages;
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  const [tools, setTools] = useState<Tool[]>([]);
  const isInitialLoad = useRef(true);
  const hasLoaded = useRef(false);

  const validateAndFixToolCalls = useCallback((msgs: Message[]): Message[] => {
    return msgs.map((msg) => {
      if (msg.role === "assistant" && msg.toolCalls) {
        const fixedToolCalls = msg.toolCalls.map((tc) => {
          if (tc.result === undefined) {
            return {
              ...tc,
              result: {
                error: "Tool call was cancelled or failed to complete",
                cancelled: true,
              },
              status: "cancelled" as const,
            };
          }
          if (
            tc.result &&
            typeof tc.result === "object" &&
            "error" in tc.result &&
            !tc.status
          ) {
            return {
              ...tc,
              status: "failed" as const,
            };
          }
          if (tc.result !== undefined && !tc.status) {
            return {
              ...tc,
              status: "completed" as const,
            };
          }
          return tc;
        });
        return { ...msg, toolCalls: fixedToolCalls };
      }
      return msg;
    });
  }, []);

  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;

    const history = loadChatHistory();
    const validatedMessages = validateAndFixToolCalls(history.messages);
    setMessages(validatedMessages);

    if (
      validatedMessages.length !== history.messages.length ||
      JSON.stringify(validatedMessages) !== JSON.stringify(history.messages)
    ) {
      const fixedHistory = { ...history, messages: validatedMessages };
      saveChatHistory(fixedHistory);
    }

    isInitialLoad.current = false;
  }, [validateAndFixToolCalls]);

  useEffect(() => {
    if (isInitialLoad.current) {
      return;
    }
    const history = loadChatHistory();
    history.messages = messages;
    saveChatHistory(history);
  }, [messages]);

  useEffect(() => {
    if (!client) {
      return;
    }

    client.tools
      .list()
      .then((data: Tool[]) => {
        setTools(data);
      })
      .catch((err: unknown) => {
        console.error("Failed to load tools:", err);
      });
  }, [client]);

  const getToolPrice = useCallback(
    (toolName: string): string => {
      const tool = tools.find((t) => t.name === toolName);
      if (tool) {
        return formatPrice(tool.price.amount, tool.price.asset);
      }
      return "Unknown";
    },
    [tools]
  );

  const addMessage = (message: Message) => {
    setMessages((prev) => [...prev, message]);
  };

  const updateMessage = (id: string, updates: Partial<Message>) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    );
  };

  const convertMessagesToAPI = useCallback((msgs: Message[]): ChatMessage[] => {
    const apiMessages: ChatMessage[] = [];

    for (const msg of msgs) {
      if (msg.role === "assistant") {
        const apiMessage: ChatMessage = {
          role: "assistant",
          content: msg.content || "",
        };

        if (msg.toolCalls && msg.toolCalls.length > 0) {
          apiMessage.tool_calls = msg.toolCalls.map((tc, index) => ({
            id: `call_${msg.id}_${index}`,
            type: "function" as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.input),
            },
          }));
        }

        apiMessages.push(apiMessage);

        if (msg.toolCalls && msg.toolCalls.length > 0) {
          msg.toolCalls.forEach((tc, index) => {
            const result =
              tc.result !== undefined
                ? tc.result
                : {
                    error: "Tool call was cancelled or failed to complete",
                    cancelled: true,
                  };

            apiMessages.push({
              role: "tool",
              content: JSON.stringify(result),
              tool_call_id: `call_${msg.id}_${index}`,
              name: tc.name,
            });
          });
        }
      } else if (msg.role === "user") {
        apiMessages.push({
          role: "user",
          content: msg.content,
        });
      }
    }

    return apiMessages;
  }, []);

  const executeToolCalls = useCallback(
    async (
      toolCalls: Array<{
        id: string;
        type: "function";
        function: {
          name: string;
          arguments: string;
        };
      }>
    ): Promise<Array<{ toolCallId: string; name: string; result: any }>> => {
      if (!client) {
        throw new Error("Client not available");
      }

      return Promise.all(
        toolCalls.map(async (toolCall) => {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const result = await client.tools.invoke(
              toolCall.function.name,
              args
            );
            return {
              toolCallId: toolCall.id,
              name: toolCall.function.name,
              result,
            };
          } catch (error: any) {
            console.error(
              `Error invoking tool ${toolCall.function.name}:`,
              error
            );
            return {
              toolCallId: toolCall.id,
              name: toolCall.function.name,
              result: { error: error.message || "Tool invocation failed" },
            };
          }
        })
      );
    },
    [client]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!client) {
        throw new Error("Client not available");
      }

      if (!content.trim()) return;

      const userMessageId = Date.now().toString();
      const userMessage: Message = {
        id: userMessageId,
        role: "user",
        content,
        timestamp: Date.now(),
      };

      let currentMessages: Message[] = [];
      setMessages((prev) => {
        currentMessages = [...prev];
        return [...prev, userMessage];
      });

      setLoading(true);

      try {
        let conversationMessages = convertMessagesToAPI(currentMessages);

        conversationMessages.push({
          role: "user",
          content,
        });

        const response = await client.chat.completions.create({
          model: "gpt-4",
          messages: conversationMessages,
          tools: "auto",
        });

        const choice = response.choices[0];
        if (!choice) {
          throw new Error("No response from API");
        }

        const assistantMessage = choice.message;

        if (
          assistantMessage.tool_calls &&
          assistantMessage.tool_calls.length > 0
        ) {
          const assistantMessageWithTools: Message = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: assistantMessage.content || "",
            timestamp: Date.now(),
            paymentStatus: "confirmed",
            toolCalls: assistantMessage.tool_calls.map((tc) => ({
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments),
              result: undefined,
              cost: getToolPrice(tc.function.name),
              status: "pending" as const,
            })),
          };

          addMessage(assistantMessageWithTools);

          conversationMessages.push(assistantMessage);

          const toolResults = await executeToolCalls(
            assistantMessage.tool_calls
          );

          const toolCallsWithResults = assistantMessage.tool_calls.map((tc) => {
            const result = toolResults.find((tr) => tr.toolCallId === tc.id);
            const toolResult = result?.result || { error: "No result" };
            const hasError =
              toolResult &&
              typeof toolResult === "object" &&
              "error" in toolResult;

            return {
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments),
              result: toolResult,
              cost: getToolPrice(tc.function.name),
              status: hasError ? ("failed" as const) : ("completed" as const),
            };
          });

          updateMessage(assistantMessageWithTools.id, {
            toolCalls: toolCallsWithResults,
          });

          toolResults.forEach(({ toolCallId, name, result }) => {
            conversationMessages.push({
              role: "tool",
              content: JSON.stringify(result),
              tool_call_id: toolCallId,
              name,
            });
          });

          const finalResponse = await client.chat.completions.create({
            model: "gpt-4",
            messages: conversationMessages,
            tools: "auto",
          });

          const finalChoice = finalResponse.choices[0];
          if (!finalChoice) {
            throw new Error("No response from API");
          }

          const finalAssistantMessage: Message = {
            id: (Date.now() + 2).toString(),
            role: "assistant",
            content: finalChoice.message.content || "No response",
            timestamp: Date.now(),
            paymentStatus: "confirmed",
          };

          addMessage(finalAssistantMessage);
        } else {
          const assistantMessageFinal: Message = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: assistantMessage.content || "No response",
            timestamp: Date.now(),
            paymentStatus: "confirmed",
          };

          addMessage(assistantMessageFinal);
        }
      } catch (error: any) {
        console.error("Chat error:", error);

        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `Error: ${
            error.message || "Failed to send message. Please try again."
          }`,
          timestamp: Date.now(),
          paymentStatus: "failed",
        };

        addMessage(errorMessage);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [client, addMessage, updateMessage, convertMessagesToAPI, executeToolCalls, getToolPrice]
  );

  const cancelToolCall = useCallback(
    (messageId: string, toolCallIndex: number) => {
      setMessages((prev) =>
        prev.map((msg) => {
          if (
            msg.id === messageId &&
            msg.toolCalls &&
            msg.toolCalls[toolCallIndex]
          ) {
            const updatedToolCalls = [...msg.toolCalls];
            updatedToolCalls[toolCallIndex] = {
              ...updatedToolCalls[toolCallIndex],
              result: {
                error: "Tool call was cancelled by user",
                cancelled: true,
              },
              status: "cancelled" as const,
            };
            return { ...msg, toolCalls: updatedToolCalls };
          }
          return msg;
        })
      );
    },
    []
  );

  const executeToolManually = useCallback(
    async (toolName: string, input: Record<string, unknown>) => {
      if (!client) {
        throw new Error("Client not available");
      }

      setLoading(true);

      try {
        const toolCallId = `manual_${Date.now()}`;
        const toolCall = {
          id: toolCallId,
          type: "function" as const,
          function: {
            name: toolName,
            arguments: JSON.stringify(input),
          },
        };

        const assistantMessageId = Date.now().toString();
        const assistantMessageWithTools: Message = {
          id: assistantMessageId,
          role: "assistant",
          content: `Manual tool execution: ${toolName}`,
          timestamp: Date.now(),
          paymentStatus: "confirmed",
          toolCalls: [
            {
            name: toolName,
            input,
            result: undefined,
            cost: getToolPrice(toolName),
              status: "pending" as const,
            },
          ],
        };

        addMessage(assistantMessageWithTools);

        const toolResults = await executeToolCalls([toolCall]);

        const result = toolResults.find((tr) => tr.toolCallId === toolCallId);
        const toolResult = result?.result || { error: "No result" };
        const hasError =
          toolResult && typeof toolResult === "object" && "error" in toolResult;

        updateMessage(assistantMessageId, {
          toolCalls: [
            {
              name: toolName,
              input,
              result: toolResult,
              cost: getToolPrice(toolName),
              status: hasError ? ("failed" as const) : ("completed" as const),
            },
          ],
        });
      } catch (error: any) {
        console.error("Manual tool execution error:", error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [client, addMessage, updateMessage, executeToolCalls, getToolPrice]
  );

  const clearChatHistory = useCallback(() => {
    clearStorageHistory();
    saveChatHistory({ messages: [], lastCleared: Date.now() });
    setMessages([]);
    isInitialLoad.current = true;
    hasLoaded.current = false;
  }, []);

  return {
    messages,
    loading,
    sendMessage,
    addMessage,
    updateMessage,
    cancelToolCall,
    executeToolManually,
    clearChatHistory,
  };
};
