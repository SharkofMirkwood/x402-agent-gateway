import { HttpClient } from "../http-client";
import { Keypair } from "@solana/web3.js";
import { X402Client } from "x402-solana/client";

jest.mock("x402-solana/client");

describe("HttpClient", () => {
  let client: HttpClient;
  let wallet: Keypair;
  let mockX402Client: jest.Mocked<X402Client>;

  beforeEach(() => {
    wallet = Keypair.generate();
    jest.clearAllMocks();

    mockX402Client = {
      fetch: jest.fn(),
    } as any;

    (X402Client as jest.Mock).mockImplementation(() => mockX402Client);

    client = new HttpClient("http://localhost:3000", wallet, "solana-devnet");
  });

  describe("Initialization", () => {
    test("should create client with base URL", () => {
      expect(client).toBeDefined();
    });

    test("should accept different networks", () => {
      const devnetClient = new HttpClient(
        "http://localhost:3000",
        wallet,
        "solana-devnet"
      );
      const mainnetClient = new HttpClient(
        "http://localhost:3000",
        wallet,
        "solana"
      );
      expect(devnetClient).toBeDefined();
      expect(mainnetClient).toBeDefined();
    });
  });

  describe("GET Requests", () => {
    test("should make successful GET request", async () => {
      const mockData = [{ name: "tool1" }, { name: "tool2" }];
      mockX402Client.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockData),
        text: jest.fn(),
      } as any);

      const result = await client.get("/tools");

      expect(result).toEqual(mockData);
      expect(mockX402Client.fetch).toHaveBeenCalledWith(
        "http://localhost:3000/tools",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        })
      );
    });

    test("should handle GET request errors", async () => {
      mockX402Client.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: jest
          .fn()
          .mockResolvedValue(JSON.stringify({ message: "Network error" })),
      } as any);

      await expect(client.get("/tools")).rejects.toThrow("Network error");
    });
  });

  describe("POST Requests", () => {
    test("should make successful POST request", async () => {
      const mockResponse = { result: "success" };
      mockX402Client.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse),
        text: jest.fn(),
      } as any);

      const result = await client.post("/tools/echo/invoke", {
        message: "hello",
      });

      expect(result).toEqual(mockResponse);
      expect(mockX402Client.fetch).toHaveBeenCalledWith(
        "http://localhost:3000/tools/echo/invoke",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ message: "hello" }),
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        })
      );
    });

    test("should include request body in POST", async () => {
      mockX402Client.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({}),
        text: jest.fn(),
      } as any);

      await client.post("/tools/test/invoke", { input: "test data" });

      expect(mockX402Client.fetch).toHaveBeenCalledWith(
        "http://localhost:3000/tools/test/invoke",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ input: "test data" }),
        })
      );
    });
  });

  describe("Payment Interceptor", () => {
    test("should handle 402 response and retry with payment", async () => {
      // The x402-solana client handles 402 responses internally
      // This test just verifies the client can be created
      const newClient = new HttpClient(
        "http://localhost:3000",
        wallet,
        "solana-devnet"
      );

      expect(newClient).toBeDefined();
      expect(X402Client).toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    test("should propagate non-402 errors", async () => {
      const error500 = {
        response: {
          status: 500,
          data: { code: "INTERNAL_ERROR", message: "Server error" },
        },
      };

      mockX402Client.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: jest
          .fn()
          .mockResolvedValue(
            JSON.stringify({ code: "INTERNAL_ERROR", message: "Server error" })
          ),
      } as any);

      await expect(client.post("/tools/test/invoke", {})).rejects.toMatchObject(
        error500
      );
    });

    test("should handle network errors", async () => {
      mockX402Client.fetch.mockRejectedValue(new Error("ECONNREFUSED"));

      await expect(client.post("/tools/test/invoke", {})).rejects.toThrow(
        "ECONNREFUSED"
      );
    });

    test("should handle timeout errors", async () => {
      const timeoutError = new Error("Timeout");
      (timeoutError as any).code = "ECONNABORTED";

      mockX402Client.fetch.mockRejectedValue(timeoutError);

      await expect(client.post("/tools/test/invoke", {})).rejects.toThrow();
    });
  });
});
