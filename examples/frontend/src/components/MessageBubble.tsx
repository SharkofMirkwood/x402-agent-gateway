import { Message } from "../types/chat";

interface MessageBubbleProps {
  message: Message;
}

export const MessageBubble = ({ message }: MessageBubbleProps) => {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4 px-2`}
    >
      <div className={`max-w-[70%] min-w-0 ${isUser ? "order-2" : "order-1"}`}>
        <div
          className={`rounded-lg px-4 py-3 max-w-full overflow-hidden ${
            isUser ? "bg-purple-600 text-white" : "bg-gray-200 text-gray-900"
          }`}
        >
          <p className="whitespace-pre-wrap break-words overflow-wrap-anywhere">
            {message.content}
          </p>

          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/20 space-y-2 min-w-0">
              {message.toolCalls.map((tool, idx) => (
                <div key={idx} className="text-xs opacity-90 min-w-0">
                  <div className="font-semibold flex items-center gap-1">
                    🔧 {tool.name}
                    <span className="font-normal opacity-75">
                      ({tool.cost})
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[10px] bg-black/10 rounded px-2 py-1 w-full overflow-auto max-h-64 min-w-0">
                    <pre className="whitespace-pre-wrap break-all overflow-wrap-anywhere w-full min-w-0">
                      {JSON.stringify(tool.result, null, 2)}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {message.paymentStatus && message.paymentStatus !== "confirmed" && (
          <div className="text-xs mt-1 px-2">
            {message.paymentStatus === "pending" && (
              <span className="text-yellow-600">⏳ Payment pending...</span>
            )}
            {message.paymentStatus === "failed" && (
              <span className="text-red-600">❌ Payment failed</span>
            )}
          </div>
        )}

        <div className="text-xs text-gray-500 mt-1 px-2">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};
