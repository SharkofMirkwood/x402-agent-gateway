import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useEffect, useState, useCallback, useRef } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  getPaymentSource,
  setPaymentSource,
  PaymentSource,
  getInBrowserWalletAddress,
  getUSDCBalance,
  getUSDCMint,
} from "../utils/wallet";
import { WalletFundingModal } from "./WalletFundingModal";

// Cache balance for 30 seconds to prevent rate limiting
const BALANCE_CACHE_MS = 30000;

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
  const [inBrowserBalance, setInBrowserBalance] = useState<number | null>(null);
  const [connectedBalance, setConnectedBalance] = useState<number | null>(null);
  const [inBrowserBalanceLoading, setInBrowserBalanceLoading] = useState(false);
  const [connectedBalanceLoading, setConnectedBalanceLoading] = useState(false);
  const lastInBrowserBalanceFetchRef = useRef<number>(0);
  const lastConnectedBalanceFetchRef = useRef<number>(0);
  const isFetchingInBrowserRef = useRef<boolean>(false);
  const isFetchingConnectedRef = useRef<boolean>(false);

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

  const loadInBrowserBalance = useCallback(
    async (force = false) => {
      const now = Date.now();
      const timeSinceLastFetch = now - lastInBrowserBalanceFetchRef.current;

      // Skip if we're already fetching or if cache is still valid (unless forced)
      if (
        isFetchingInBrowserRef.current ||
        (!force && timeSinceLastFetch < BALANCE_CACHE_MS)
      ) {
        return;
      }

      isFetchingInBrowserRef.current = true;
      setInBrowserBalanceLoading(true);
      try {
        const connection = new Connection(
          rpcUrl || "https://solana.drpc.org",
          "confirmed"
        );
        const walletAddress = getInBrowserWalletAddress();
        const publicKey = new PublicKey(walletAddress);
        const usdcMint = getUSDCMint(network);
        const balance = await getUSDCBalance(connection, publicKey, usdcMint);
        setInBrowserBalance(balance);
        lastInBrowserBalanceFetchRef.current = now;
      } catch (error) {
        console.error("Failed to load in-browser balance:", error);
        // Only set to 0 if it's a real error, not a rate limit
        if (error instanceof Error && !error.message.includes("429")) {
          setInBrowserBalance(0);
        }
      } finally {
        setInBrowserBalanceLoading(false);
        isFetchingInBrowserRef.current = false;
      }
    },
    [network, rpcUrl]
  );

  const loadConnectedBalance = useCallback(
    async (force = false) => {
      if (!publicKey) {
        setConnectedBalance(null);
        return;
      }

      const now = Date.now();
      const timeSinceLastFetch = now - lastConnectedBalanceFetchRef.current;

      // Skip if we're already fetching or if cache is still valid (unless forced)
      if (
        isFetchingConnectedRef.current ||
        (!force && timeSinceLastFetch < BALANCE_CACHE_MS)
      ) {
        return;
      }

      isFetchingConnectedRef.current = true;
      setConnectedBalanceLoading(true);
      try {
        const connection = new Connection(
          rpcUrl || "https://solana.drpc.org",
          "confirmed"
        );
        const usdcMint = getUSDCMint(network);
        const balance = await getUSDCBalance(connection, publicKey, usdcMint);
        setConnectedBalance(balance);
        lastConnectedBalanceFetchRef.current = now;
      } catch (error) {
        console.error("Failed to load connected balance:", error);
        // Only set to 0 if it's a real error, not a rate limit
        if (error instanceof Error && !error.message.includes("429")) {
          setConnectedBalance(0);
        }
      } finally {
        setConnectedBalanceLoading(false);
        isFetchingConnectedRef.current = false;
      }
    },
    [network, rpcUrl, publicKey]
  );

  const handlePaymentSourceChange = (source: PaymentSource) => {
    setPaymentSourceState(source);
    setPaymentSource(source);
    // Trigger a re-render in parent components by dispatching a custom event
    window.dispatchEvent(
      new CustomEvent("paymentSourceChanged", { detail: source })
    );
  };

  // Load balances when component mounts or network/rpc changes
  useEffect(() => {
    loadInBrowserBalance();
    loadConnectedBalance();
  }, [network, rpcUrl, loadInBrowserBalance, loadConnectedBalance]);

  // Load connected balance when wallet connects/disconnects
  useEffect(() => {
    if (publicKey) {
      loadConnectedBalance(true);
    } else {
      setConnectedBalance(null);
    }
  }, [publicKey, loadConnectedBalance]);

  // Listen for balance updates when modal closes (force refresh after funding)
  useEffect(() => {
    if (!showWalletModal && paymentSource === "in-browser") {
      // Reload balance when modal closes (user might have funded) - force refresh
      const timeoutId = setTimeout(() => {
        loadInBrowserBalance(true);
      }, 1000); // Wait 1 second after modal closes to allow transaction to settle
      return () => clearTimeout(timeoutId);
    }
  }, [showWalletModal, paymentSource, loadInBrowserBalance]);

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
              <div className="relative group">
                <span className="text-sm font-medium cursor-help">
                  x402 Payment Source
                </span>
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  Choose how to pay for x402 tool invocations. In-Browser uses
                  an automatic wallet stored locally, while Connected uses your
                  browser wallet (requires approval for each payment).
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePaymentSourceChange("in-browser")}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2 ${
                    paymentSource === "in-browser"
                      ? "bg-white text-purple-600"
                      : "text-white/70 hover:text-white"
                  }`}
                  title="Use in-browser wallet (automatic payments)"
                >
                  In-Browser
                  {inBrowserBalance !== null && (
                    <span className="text-xs opacity-75">
                      {inBrowserBalanceLoading
                        ? "..."
                        : `$${inBrowserBalance.toFixed(2)}`}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => handlePaymentSourceChange("connected-wallet")}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2 ${
                    paymentSource === "connected-wallet"
                      ? "bg-white text-purple-600"
                      : "text-white/70 hover:text-white"
                  }`}
                  title="Use connected browser wallet (requires approval)"
                >
                  Connected
                  {connectedBalance !== null && (
                    <span className="text-xs opacity-75">
                      {connectedBalanceLoading
                        ? "..."
                        : `$${connectedBalance.toFixed(2)}`}
                    </span>
                  )}
                </button>
              </div>
              {paymentSource === "in-browser" && (
                <button
                  onClick={() => setShowWalletModal(true)}
                  className="ml-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
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
            <WalletMultiButton className="!bg-white/20 hover:!bg-white/30 !text-white !font-medium !transition-colors !rounded-lg !px-4 !py-2 !text-sm !shadow-sm !border-0 !h-auto" />
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
