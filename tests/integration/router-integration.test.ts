import request from "supertest";
import express from "express";
import cors from "cors";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { z } from "zod";
import {
  createX402Router,
  registerTool,
  registry,
} from "@x402-agent-gateway/server";
import { TestValidator, withTestValidator } from "./test-validator";

describe("Router Integration Tests", () => {
  describe("Mounting on Existing Express App", () => {
    it("should mount x402 router at custom path", async () => {
      await withTestValidator(async (validator) => {
        const recipientKeypair = await validator.createFundedWallet(
          LAMPORTS_PER_SOL
        );

        registry.clear();
        registerTool({
          name: "calculate",
          description: "Calculator",
          inputSchema: z.object({ a: z.number(), b: z.number() }),
          price: { asset: "SOL", amount: "0.0001" },
          handler: async (input) => ({ result: input.a + input.b }),
        });

        const app = express();
        app.use(cors());
        app.use(express.json());

        app.get("/health", (req, res) => {
          res.json({ status: "healthy" });
        });

        const x402Router = createX402Router({
          recipientWallet: recipientKeypair.publicKey.toString(),
          network: "solana-devnet",
          devMode: true,
          openaiApiKey: "test-key",
          facilitatorUrl: "https://facilitator.test",
        });

        app.use("/api/x402", x402Router);

        const healthRes = await request(app).get("/health");
        expect(healthRes.status).toBe(200);
        expect(healthRes.body.status).toBe("healthy");

        const toolsRes = await request(app).get("/api/x402/tools");
        expect(toolsRes.status).toBe(200);
        expect(toolsRes.body).toHaveLength(1);
        expect(toolsRes.body[0].name).toBe("calculate");

        const invokeRes = await request(app)
          .post("/api/x402/tools/calculate/invoke")
          .send({ a: 5, b: 3 });

        expect(invokeRes.status).toBe(200);
        expect(invokeRes.body.result).toBe(8);
      });
    }, 60000);

    it("should work with multiple custom middleware", async () => {
      await withTestValidator(async (validator) => {
        const recipientKeypair = await validator.createFundedWallet(
          LAMPORTS_PER_SOL
        );

        registry.clear();
        registerTool({
          name: "test",
          description: "Test tool",
          inputSchema: z.object({ value: z.string() }),
          price: { asset: "SOL", amount: "0.0001" },
          handler: async (input) => ({ processed: input.value }),
        });

        const app = express();
        app.use(cors());
        app.use(express.json());

        const requestLog: string[] = [];
        app.use((req, res, next) => {
          requestLog.push(`${req.method} ${req.path}`);
          next();
        });

        app.use((req, res, next) => {
          (req as any).customHeader = "custom-value";
          next();
        });

        const x402Router = createX402Router({
          recipientWallet: recipientKeypair.publicKey.toString(),
          network: "solana-devnet",
          devMode: true,
          openaiApiKey: "test-key",
          facilitatorUrl: "https://facilitator.test",
        });

        app.use("/tools", x402Router);

        await request(app)
          .post("/tools/tools/test/invoke")
          .send({ value: "hello" });

        expect(requestLog).toContain("POST /tools/tools/test/invoke");
      });
    }, 60000);

    it("should isolate x402 routes from other app routes", async () => {
      await withTestValidator(async (validator) => {
        const recipientKeypair = await validator.createFundedWallet(
          LAMPORTS_PER_SOL
        );

        registry.clear();
        registerTool({
          name: "secure-tool",
          description: "Secure tool",
          inputSchema: z.object({ data: z.string() }),
          price: { asset: "SOL", amount: "0.001" },
          handler: async (input) => ({ encrypted: `encrypted:${input.data}` }),
        });

        const app = express();
        app.use(cors());
        app.use(express.json());

        app.get("/public/data", (req, res) => {
          res.json({ public: true });
        });

        let authCheckCalled = false;
        app.use("/secure", (req, res, next) => {
          authCheckCalled = true;
          const token = req.headers.authorization;
          if (token !== "Bearer secret-token") {
            return res.status(401).json({ error: "Unauthorized" });
          }
          next();
        });

        app.get("/secure/data", (req, res) => {
          res.json({ secure: true });
        });

        const x402Router = createX402Router({
          recipientWallet: recipientKeypair.publicKey.toString(),
          network: "solana-devnet",
          devMode: true,
          openaiApiKey: "test-key",
          facilitatorUrl: "https://facilitator.test",
        });

        app.use("/x402", x402Router);

        const publicRes = await request(app).get("/public/data");
        expect(publicRes.status).toBe(200);
        expect(publicRes.body.public).toBe(true);

        const secureRes1 = await request(app).get("/secure/data");
        expect(secureRes1.status).toBe(401);
        expect(authCheckCalled).toBe(true);

        authCheckCalled = false;

        const secureRes2 = await request(app)
          .get("/secure/data")
          .set("Authorization", "Bearer secret-token");
        expect(secureRes2.status).toBe(200);
        expect(secureRes2.body.secure).toBe(true);

        authCheckCalled = false;

        const x402Res = await request(app)
          .post("/x402/tools/secure-tool/invoke")
          .send({ data: "test" });

        expect(x402Res.status).toBe(200);
        expect(x402Res.body.encrypted).toBe("encrypted:test");
        expect(authCheckCalled).toBe(false);
      });
    }, 60000);
  });

  describe("Chat Endpoint via Router", () => {
    it("should handle chat completions through mounted router", async () => {
      await withTestValidator(async (validator) => {
        const recipientKeypair = await validator.createFundedWallet(
          LAMPORTS_PER_SOL
        );

        registry.clear();
        registerTool({
          name: "calculate",
          description: "Calculator",
          inputSchema: z.object({
            operation: z.enum(["add", "subtract", "multiply", "divide"]),
            a: z.number(),
            b: z.number(),
          }),
          price: { asset: "SOL", amount: "0.00001" },
          handler: async (input) => {
            let result: number = 0;
            switch (input.operation) {
              case "add":
                result = input.a + input.b;
                break;
              case "subtract":
                result = input.a - input.b;
                break;
              case "multiply":
                result = input.a * input.b;
                break;
              case "divide":
                result = input.a / input.b;
                break;
            }
            return { result };
          },
        });

        const app = express();
        app.use(cors());
        app.use(express.json());

        const x402Router = createX402Router({
          recipientWallet: recipientKeypair.publicKey.toString(),
          network: "solana-devnet",
          devMode: true,
          chatPaymentPrice: null,
          openaiApiKey: "test-key",
          facilitatorUrl: "https://facilitator.test",
        });

        app.use("/api", x402Router);

        const chatRes = await request(app)
          .post("/api/v1/chat/completions")
          .send({
            model: "gpt-4",
            messages: [{ role: "user", content: "What tools do you have?" }],
          });

        if (chatRes.status !== 200) {
          console.log("Error response:", chatRes.status, chatRes.body);
        }
        expect(chatRes.status).toBe(200);
        expect(chatRes.body.choices).toBeDefined();
        expect(chatRes.body.choices[0].message.content).toContain("calculate");
      });
    }, 60000);
  });
});
