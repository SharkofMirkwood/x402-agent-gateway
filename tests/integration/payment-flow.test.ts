import request from "supertest";
import {
  Keypair,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { z } from "zod";
import {
  createX402Server,
  registerTool,
  registry,
} from "@x402-agent-gateway/server";
import { X402Client } from "@x402-agent-gateway/client";
import { TestValidator, withTestValidator } from "./test-validator";

describe("Payment Flow Integration Tests", () => {
  describe("Full Payment Flow", () => {
    // Skip tests that require a real facilitator until we have a test facilitator setup
    it.skip("should complete full 402 payment flow with actual blockchain transaction", async () => {
      await withTestValidator(async (validator) => {
        const originalRpcUrl = process.env.SOLANA_RPC_URL;
        process.env.SOLANA_RPC_URL = validator.getRpcUrl();

        try {
          const recipientKeypair = await validator.createFundedWallet(
            LAMPORTS_PER_SOL
          );
          const clientKeypair = await validator.createFundedWallet(
            2 * LAMPORTS_PER_SOL
          );

          registry.clear();
          registerTool({
            name: "test-tool",
            description: "Test tool for payment flow",
            inputSchema: z.object({ message: z.string() }),
            price: { asset: "SOL", amount: "0.001" },
            handler: async (input) => ({
              result: `Processed: ${input.message}`,
            }),
          });

          const server = createX402Server({
            recipientWallet: recipientKeypair.publicKey.toString(),
            network: "solana-devnet",
            devMode: false,
            port: 3001,
            openaiApiKey: "test-key",
            facilitatorUrl: "https://facilitator.test",
          });

          const app = server.getApp();

          const res1 = await request(app)
            .post("/tools/test-tool/invoke")
            .send({ message: "hello" });

          expect(res1.status).toBe(402);
          expect(res1.body.code).toBe("PAYMENT_REQUIRED");
          expect(res1.body.payment_challenge).toBeDefined();

          const challenge = res1.body.payment_challenge;
          expect(challenge.amount).toBe("0.001");
          expect(challenge.asset).toBe("SOL");
          expect(challenge.recipient).toBe(
            recipientKeypair.publicKey.toString()
          );
          expect(challenge.nonce).toBeDefined();

          const connection = validator.getConnection();
          const lamports = parseFloat(challenge.amount) * LAMPORTS_PER_SOL;

          const transaction = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: clientKeypair.publicKey,
              toPubkey: recipientKeypair.publicKey,
              lamports,
            })
          );

          const { blockhash } = await connection.getLatestBlockhash();
          transaction.recentBlockhash = blockhash;
          transaction.feePayer = clientKeypair.publicKey;
          transaction.sign(clientKeypair);

          const serializedTx = transaction.serialize();
          const txBase64 = Buffer.from(serializedTx).toString("base64");

          const paymentData = {
            nonce: challenge.nonce,
            transaction: txBase64,
          };

          const paymentProof = Buffer.from(
            JSON.stringify(paymentData)
          ).toString("base64");

          const recipientBalanceBefore = await connection.getBalance(
            recipientKeypair.publicKey
          );

          const res2 = await request(app)
            .post("/tools/test-tool/invoke")
            .set("X-Payment", paymentProof)
            .send({ message: "hello" });

          expect(res2.status).toBe(200);
          expect(res2.body.result).toBe("Processed: hello");

          await new Promise((resolve) => setTimeout(resolve, 1000));

          const recipientBalanceAfter = await connection.getBalance(
            recipientKeypair.publicKey
          );
          expect(recipientBalanceAfter).toBeGreaterThan(recipientBalanceBefore);
          expect(recipientBalanceAfter - recipientBalanceBefore).toBe(lamports);
        } finally {
          if (originalRpcUrl !== undefined) {
            process.env.SOLANA_RPC_URL = originalRpcUrl;
          } else {
            delete process.env.SOLANA_RPC_URL;
          }
        }
      });
    }, 60000);

    // Skip tests that require a real facilitator until we have a test facilitator setup
    it.skip("should reject invalid payment proof", async () => {
      await withTestValidator(async (validator) => {
        const originalRpcUrl = process.env.SOLANA_RPC_URL;
        process.env.SOLANA_RPC_URL = validator.getRpcUrl();

        try {
          const recipientKeypair = await validator.createFundedWallet(
            LAMPORTS_PER_SOL
          );

          registry.clear();
          registerTool({
            name: "test-tool",
            description: "Test tool",
            inputSchema: z.object({ message: z.string() }),
            price: { asset: "SOL", amount: "0.001" },
            handler: async (input) => ({ result: "success" }),
          });

          const server = createX402Server({
            recipientWallet: recipientKeypair.publicKey.toString(),
            network: "solana-devnet",
            devMode: false,
            port: 3002,
            openaiApiKey: "test-key",
            facilitatorUrl: "https://facilitator.test",
          });

          const app = server.getApp();

          const res = await request(app)
            .post("/tools/test-tool/invoke")
            .set("X-Payment", "invalid-base64-proof")
            .send({ message: "hello" });

          expect(res.status).toBe(400);
          expect(res.body.code).toBe("PAYMENT_ERROR");
        } finally {
          if (originalRpcUrl !== undefined) {
            process.env.SOLANA_RPC_URL = originalRpcUrl;
          } else {
            delete process.env.SOLANA_RPC_URL;
          }
        }
      });
    }, 60000);

    // Skip tests that require a real facilitator until we have a test facilitator setup
    it.skip("should prevent replay attacks with consumed nonces", async () => {
      await withTestValidator(async (validator) => {
        const originalRpcUrl = process.env.SOLANA_RPC_URL;
        process.env.SOLANA_RPC_URL = validator.getRpcUrl();

        try {
          const recipientKeypair = await validator.createFundedWallet(
            LAMPORTS_PER_SOL
          );
          const clientKeypair = await validator.createFundedWallet(
            3 * LAMPORTS_PER_SOL
          );

          registry.clear();
          registerTool({
            name: "test-tool",
            description: "Test tool",
            inputSchema: z.object({ message: z.string() }),
            price: { asset: "SOL", amount: "0.001" },
            handler: async (input) => ({
              result: `Processed: ${input.message}`,
            }),
          });

          const server = createX402Server({
            recipientWallet: recipientKeypair.publicKey.toString(),
            network: "solana-devnet",
            devMode: false,
            port: 3003,
            openaiApiKey: "test-key",
            facilitatorUrl: "https://facilitator.test",
          });

          const app = server.getApp();

          const res1 = await request(app)
            .post("/tools/test-tool/invoke")
            .send({ message: "hello" });

          expect(res1.status).toBe(402);
          const challenge = res1.body.payment_challenge;

          const connection = validator.getConnection();
          const lamports = parseFloat(challenge.amount) * LAMPORTS_PER_SOL;

          const transaction = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: clientKeypair.publicKey,
              toPubkey: recipientKeypair.publicKey,
              lamports,
            })
          );

          const { blockhash } = await connection.getLatestBlockhash();
          transaction.recentBlockhash = blockhash;
          transaction.feePayer = clientKeypair.publicKey;
          transaction.sign(clientKeypair);

          const serializedTx = transaction.serialize();
          const txBase64 = Buffer.from(serializedTx).toString("base64");

          const paymentData = {
            nonce: challenge.nonce,
            transaction: txBase64,
          };

          const paymentProof = Buffer.from(
            JSON.stringify(paymentData)
          ).toString("base64");

          const res2 = await request(app)
            .post("/tools/test-tool/invoke")
            .set("X-Payment", paymentProof)
            .send({ message: "hello" });

          expect(res2.status).toBe(200);

          const res3 = await request(app)
            .post("/tools/test-tool/invoke")
            .set("X-Payment", paymentProof)
            .send({ message: "hello again" });

          expect(res3.status).toBe(400);
          expect(res3.body.code).toBe("INVALID_NONCE");
        } finally {
          if (originalRpcUrl !== undefined) {
            process.env.SOLANA_RPC_URL = originalRpcUrl;
          } else {
            delete process.env.SOLANA_RPC_URL;
          }
        }
      });
    }, 60000);
  });

  describe("Dev Mode", () => {
    it("should bypass payment verification in dev mode", async () => {
      registry.clear();
      registerTool({
        name: "test-tool",
        description: "Test tool",
        inputSchema: z.object({ message: z.string() }),
        price: { asset: "SOL", amount: "0.001" },
        handler: async (input) => ({ result: `Processed: ${input.message}` }),
      });

      const server = createX402Server({
        recipientWallet: "11111111111111111111111111111111",
        network: "solana-devnet",
        devMode: true,
        port: 3004,
        openaiApiKey: "test-key",
        facilitatorUrl: "https://facilitator.test",
      });

      const app = server.getApp();

      const res = await request(app)
        .post("/tools/test-tool/invoke")
        .send({ message: "hello" });

      expect(res.status).toBe(200);
      expect(res.body.result).toBe("Processed: hello");
    });
  });

  describe("Client SDK Integration", () => {
    // Skip tests that require a real facilitator until we have a test facilitator setup
    it.skip("should handle automatic payment retry with client SDK", async () => {
      await withTestValidator(async (validator) => {
        const originalRpcUrl = process.env.SOLANA_RPC_URL;
        process.env.SOLANA_RPC_URL = validator.getRpcUrl();

        try {
          const recipientKeypair = await validator.createFundedWallet(
            LAMPORTS_PER_SOL
          );
          const clientKeypair = await validator.createFundedWallet(
            2 * LAMPORTS_PER_SOL
          );

          registry.clear();
          registerTool({
            name: "echo",
            description: "Echo tool",
            inputSchema: z.object({ message: z.string() }),
            price: { asset: "SOL", amount: "0.0005" },
            handler: async (input) => ({ echo: input.message }),
          });

          const server = createX402Server({
            recipientWallet: recipientKeypair.publicKey.toString(),
            network: "solana-devnet",
            devMode: false,
            port: 3005,
            openaiApiKey: "test-key",
            facilitatorUrl: "https://facilitator.test",
          });

          server.start();

          await new Promise((resolve) => setTimeout(resolve, 1000));

          const client = new X402Client({
            baseURL: "http://localhost:3005",
            wallet: clientKeypair,
            network: "solana-devnet",
          });

          const result = await client.tools.invoke("echo", {
            message: "test payment",
          });

          expect(result).toEqual({ echo: "test payment" });

          const recipientBalance = await validator
            .getConnection()
            .getBalance(recipientKeypair.publicKey);
          expect(recipientBalance).toBeGreaterThan(LAMPORTS_PER_SOL);
        } finally {
          if (originalRpcUrl !== undefined) {
            process.env.SOLANA_RPC_URL = originalRpcUrl;
          } else {
            delete process.env.SOLANA_RPC_URL;
          }
        }
      });
    }, 60000);
  });
});
