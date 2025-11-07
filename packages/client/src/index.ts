// Import polyfills first to ensure Buffer is available before any other code runs
import "./polyfills";

import { X402Client } from "./client";
import {
  ClientConfig,
  PaymentRequirements,
  ToolMetadata,
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from "./types";

export function createClient(config: ClientConfig): X402Client {
  return new X402Client(config);
}

export {
  X402Client,
  ClientConfig,
  PaymentRequirements,
  ToolMetadata,
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
};
