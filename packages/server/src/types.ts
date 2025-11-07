import { PublicKey } from "@solana/web3.js";
import { ZodSchema } from "zod";

export interface PaymentPrice {
  asset: string;
  amount: string;
  mint?: PublicKey;
}

export type Network = "solana" | "solana-devnet";

// x402 spec-compliant PaymentRequirements
export interface PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string; // uint256 as string
  resource: string;
  description: string;
  outputSchema?: object | null;
  payTo: string; // Address to pay value to
  maxTimeoutSeconds: number;
  asset: string;
  extra: object | null; // Scheme-specific extra information (e.g., mint for Solana)

  // Internal fields (not part of x402 spec, used for our internal tracking)
  facilitatorUrl?: string; // Internal facilitator URL
}

export interface ToolMetadata {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  outputSchema?: Record<string, any>;
  price: PaymentPrice | ((args: any) => PaymentPrice | Promise<PaymentPrice>);
}

export interface RegisteredTool {
  name: string;
  description: string;
  inputSchema: ZodSchema;
  outputSchema?: ZodSchema;
  price: PaymentPrice | ((args: any) => PaymentPrice | Promise<PaymentPrice>);
  handler: (args: any) => Promise<any>;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?:
    | "auto"
    | Array<{
        type: "function";
        function: {
          name: string;
          description: string;
          parameters: Record<string, any>;
        };
      }>;
  temperature?: number;
  max_tokens?: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ServerConfig {
  port?: number;
  facilitatorUrl: string;
  recipientWallet: string;
  network: Network;
  devMode?: boolean;
  openaiApiKey?: string;
  chatPaymentPrice?: PaymentPrice | null;
}
