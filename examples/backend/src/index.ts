import {
  createToolServer,
  registerTool,
  registry,
} from "@x402-agent-gateway/server";
import { PublicKey } from "@solana/web3.js";
import { z } from "zod";

const RECIPIENT_WALLET = process.env.RECIPIENT_WALLET as string;
const PORT = parseInt(process.env.PORT || "3000");
const DEV_MODE = process.env.DEV_MODE !== "false"; // Default to true unless explicitly set to "false"
const NETWORK = (process.env.NETWORK || "solana") as "solana" | "solana-devnet";

// USDC mint address (mainnet: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)
// For devnet, use: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
const USDC_MINT = new PublicKey(
  NETWORK === "solana"
    ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    : "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);

// USDC amounts are in micro-units (6 decimals): 0.01 USDC = 10000
const CHAT_PAYMENT_PRICE = process.env.CHAT_PAYMENT_PRICE
  ? { asset: "USDC", amount: process.env.CHAT_PAYMENT_PRICE, mint: USDC_MINT }
  : { asset: "USDC", amount: "10000", mint: USDC_MINT }; // 0.01 USDC

const server = createToolServer({
  port: PORT,
  // facilitatorUrl: "https://facilitator.x402.rs",
  facilitatorUrl: "https://facilitator.payai.network",
  recipientWallet: RECIPIENT_WALLET,
  network: NETWORK,
  devMode: DEV_MODE,
  // TODO: Make this dynamic like the other endpoints
  chatPaymentPrice: CHAT_PAYMENT_PRICE,
  openaiApiKey: process.env.OPENAI_API_KEY,
});

registerTool({
  name: "echo",
  description: "Echoes back the input message",
  inputSchema: z.object({
    message: z.string(),
  }),
  price: {
    asset: "USDC",
    amount: "10000",
    mint: USDC_MINT,
  },
  handler: async (args) => {
    console.log(`[Echo Tool] Received: ${args.message}`);
    return {
      echo: args.message,
      timestamp: new Date().toISOString(),
    };
  },
});

registerTool({
  name: "web-search",
  description: "Search the web and return results (stub implementation)",
  inputSchema: z.object({
    query: z.string(),
    limit: z.number().optional().default(5),
  }),
  price: {
    asset: "USDC",
    amount: "100000",
    mint: USDC_MINT,
  },
  handler: async (args) => {
    console.log(`[Web Search] Query: ${args.query}, Limit: ${args.limit}`);

    return {
      query: args.query,
      results: [
        {
          title: "Example Result 1",
          url: "https://example.com/1",
          snippet: `Search result for: ${args.query}`,
        },
        {
          title: "Example Result 2",
          url: "https://example.com/2",
          snippet: `Another result for: ${args.query}`,
        },
      ].slice(0, args.limit),
    };
  },
});

registerTool({
  name: "calculate",
  description: "Performs basic arithmetic calculations",
  inputSchema: z.object({
    operation: z.enum(["add", "subtract", "multiply", "divide"]),
    a: z.number(),
    b: z.number(),
  }),
  price: {
    asset: "USDC",
    amount: "5000",
    mint: USDC_MINT,
  },
  handler: async (args) => {
    console.log(`[Calculate] ${args.a} ${args.operation} ${args.b}`);

    let result: number;
    switch (args.operation) {
      case "add":
        result = args.a + args.b;
        break;
      case "subtract":
        result = args.a - args.b;
        break;
      case "multiply":
        result = args.a * args.b;
        break;
      case "divide":
        if (args.b === 0) throw new Error("Division by zero");
        result = args.a / args.b;
        break;
      default:
        throw new Error(`Unknown operation: ${args.operation}`);
    }

    return {
      operation: args.operation,
      a: args.a,
      b: args.b,
      result,
    };
  },
});

registerTool({
  name: "url-fetcher",
  description: "Fetches raw HTML content from a validated URL",
  inputSchema: z.object({
    url: z.string().url(),
  }),
  price: {
    asset: "USDC",
    amount: "10000",
    mint: USDC_MINT,
  },
  handler: async (args) => {
    console.log(`[URL Fetcher] Fetching: ${args.url}`);

    try {
      const response = await fetch(args.url, {
        headers: {
          "User-Agent": "x402-agent-gateway/1.0",
        },
      });

      const html = await response.text();
      const preview = html.substring(0, 500);

      return {
        url: args.url,
        statusCode: response.status,
        contentLength: html.length,
        preview,
        fullContent: html,
      };
    } catch (error) {
      throw new Error(
        `Failed to fetch URL: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  },
});

registerTool({
  name: "summarizer",
  description: "Accepts text input and returns a shortened summary",
  inputSchema: z.object({
    text: z.string(),
    maxLength: z.number().optional().default(100),
  }),
  price: {
    asset: "USDC",
    amount: "20000",
    mint: USDC_MINT,
  },
  handler: async (args) => {
    console.log(`[Summarizer] Summarizing ${args.text.length} characters`);

    const sentences = args.text.match(/[^.!?]+[.!?]+/g) || [args.text];

    let summary = "";
    for (const sentence of sentences) {
      if ((summary + sentence).length <= args.maxLength) {
        summary += sentence;
      } else {
        break;
      }
    }

    if (!summary) {
      summary = args.text.substring(0, args.maxLength) + "...";
    }

    return {
      originalLength: args.text.length,
      summaryLength: summary.length,
      summary: summary.trim(),
    };
  },
});

server.start();

console.log("=".repeat(60));
console.log("x402 Tool Server - Example Backend");
console.log("=".repeat(60));
console.log("Available tools:");
const registeredTools = registry.getAll();
for (const tool of registeredTools) {
  console.log(`  - ${tool.name}: ${tool.description}`);
}
console.log("=".repeat(60));
console.log(
  `Dev Mode: ${
    DEV_MODE ? "ENABLED (payments disabled for testing)" : "DISABLED"
  }`
);
console.log(
  `Chat Payments: ${
    CHAT_PAYMENT_PRICE
      ? `${CHAT_PAYMENT_PRICE.amount} ${CHAT_PAYMENT_PRICE.asset}`
      : "FREE (disabled)"
  }`
);
console.log("=".repeat(60));
