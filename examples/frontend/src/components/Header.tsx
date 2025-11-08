import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useEffect, useState } from "react";
import {
  getPaymentSource,
  setPaymentSource,
  PaymentSource,
} from "../utils/wallet";
import { WalletFundingModal } from "./WalletFundingModal";

interface HeaderProps {
  onClearChatHistory: () => void;
  hasMessages: boolean;
  network: "solana" | "solana-devnet";
  rpcUrl?: string;
}

export const Header = ({
  onClearChatHistory,
  hasMessages,
  network,
  rpcUrl,
}: HeaderProps) => {
  const { wallet, publicKey } = useWallet();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [paymentSource, setPaymentSourceState] = useState<PaymentSource>(
    getPaymentSource()
  );
  const [showWalletModal, setShowWalletModal] = useState(false);

  const handleClearClick = () => {
    setShowConfirmDialog(true);
  };

  const handleConfirmClear = () => {
    onClearChatHistory();
    setShowConfirmDialog(false);
  };

  const handleCancelClear = () => {
    setShowConfirmDialog(false);
  };

  const handlePaymentSourceChange = (source: PaymentSource) => {
    setPaymentSourceState(source);
    setPaymentSource(source);
    // Trigger a re-render in parent components by dispatching a custom event
    window.dispatchEvent(new CustomEvent("paymentSourceChanged", { detail: source }));
  };

  // Listen for wallet adapter errors (including auto-connect rejections)
  useEffect(() => {
    if (!wallet?.adapter) return;

    const handleError = (error: any) => {
      const errorMessage = error?.message?.toLowerCase() || "";
      const isUserRejection =
        errorMessage.includes("user rejected") ||
        errorMessage.includes("user cancelled") ||
        errorMessage.includes("user denied") ||
        errorMessage.includes("rejected") ||
        error?.code === 4001; // Standard user rejection error code

      if (isUserRejection) {
        // Mark that user rejected, so we don't try to auto-connect again
        localStorage.setItem("walletConnectionRejected", "true");
      }
    };

    wallet.adapter.on("error", handleError);
    return () => {
      wallet.adapter.off("error", handleError);
    };
  }, [wallet]);

  // Clear rejection flag when wallet successfully connects
  useEffect(() => {
    if (publicKey) {
      localStorage.removeItem("walletConnectionRejected");
    }
  }, [publicKey]);

  // Handle disconnect to set rejection flag
  useEffect(() => {
    if (!publicKey && wallet) {
      // Wallet was disconnected, set rejection flag to prevent auto-reconnect
      const wasConnected = localStorage.getItem("wasWalletConnected");
      if (wasConnected === "true") {
        localStorage.setItem("walletConnectionRejected", "true");
        localStorage.removeItem("wasWalletConnected");
      }
    } else if (publicKey) {
      localStorage.setItem("wasWalletConnected", "true");
    }
  }, [publicKey, wallet]);

  return (
    <>
      <header className="bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg relative">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">x402 Agent Gateway</h1>
            <span className="text-xs bg-white/20 px-2 py-1 rounded">Demo</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Payment Source Toggle */}
            <div className="flex items-center gap-2 bg-white/10 px-3 py-2 rounded-lg">
              <span className="text-sm font-medium">Payment:</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePaymentSourceChange("in-browser")}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    paymentSource === "in-browser"
                      ? "bg-white text-purple-600"
                      : "text-white/70 hover:text-white"
                  }`}
                  title="Use in-browser wallet (automatic payments)"
                >
                  In-Browser
                </button>
                <button
                  onClick={() => handlePaymentSourceChange("connected-wallet")}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    paymentSource === "connected-wallet"
                      ? "bg-white text-purple-600"
                      : "text-white/70 hover:text-white"
                  }`}
                  title="Use connected browser wallet (requires approval)"
                >
                  Connected
                </button>
              </div>
              {paymentSource === "in-browser" && (
                <button
                  onClick={() => setShowWalletModal(true)}
                  className="ml-2 px-2 py-1 bg-white/20 hover:bg-white/30 rounded text-xs font-medium transition-colors"
                  title="View wallet address and fund with USDC"
                >
                  💰 Fund
                </button>
              )}
            </div>

            {hasMessages && (
              <button
                onClick={handleClearClick}
                className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm flex items-center gap-2"
                title="Clear chat history"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                Clear History
              </button>
            )}
            <WalletMultiButton className="!bg-white !text-purple-600 hover:!bg-purple-50 !font-medium !transition-colors !rounded-lg !px-4 !py-2 !shadow-sm !border !border-purple-200" />
          </div>
        </div>
      </header>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Clear Chat History?
            </h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to clear all chat history? This action
              cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCancelClear}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClear}
                className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
              >
                Clear History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wallet Funding Modal */}
      <WalletFundingModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        network={network}
        rpcUrl={rpcUrl}
      />
    </>
  );
};
