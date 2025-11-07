import { Keypair } from "@solana/web3.js";
import { HttpClient } from "./http-client";
import {
  ClientConfig,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ToolMetadata,
} from "./types";

export class X402Client {
  private httpClient: HttpClient;
  public tools: ToolsAPI;
  public chat: ChatAPI;

  constructor(config: ClientConfig) {
    this.httpClient = new HttpClient(
      config.baseURL,
      config.wallet,
      config.network,
      config.rpcUrl
    );
    this.tools = new ToolsAPI(this.httpClient);
    this.chat = new ChatAPI(this.httpClient);
  }
}

class ToolsAPI {
  constructor(private httpClient: HttpClient) {}

  async list(): Promise<ToolMetadata[]> {
    return this.httpClient.get<ToolMetadata[]>("/tools");
  }

  async invoke<T = any>(name: string, args: any): Promise<T> {
    return this.httpClient.post<T>(`/tools/${name}/invoke`, args);
  }
}

class ChatAPI {
  public completions: CompletionsAPI;

  constructor(httpClient: HttpClient) {
    this.completions = new CompletionsAPI(httpClient);
  }
}

class CompletionsAPI {
  constructor(private httpClient: HttpClient) {}

  async create(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    return this.httpClient.post<ChatCompletionResponse>(
      "/v1/chat/completions",
      request
    );
  }
}
