import { Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { X402Client } from "x402-solana/client";
import { AxiosRequestConfig } from "axios";

type Wallet =
  | Keypair
  | { publicKey: any; signTransaction: (tx: any) => Promise<any> };

function createX402WalletAdapter(wallet: Wallet): {
  address: string;
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
} {
  if ("secretKey" in wallet && wallet.secretKey) {
    const keypair = wallet as Keypair;
    return {
      address: keypair.publicKey.toBase58(),
      signTransaction: async (tx: VersionedTransaction) => {
        tx.sign([keypair]);
        return tx;
      },
    };
  } else {
    const adapter = wallet as {
      publicKey?: PublicKey | null;
      signTransaction: (tx: any) => Promise<any>;
    };
    let address: string;

    if (adapter.publicKey) {
      address = adapter.publicKey.toBase58();
    } else {
      throw new Error("Wallet adapter does not have a public key");
    }

    return {
      address,
      signTransaction: async (tx: VersionedTransaction) => {
        // x402-solana uses VersionedTransaction, but some adapters might use Transaction
        return (await adapter.signTransaction(tx)) as VersionedTransaction;
      },
    };
  }
}

export class HttpClient {
  private baseURL: string;
  private x402Client: X402Client;

  constructor(
    baseURL: string,
    wallet: Wallet,
    network: string,
    rpcUrl?: string
  ) {
    this.baseURL = baseURL;
    const walletAdapter = createX402WalletAdapter(wallet);

    this.x402Client = new X402Client({
      wallet: walletAdapter,
      network: network === "solana" ? "solana" : "solana-devnet",
      ...(rpcUrl && { rpcUrl }),
    });
  }

  async request<T>(config: AxiosRequestConfig): Promise<T> {
    const url = config.url?.startsWith("http")
      ? config.url
      : `${this.baseURL}${
          config.url?.startsWith("/") ? config.url : `/${config.url}`
        }`;

    const fetchConfig: RequestInit = {
      method: config.method?.toUpperCase() || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(config.headers as Record<string, string>),
      },
    };

    if (
      config.data &&
      (config.method === "POST" ||
        config.method === "PUT" ||
        config.method === "PATCH")
    ) {
      (fetchConfig as any).body =
        typeof config.data === "string"
          ? config.data
          : JSON.stringify(config.data);
    }

    // Use x402-solana's client.fetch() which automatically handles 402 responses
    const response = await this.x402Client.fetch(url, fetchConfig);

    // x402-solana's fetch returns a Response-like object
    if (!(response as any).ok) {
      const errorText = await (response as any).text();
      let errorData: any;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }

      const error = new Error(
        errorData.message || `HTTP ${(response as any).status}`
      );
      (error as any).response = {
        status: (response as any).status,
        data: errorData,
      };
      throw error;
    }

    const data = await (response as any).json();
    return data as T;
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>({ ...config, method: "GET", url });
  }

  async post<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<T> {
    return this.request<T>({ ...config, method: "POST", url, data });
  }
}
