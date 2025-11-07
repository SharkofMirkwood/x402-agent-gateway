import { Router, Request, Response } from "express";
import { RegisteredTool } from "./types";
import { registry } from "./registry";
import {
  setPaymentConfig,
  createPaymentMiddleware,
} from "./payment-middleware";
import OpenAI from "openai";
import { toJSONSchema } from "zod";

export interface RouterConfig {
  recipientWallet: string;
  network: string;
  facilitatorUrl: string;
  devMode?: boolean;
  chatPaymentPrice?: { asset: string; amount: string } | null;
  openaiApiKey?: string;
}

function convertToolsToOpenAIFormat(tools: RegisteredTool[]): Array<{
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}> {
  return tools.map((tool) => {
    const inputSchema = toJSONSchema(tool.inputSchema);
    return {
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: inputSchema,
      },
    };
  });
}

export function createX402Router(config: RouterConfig): Router {
  const router = Router();

  setPaymentConfig({
    recipientWallet: config.recipientWallet,
    network: config.network,
    facilitatorUrl: config.facilitatorUrl,
    devMode: config.devMode,
  });

  if (!config.openaiApiKey) {
    throw new Error(
      "OpenAI API key is required. Please set openaiApiKey in server config."
    );
  }

  const openai = new OpenAI({ apiKey: config.openaiApiKey });

  router.get("/tools", async (req: Request, res: Response) => {
    try {
      const metadata = await registry.getMetadata();
      res.json(metadata);
    } catch (error) {
      res.status(500).json({
        code: "INTERNAL_ERROR",
        message:
          error instanceof Error ? error.message : "Failed to retrieve tools",
      });
    }
  });

  router.post("/tools/:name/invoke", async (req: Request, res: Response) => {
    const toolName = req.params.name;
    const tool = registry.get(toolName);

    if (!tool) {
      return res.status(404).json({
        code: "TOOL_NOT_FOUND",
        message: `Tool ${toolName} not found`,
      });
    }

    const middleware = createPaymentMiddleware(tool.price);

    middleware(req, res, async () => {
      try {
        const validatedInput = tool.inputSchema.parse(req.body);
        const result = await tool.handler(validatedInput);

        if (tool.outputSchema) {
          const validatedOutput = tool.outputSchema.parse(result);
          res.json(validatedOutput);
        } else {
          res.json(result);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "ZodError") {
          res.status(400).json({
            code: "VALIDATION_ERROR",
            message: "Input validation failed",
            retriable: false,
            details: error.message,
          });
        } else {
          res.status(500).json({
            code: "EXECUTION_ERROR",
            message:
              error instanceof Error ? error.message : "Tool execution failed",
            retriable: true,
          });
        }
      }
    });
  });

  router.post("/v1/chat/completions", async (req: Request, res: Response) => {
    const chatPrice =
      config.chatPaymentPrice !== null
        ? config.chatPaymentPrice || { asset: "SOL", amount: "0.0001" }
        : null;

    const handleChatRequest = async (req: Request, res: Response) => {
      try {
        const { model, messages, temperature, max_tokens } = req.body;

        if (!messages || !Array.isArray(messages)) {
          return res.status(400).json({
            code: "INVALID_REQUEST",
            message: "Messages array is required",
          });
        }

        const availableTools = registry.getAll();
        const allOpenaiTools = convertToolsToOpenAIFormat(availableTools);
        const conversationMessages = [...messages];

        const toolsToSend =
          allOpenaiTools.length > 0 ? allOpenaiTools : undefined;

        // The frontend will handle tool execution if OpenAI requests tools
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: conversationMessages as any,
          tools: toolsToSend,
          tool_choice: toolsToSend ? "auto" : undefined,
          temperature: temperature,
          max_tokens: max_tokens,
        });

        const choice = response.choices[0];
        if (!choice) {
          return res.status(500).json({
            code: "CHAT_ERROR",
            message: "No response from OpenAI",
          });
        }

        const responseMessage: any = {
          role: "assistant",
          content: choice.message.content,
        };

        // The frontend will execute these tools and send results back in the next request
        if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
          responseMessage.tool_calls = choice.message.tool_calls.map(
            (tc: any) => ({
              id: tc.id,
              type: tc.type,
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
              },
            })
          );
        }

        // If it includes tool_calls, the frontend will handle execution
        res.json({
          id: response.id,
          object: response.object,
          created: response.created,
          model: response.model,
          choices: [
            {
              index: 0,
              message: responseMessage,
              finish_reason: choice.finish_reason,
            },
          ],
          usage: response.usage,
        });
      } catch (error) {
        if (error instanceof Error && "status" in error) {
          const status = (error as any).status;
          const message = (error as any).message || error.message;
          return res.status(status || 500).json({
            code: "OPENAI_API_ERROR",
            message: message,
          });
        }

        res.status(500).json({
          code: "CHAT_ERROR",
          message:
            error instanceof Error ? error.message : "Chat completion failed",
        });
      }
    };

    if (chatPrice) {
      const middleware = createPaymentMiddleware(chatPrice);
      middleware(req, res, () => handleChatRequest(req, res));
    } else {
      await handleChatRequest(req, res);
    }
  });

  return router;
}
