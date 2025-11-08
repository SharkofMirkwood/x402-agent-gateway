import { RegisteredTool, ToolMetadata } from "./types";
import { toJSONSchema } from "zod";

class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  register(tool: RegisteredTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool ${tool.name} is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  getAll(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }

  clear(): void {
    this.tools.clear();
  }

  async getMetadata(): Promise<ToolMetadata[]> {
    const metadata: ToolMetadata[] = [];

    for (const tool of this.tools.values()) {
      const inputSchema = toJSONSchema(tool.inputSchema);
      const outputSchema = tool.outputSchema
        ? toJSONSchema(tool.outputSchema)
        : undefined;

      // Serialize price: if it's a function, serialize as { dynamic: true }
      // Otherwise, return the PaymentPrice object as-is
      let serializedPrice: any;
      if (typeof tool.price === "function") {
        serializedPrice = { dynamic: true };
      } else {
        serializedPrice = tool.price;
      }

      metadata.push({
        name: tool.name,
        description: tool.description,
        inputSchema,
        outputSchema,
        price: serializedPrice,
      });
    }

    return metadata;
  }
}

export const registry = new ToolRegistry();
