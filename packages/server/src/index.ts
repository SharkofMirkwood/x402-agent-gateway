import { ToolServer, createX402Server } from "./server";
import { createX402Router, RouterConfig } from "./router";
import { registry } from "./registry";
import {
  RegisteredTool,
  ServerConfig,
  ToolMetadata,
  PaymentPrice,
  PaymentRequirements,
  ChatMessage,
  ChatPaymentPrice,
  TokenBasedPricing,
} from "./types";

export function createToolServer(config: ServerConfig): ToolServer {
  return new ToolServer(config);
}

export function registerTool(tool: RegisteredTool): void {
  registry.register(tool);
}

export {
  ToolServer,
  RegisteredTool,
  ServerConfig,
  ToolMetadata,
  PaymentPrice,
  PaymentRequirements,
  RouterConfig,
  createX402Server,
  createX402Router,
  ChatPaymentPrice,
  ChatMessage,
  TokenBasedPricing,
};
export { registry };
