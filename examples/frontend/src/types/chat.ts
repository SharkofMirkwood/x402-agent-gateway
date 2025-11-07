export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  result: unknown;
  cost: string;
  status?: "pending" | "completed" | "failed" | "cancelled";
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  paymentStatus?: "pending" | "confirmed" | "failed";
}

export interface ChatHistory {
  messages: Message[];
  lastCleared: number;
}

export interface Tool {
  name: string;
  description: string;
  price: {
    asset: string;
    amount: string;
  };
  inputSchema: Record<string, unknown>;
}
