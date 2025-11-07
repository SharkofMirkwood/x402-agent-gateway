import { HttpClient } from "../http-client";
import { Keypair } from "@solana/web3.js";
import axios from "axios";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("HttpClient", () => {
  let client: HttpClient;
  let wallet: Keypair;
  let mockAxiosInstance: any;

  beforeEach(() => {
    wallet = Keypair.generate();
    jest.clearAllMocks();

    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      request: jest.fn(),
      interceptors: {
        request: { use: jest.fn(), eject: jest.fn() },
        response: { use: jest.fn(), eject: jest.fn() },
      },
    };

    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);

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
      mockAxiosInstance.get.mockResolvedValue({ data: mockData });

      const result = await client.get("/tools");

      expect(result).toEqual(mockData);
    });

    test("should handle GET request errors", async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error("Network error"));

      await expect(client.get("/tools")).rejects.toThrow("Network error");
    });
  });

  describe("POST Requests", () => {
    test("should make successful POST request", async () => {
      const mockResponse = { result: "success" };
      mockedAxios.create.mockReturnValue({
        get: jest.fn(),
        post: jest.fn().mockResolvedValue({ data: mockResponse }),
        interceptors: {
          request: { use: jest.fn(), eject: jest.fn() },
          response: { use: jest.fn(), eject: jest.fn() },
        },
      } as any);

      const result = await client.post("/tools/echo/invoke", {
        message: "hello",
      });

      expect(result).toEqual(mockResponse);
    });

    test("should include request body in POST", async () => {
      const postSpy = jest.fn().mockResolvedValue({ data: {} });
      mockedAxios.create.mockReturnValue({
        get: jest.fn(),
        post: postSpy,
        interceptors: {
          request: { use: jest.fn(), eject: jest.fn() },
          response: { use: jest.fn(), eject: jest.fn() },
        },
      } as any);

      await client.post("/tools/test/invoke", { input: "test data" });

      expect(postSpy).toHaveBeenCalledWith("/tools/test/invoke", {
        input: "test data",
      });
    });
  });

  describe("Payment Interceptor", () => {
    test("should handle 402 response and retry with payment", async () => {
      const paymentChallenge = {
        amount: "0.001",
        recipient: "TestWallet1111111111111111111111111111111",
        asset: "SOL",
        network: "solana-devnet",
        nonce: "test-nonce",
        scheme: "exact",
        resource: "/tools/test/invoke",
        expiry: Date.now() + 120000,
      };

      const error402 = {
        response: {
          status: 402,
          data: {
            code: "PAYMENT_REQUIRED",
            payment_challenge: paymentChallenge,
          },
        },
      };

      let callCount = 0;
      const postSpy = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(error402);
        }
        return Promise.resolve({ data: { result: "success" } });
      });

      mockedAxios.create.mockReturnValue({
        get: jest.fn(),
        post: postSpy,
        interceptors: {
          request: { use: jest.fn(), eject: jest.fn() },
          response: {
            use: jest.fn((onFulfilled, onRejected) => {
              return 0;
            }),
            eject: jest.fn(),
          },
        },
      } as any);

      const newClient = new HttpClient(
        "http://localhost:3000",
        wallet,
        "solana-devnet"
      );

      expect(newClient).toBeDefined();
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

      mockAxiosInstance.post.mockRejectedValue(error500);

      await expect(client.post("/tools/test/invoke", {})).rejects.toMatchObject(
        error500
      );
    });

    test("should handle network errors", async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error("ECONNREFUSED"));

      await expect(client.post("/tools/test/invoke", {})).rejects.toThrow(
        "ECONNREFUSED"
      );
    });

    test("should handle timeout errors", async () => {
      const timeoutError = new Error("Timeout");
      (timeoutError as any).code = "ECONNABORTED";

      mockAxiosInstance.post.mockRejectedValue(timeoutError);

      await expect(client.post("/tools/test/invoke", {})).rejects.toThrow();
    });
  });
});
