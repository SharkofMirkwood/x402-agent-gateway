// Manual mock for OpenAI module
const mockCreate = jest.fn().mockImplementation(async (params: any) => {
  // Default mock response
  const mockResponse = {
    id: "chatcmpl-test-123",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: params.model || "gpt-4",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant" as const,
          content: "I have access to tools. Ask me to use them!",
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 20,
      completion_tokens: 15,
      total_tokens: 35,
    },
  };

  // If tools are provided, check if the last message suggests using tools
  const messages = params.messages || [];
  const lastMessage = messages[messages.length - 1];

  // Check if the conversation already has tool calls (frontend already executed tools)
  const hasToolResults = messages.some((msg: any) => msg.role === "tool");

  // If there are tool results in the conversation, return a final response
  if (hasToolResults) {
    const toolMessages = messages.filter((msg: any) => msg.role === "tool");
    const lastToolResult = toolMessages[toolMessages.length - 1];

    try {
      const toolData = JSON.parse(lastToolResult.content);
      mockResponse.choices[0].message.content = `Based on the tool execution, the result is ${JSON.stringify(
        toolData
      )}.`;
    } catch {
      mockResponse.choices[0].message.content = "I processed the tool results.";
    }

    return mockResponse;
  }

  // Check if user is asking about tools or wants to use tools
  const userContent =
    typeof lastMessage?.content === "string"
      ? lastMessage.content.toLowerCase()
      : "";

  const hasTools = params.tools && params.tools.length > 0;

  // Check if user is asking about available tools (not requesting to use them)
  const isAskingAboutTools =
    userContent.includes("what tools") ||
    userContent.includes("which tools") ||
    userContent.includes("list tools") ||
    userContent.includes("available tools") ||
    (userContent.includes("tool") &&
      (userContent.includes("have") ||
        userContent.includes("available") ||
        userContent.includes("can you")));

  // Check if user wants to use/execute tools
  const wantsToUseTools =
    userContent.includes("calculate") ||
    userContent.includes("math") ||
    userContent.includes("multiply") ||
    userContent.includes("add") ||
    userContent.includes("subtract") ||
    userContent.includes("divide") ||
    (userContent.includes("use") && !isAskingAboutTools);

  if (hasTools && isAskingAboutTools) {
    // User is asking about available tools - return a text response
    const toolNames = params.tools.map((t: any) => t.function.name).join(", ");
    mockResponse.choices[0].message.content = `I have access to ${params.tools.length} tools: ${toolNames}. Ask me to use them!`;
  } else if (hasTools && wantsToUseTools) {
    // User wants to use tools - return tool calls
    const messageWithToolCalls: any = {
      role: "assistant" as const,
      content: null,
      tool_calls: [
        {
          id: "call_test_123",
          type: "function" as const,
          function: {
            name: "calculate",
            arguments: JSON.stringify({
              operation: "multiply",
              a: 6,
              b: 7,
            }),
          },
        },
      ],
    };
    mockResponse.choices[0].message = messageWithToolCalls;
    mockResponse.choices[0].finish_reason = "tool_calls";
  } else if (hasTools) {
    // Default: if tools are available but user message doesn't match above, mention tools
    const toolNames = params.tools.map((t: any) => t.function.name).join(", ");
    mockResponse.choices[0].message.content = `I have access to ${params.tools.length} tools: ${toolNames}. Ask me to use them!`;
  }

  return mockResponse;
});

// Mock the OpenAI class constructor
const MockOpenAI = jest.fn().mockImplementation(() => {
  return {
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  };
});

export default MockOpenAI;
export { MockOpenAI as OpenAI };
