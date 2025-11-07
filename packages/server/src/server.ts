import express, { Express } from "express";
import cors from "cors";
import { PublicKey } from "@solana/web3.js";
import { ServerConfig } from "./types";
import { registry } from "./registry";
import { createX402Router } from "./router";

export class ToolServer {
  private app: Express;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    try {
      new PublicKey(config.recipientWallet);
    } catch (error) {
      throw new Error(
        `Invalid recipient wallet address: ${config.recipientWallet}. Must be a valid Solana public key.`
      );
    }

    if (!config.facilitatorUrl) {
      throw new Error("facilitatorUrl is required");
    }

    try {
      const url = new URL(config.facilitatorUrl);
      if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("facilitatorUrl must use http or https protocol");
      }
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(
          `Invalid facilitatorUrl: ${config.facilitatorUrl}. Must be a valid URL.`
        );
      }
      throw error;
    }

    this.config = config;
    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());

    this.setupRoutes();
  }

  private setupRoutes(): void {
    const router = createX402Router({
      recipientWallet: this.config.recipientWallet,
      network: this.config.network,
      facilitatorUrl: this.config.facilitatorUrl,
      devMode: this.config.devMode,
      chatPaymentPrice: this.config.chatPaymentPrice,
      openaiApiKey: this.config.openaiApiKey,
    });

    this.app.use("/", router);
  }

  start(): void {
    const port = this.config.port || 3000;
    this.app.listen(port, () => {
      console.log(`x402 Tool Server listening on port ${port}`);
      console.log(`Network: ${this.config.network}`);
      console.log(`Recipient: ${this.config.recipientWallet}`);
      console.log(`Dev Mode: ${this.config.devMode || false}`);
      console.log(
        `Chat Payments: ${
          this.config.chatPaymentPrice
            ? `${this.config.chatPaymentPrice.amount} ${this.config.chatPaymentPrice.asset}`
            : "FREE"
        }`
      );
    });
  }

  getApp(): Express {
    return this.app;
  }
}

export function createX402Server(config: ServerConfig): ToolServer {
  return new ToolServer(config);
}
