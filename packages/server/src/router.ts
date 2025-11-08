import { Router, Request, Response } from "express";
import express from "express";
import {
  RegisteredTool,
  ChatPaymentPrice,
  ChatMessage,
  TokenBasedPricing,
  PaymentPrice,
} from "./types";
import { registry } from "./registry";
import {
  setPaymentConfig,
  createPaymentMiddleware,
} from "./payment-middleware";
import OpenAI from "openai";
import { toJSONSchema } from "zod";
import { encoding_for_model } from "tiktoken";

export interface RouterConfig {
  recipientWallet: string;
  network: string;
  facilitatorUrl: string;
  devMode?: boolean;
  chatPaymentPrice?: ChatPaymentPrice;
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

/**
 * Checks if an object is a TokenBasedPricing configuration
 */
function isTokenBasedPricing(
  price: ChatPaymentPrice
): price is TokenBasedPricing {
  return (
    price !== null &&
    typeof price === "object" &&
    "costPerToken" in price &&
    !("amount" in price)
  );
}

/**
 * Calculates the payment price based on token count
 */
async function calculateTokenBasedPrice(
  pricing: TokenBasedPricing,
  messages: ChatMessage[]
): Promise<PaymentPrice> {
  try {
    const model = pricing.model || "gpt-4o";
    const encoding = encoding_for_model(model as any);

    // Count tokens in all messages
    let totalTokens = 0;
    for (const message of messages) {
      // Count tokens in message content
      if (message.content) {
        totalTokens += encoding.encode(message.content).length;
      }

      // Count tokens in tool calls if present
      if (message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          if (toolCall.function) {
            totalTokens += encoding.encode(toolCall.function.name).length;
            totalTokens += encoding.encode(toolCall.function.arguments).length;
          }
        }
      }
    }

    encoding.free();

    // Calculate total price: base amount + (tokens * cost per token)
    const baseAmount = parseFloat(pricing.baseAmount || "0");
    const costPerToken = parseFloat(pricing.costPerToken);
    let totalAmount = baseAmount + totalTokens * costPerToken;

    // Apply min/max constraints if specified
    if (pricing.min !== undefined) {
      totalAmount = Math.max(totalAmount, parseFloat(pricing.min));
    }
    if (pricing.max !== undefined) {
      totalAmount = Math.min(totalAmount, parseFloat(pricing.max));
    }

    return {
      asset: pricing.asset,
      amount: totalAmount.toString(),
      mint: pricing.mint,
    };
  } catch (error) {
    // Fallback to base amount if token counting fails
    console.warn("Failed to count tokens, using base amount:", error);
    const baseAmount = parseFloat(pricing.baseAmount || "0");
    let fallbackAmount = baseAmount;

    // Apply min constraint if specified
    if (pricing.min !== undefined) {
      fallbackAmount = Math.max(fallbackAmount, parseFloat(pricing.min));
    }

    return {
      asset: pricing.asset,
      amount: fallbackAmount.toString(),
      mint: pricing.mint,
    };
  }
}

export function createX402Router(config: RouterConfig): Router {
  const router = Router();

  router.use(express.json());

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

    // Handle payment middleware - we need to check if payment is required
    // before processing the request, but dynamic pricing needs messages
    // So we'll handle it inside the request handler
    const { messages } = req.body;

    if (
      config.chatPaymentPrice !== null &&
      config.chatPaymentPrice !== undefined
    ) {
      // Create a pricing function that the middleware can use
      // This ensures the price is calculated consistently for both
      // payment requirements creation and verification
      let pricingFunction: (body: any) => PaymentPrice | Promise<PaymentPrice>;

      const chatPrice = config.chatPaymentPrice;

      if (typeof chatPrice === "function") {
        // Custom function pricing - wrap it to extract messages
        pricingFunction = async (body: any) => {
          const msgs = body.messages;
          if (!msgs || !Array.isArray(msgs)) {
            throw new Error("Messages array is required");
          }
          return await chatPrice(msgs);
        };
      } else if (isTokenBasedPricing(chatPrice)) {
        // Token-based pricing - create a function that calculates from messages
        const tokenPricing = chatPrice; // Type narrowing
        pricingFunction = async (body: any) => {
          const msgs = body.messages;
          if (!msgs || !Array.isArray(msgs)) {
            throw new Error("Messages array is required");
          }
          return await calculateTokenBasedPrice(tokenPricing, msgs);
        };
      } else {
        // Static pricing - return a function that always returns the same price
        const staticPrice = chatPrice; // Type narrowing to PaymentPrice
        pricingFunction = () => Promise.resolve(staticPrice);
      }

      const middleware = createPaymentMiddleware(pricingFunction);
      return middleware(req, res, () => handleChatRequest(req, res));
    }

    await handleChatRequest(req, res);
  });

  return router;
}
