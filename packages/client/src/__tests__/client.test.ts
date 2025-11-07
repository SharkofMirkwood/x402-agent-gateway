import { X402Client } from "../client";
import { Keypair } from "@solana/web3.js";
import { HttpClient } from "../http-client";

jest.mock("../http-client");

describe("X402Client", () => {
  let client: X402Client;
  let wallet: Keypair;
  let mockHttpClient: jest.Mocked<HttpClient>;

  beforeEach(() => {
    wallet = Keypair.generate();
    jest.clearAllMocks();

    mockHttpClient = {
      get: jest.fn(),
      post: jest.fn(),
    } as any;

    (HttpClient as jest.Mock).mockImplementation(() => mockHttpClient);

    client = new X402Client({
      baseURL: "http://localhost:3000",
      wallet,
      network: "solana-devnet",
    });
  });

  describe("Client Initialization", () => {
    test("should create client with tools API", () => {
      expect(client.tools).toBeDefined();
      expect(client.tools.list).toBeDefined();
      expect(client.tools.invoke).toBeDefined();
    });

    test("should create client with chat API", () => {
      expect(client.chat).toBeDefined();
      expect(client.chat.completions).toBeDefined();
      expect(client.chat.completions.create).toBeDefined();
    });

    test("should initialize with provided config", () => {
      expect(HttpClient).toHaveBeenCalledWith(
        "http://localhost:3000",
        wallet,
        "solana-devnet"
      );
    });

    test("should accept different networks", () => {
      const devnetClient = new X402Client({
        baseURL: "http://localhost:3000",
        wallet,
        network: "solana-devnet",
      });

      expect(devnetClient).toBeDefined();
    });

    test("should accept mainnet network", () => {
      const mainnetClient = new X402Client({
        baseURL: "http://localhost:3000",
        wallet,
        network: "solana",
      });

      expect(mainnetClient).toBeDefined();
    });
  });

  describe("Tools API", () => {
    describe("list()", () => {
      test("should fetch list of available tools", async () => {
        const mockTools = [
          {
            name: "echo",
            description: "Echo tool",
            inputSchema: {},
            price: { asset: "SOL", amount: "0.001" },
          },
          {
            name: "calculate",
            description: "Calculator",
            inputSchema: {},
            price: { asset: "SOL", amount: "0.002" },
          },
        ];

        mockHttpClient.get.mockResolvedValue(mockTools);

        const tools = await client.tools.list();

        expect(mockHttpClient.get).toHaveBeenCalledWith("/tools");
        expect(tools).toEqual(mockTools);
        expect(tools).toHaveLength(2);
      });

      test("should return empty array when no tools available", async () => {
        mockHttpClient.get.mockResolvedValue([]);

        const tools = await client.tools.list();

        expect(tools).toEqual([]);
        expect(tools).toHaveLength(0);
      });

      test("should handle errors when fetching tools", async () => {
        mockHttpClient.get.mockRejectedValue(new Error("Network error"));

        await expect(client.tools.list()).rejects.toThrow("Network error");
      });
    });

    describe("invoke()", () => {
      test("should invoke a tool with arguments", async () => {
        const mockResult = { result: "hello world" };
        mockHttpClient.post.mockResolvedValue(mockResult);

        const result = await client.tools.invoke("echo", {
          message: "hello world",
        });

        expect(mockHttpClient.post).toHaveBeenCalledWith("/tools/echo/invoke", {
          message: "hello world",
        });
        expect(result).toEqual(mockResult);
      });

      test("should invoke tool with complex arguments", async () => {
        const mockResult = { sum: 15 };
        mockHttpClient.post.mockResolvedValue(mockResult);

        const result = await client.tools.invoke("calculate", {
          operation: "add",
          numbers: [5, 10],
        });

        expect(mockHttpClient.post).toHaveBeenCalledWith(
          "/tools/calculate/invoke",
          { operation: "add", numbers: [5, 10] }
        );
        expect(result).toEqual(mockResult);
      });

      test("should invoke tool with no arguments", async () => {
        const mockResult = { status: "ok" };
        mockHttpClient.post.mockResolvedValue(mockResult);

        const result = await client.tools.invoke("health-check", {});

        expect(mockHttpClient.post).toHaveBeenCalledWith(
          "/tools/health-check/invoke",
          {}
        );
        expect(result).toEqual(mockResult);
      });

      test("should handle tool invocation errors", async () => {
        mockHttpClient.post.mockRejectedValue(
          new Error("Tool execution failed")
        );

        await expect(client.tools.invoke("failing-tool", {})).rejects.toThrow(
          "Tool execution failed"
        );
      });

      test("should preserve typed response", async () => {
        interface EchoResult {
          message: string;
          timestamp: number;
        }

        const mockResult: EchoResult = {
          message: "test",
          timestamp: Date.now(),
        };
        mockHttpClient.post.mockResolvedValue(mockResult);

        const result = await client.tools.invoke<EchoResult>("echo", {
          message: "test",
        });

        expect(result.message).toBe("test");
        expect(result.timestamp).toBeDefined();
      });
    });
  });

  describe("Chat API", () => {
    describe("completions.create()", () => {
      test("should create chat completion", async () => {
        const mockResponse = {
          id: "chatcmpl-123",
          object: "chat.completion" as const,
          created: Date.now(),
          model: "gpt-4",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant" as const,
                content: "Hello! How can I help you?",
              },
              finish_reason: "stop",
            },
          ],
        };

        mockHttpClient.post.mockResolvedValue(mockResponse);

        const result = await client.chat.completions.create({
          model: "gpt-4",
          messages: [{ role: "user", content: "Hello!" }],
        });

        expect(mockHttpClient.post).toHaveBeenCalledWith(
          "/v1/chat/completions",
          {
            model: "gpt-4",
            messages: [{ role: "user", content: "Hello!" }],
          }
        );
        expect(result).toEqual(mockResponse);
      });

      test("should handle multi-turn conversations", async () => {
        const mockResponse = {
          id: "chatcmpl-456",
          object: "chat.completion" as const,
          created: Date.now(),
          model: "gpt-4",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant" as const,
                content: "The capital is Paris.",
              },
              finish_reason: "stop",
            },
          ],
        };

        mockHttpClient.post.mockResolvedValue(mockResponse);

        const result = await client.chat.completions.create({
          model: "gpt-4",
          messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: "What is the capital of France?" },
            { role: "assistant", content: "The capital of France is Paris." },
            { role: "user", content: "Tell me more about it." },
          ],
        });

        expect(result.choices[0].message.content).toBe("The capital is Paris.");
      });

      test("should support tool calls in messages", async () => {
        const mockResponse = {
          id: "chatcmpl-789",
          object: "chat.completion" as const,
          created: Date.now(),
          model: "gpt-4",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant" as const,
                content: "",
                tool_calls: [
                  {
                    id: "call_123",
                    type: "function" as const,
                    function: {
                      name: "calculate",
                      arguments: JSON.stringify({
                        operation: "add",
                        numbers: [2, 2],
                      }),
                    },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        };

        mockHttpClient.post.mockResolvedValue(mockResponse);

        const result = await client.chat.completions.create({
          model: "gpt-4",
          messages: [{ role: "user", content: "What is 2+2?" }],
          tools: "auto",
        });

        expect(result.choices[0].message.tool_calls).toBeDefined();
        expect(result.choices[0].message.tool_calls![0].function.name).toBe(
          "calculate"
        );
      });

      test("should handle temperature parameter", async () => {
        const mockResponse = {
          id: "chatcmpl-temp",
          object: "chat.completion" as const,
          created: Date.now(),
          model: "gpt-4",
          choices: [
            {
              index: 0,
              message: { role: "assistant" as const, content: "Response" },
              finish_reason: "stop",
            },
          ],
        };

        mockHttpClient.post.mockResolvedValue(mockResponse);

        await client.chat.completions.create({
          model: "gpt-4",
          messages: [{ role: "user", content: "Test" }],
          temperature: 0.7,
        });

        expect(mockHttpClient.post).toHaveBeenCalledWith(
          "/v1/chat/completions",
          expect.objectContaining({ temperature: 0.7 })
        );
      });

      test("should handle max_tokens parameter", async () => {
        const mockResponse = {
          id: "chatcmpl-tokens",
          object: "chat.completion" as const,
          created: Date.now(),
          model: "gpt-4",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant" as const,
                content: "Short response",
              },
              finish_reason: "length",
            },
          ],
        };

        mockHttpClient.post.mockResolvedValue(mockResponse);

        await client.chat.completions.create({
          model: "gpt-4",
          messages: [{ role: "user", content: "Test" }],
          max_tokens: 50,
        });

        expect(mockHttpClient.post).toHaveBeenCalledWith(
          "/v1/chat/completions",
          expect.objectContaining({ max_tokens: 50 })
        );
      });

      test("should include usage statistics when available", async () => {
        const mockResponse = {
          id: "chatcmpl-usage",
          object: "chat.completion" as const,
          created: Date.now(),
          model: "gpt-4",
          choices: [
            {
              index: 0,
              message: { role: "assistant" as const, content: "Response" },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
        };

        mockHttpClient.post.mockResolvedValue(mockResponse);

        const result = await client.chat.completions.create({
          model: "gpt-4",
          messages: [{ role: "user", content: "Test" }],
        });

        expect(result.usage).toBeDefined();
        expect(result.usage?.total_tokens).toBe(15);
      });

      test("should handle chat completion errors", async () => {
        mockHttpClient.post.mockRejectedValue(new Error("API error"));

        await expect(
          client.chat.completions.create({
            model: "gpt-4",
            messages: [{ role: "user", content: "Test" }],
          })
        ).rejects.toThrow("API error");
      });
    });
  });

  describe("Error Scenarios", () => {
    test("should propagate 402 payment errors", async () => {
      const paymentError = {
        response: {
          status: 402,
          data: {
            code: "PAYMENT_REQUIRED",
            payment_challenge: {
              amount: "0.001",
              asset: "SOL",
            },
          },
        },
      };

      mockHttpClient.post.mockRejectedValue(paymentError);

      await expect(client.tools.invoke("test", {})).rejects.toMatchObject(
        paymentError
      );
    });

    test("should propagate validation errors", async () => {
      const validationError = {
        response: {
          status: 400,
          data: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
          },
        },
      };

      mockHttpClient.post.mockRejectedValue(validationError);

      await expect(
        client.tools.invoke("test", { invalid: "data" })
      ).rejects.toMatchObject(validationError);
    });
  });
});
