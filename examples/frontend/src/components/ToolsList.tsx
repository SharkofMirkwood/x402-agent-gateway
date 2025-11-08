import { useEffect, useState } from "react";
import { Tool } from "../types/chat";
import { ToolFormModal } from "./ToolFormModal";
import { X402Client } from "@x402-agent-gateway/client";
import { formatPrice } from "../utils/priceFormatter";

interface ToolsListProps {
  client: X402Client | null;
  onToolExecute: (toolName: string, input: Record<string, unknown>) => void;
}

export const ToolsList = ({ client, onToolExecute }: ToolsListProps) => {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (!client) {
      setLoading(false);
      return;
    }

    client.tools
      .list()
      .then((data: Tool[]) => {
        // ToolMetadata from SDK is compatible with Tool interface
        setTools(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        console.error("Failed to load tools:", err);
        setLoading(false);
      });
  }, [client]);

  const handleToolClick = (tool: Tool) => {
    setSelectedTool(tool);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedTool(null);
  };

  const handleModalSubmit = (
    toolName: string,
    input: Record<string, unknown>
  ) => {
    onToolExecute(toolName, input);
  };

  return (
    <>
      <div className="w-64 bg-gray-50 border-l border-gray-200 p-4 overflow-y-auto">
        <h2 className="text-lg font-bold mb-4 text-gray-800">
          Available Tools
        </h2>

        {loading ? (
          <div className="text-sm text-gray-500">Loading...</div>
        ) : (
          <div className="space-y-3">
            {tools.map((tool) => (
              <div
                key={tool.name}
                className="bg-white p-3 rounded-lg shadow-sm border border-gray-200"
              >
                <div className="font-semibold text-sm text-gray-800">
                  {tool.name}
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  {tool.description}
                </div>
                <div className="text-xs text-purple-600 font-medium mt-2 mb-2">
                  {"dynamic" in tool.price && tool.price.dynamic
                    ? "Dynamic pricing"
                    : "amount" in tool.price
                    ? formatPrice(tool.price.amount, tool.price.asset)
                    : "Price not available"}
                </div>
                <button
                  onClick={() => handleToolClick(tool)}
                  className="w-full px-3 py-1.5 text-xs font-normal text-gray-700 bg-transparent border border-gray-300 rounded hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
                >
                  Execute Tool
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ToolFormModal
        tool={selectedTool}
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSubmit={handleModalSubmit}
      />
    </>
  );
};
