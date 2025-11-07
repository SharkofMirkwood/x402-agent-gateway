import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { PaymentIndicator } from "./PaymentIndicator";
import { Message } from "../types/chat";

interface ChatInterfaceProps {
  messages: Message[];
  loading: boolean;
  sendMessage: (content: string) => Promise<void>;
}

export const ChatInterface = ({
  messages,
  loading,
  sendMessage,
}: ChatInterfaceProps) => {
  const { connected } = useWallet();
  const [paymentStatus, setPaymentStatus] = useState<
    "idle" | "pending" | "confirming" | "confirmed" | "failed"
  >("idle");

  useEffect(() => {
    if (loading) {
      setPaymentStatus("pending");
    } else {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.paymentStatus === "failed") {
        setPaymentStatus("failed");
        setTimeout(() => setPaymentStatus("idle"), 3000);
      } else {
        setPaymentStatus("idle");
      }
    }
  }, [loading, messages]);

  const handleSend = async (content: string) => {
    if (!connected) {
      alert("Please connect your wallet first");
      return;
    }

    try {
      await sendMessage(content);
    } catch (error: any) {
      setPaymentStatus("failed");
      setTimeout(() => setPaymentStatus("idle"), 3000);
    }
  };

  if (!connected) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-xl text-gray-600 mb-4">🔐 Wallet Not Connected</p>
          <p className="text-sm text-gray-500">
            Please connect your Solana wallet to start chatting
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white">
      <MessageList messages={messages} />
      <PaymentIndicator status={paymentStatus} />
      <MessageInput onSend={handleSend} disabled={loading} />
    </div>
  );
};
