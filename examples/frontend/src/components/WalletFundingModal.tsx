import { useState, useEffect, useCallback } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { getInBrowserWalletAddress, getUSDCBalance, getUSDCMint } from "../utils/wallet";

interface WalletFundingModalProps {
  isOpen: boolean;
  onClose: () => void;
  network: "solana" | "solana-devnet";
  rpcUrl?: string;
}

export const WalletFundingModal = ({
  isOpen,
  onClose,
  network,
  rpcUrl = "https://solana.drpc.org",
}: WalletFundingModalProps) => {
  const [address, setAddress] = useState<string>("");
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrCode, setQrCode] = useState<string>("");

  const loadBalance = useCallback(async (walletAddress: string) => {
    setLoading(true);
    try {
      console.log("Loading balance for wallet address:", walletAddress);
      console.log("Network:", network);
      console.log("RPC URL:", rpcUrl);
      
      const connection = new Connection(rpcUrl, "confirmed");
      const publicKey = new PublicKey(walletAddress);
      const usdcMint = getUSDCMint(network);
      
      console.log("USDC Mint:", usdcMint.toBase58());
      
      const usdcBalance = await getUSDCBalance(connection, publicKey, usdcMint);
      console.log("USDC Balance:", usdcBalance);
      
      setBalance(usdcBalance);
    } catch (error) {
      console.error("Failed to load balance:", error);
      setBalance(0);
    } finally {
      setLoading(false);
    }
  }, [network, rpcUrl]);

  useEffect(() => {
    if (isOpen) {
      const walletAddress = getInBrowserWalletAddress();
      console.log("Modal opened - Retrieved wallet address:", walletAddress);
      setAddress(walletAddress);
      
      // Generate QR code data URL
      const qrData = `solana:${walletAddress}?label=x402%20Wallet&message=Fund%20this%20wallet%20with%20USDC`;
      // Using a simple QR code library would be better, but for now we'll use a service
      setQrCode(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData)}`);
      
      // Load balance
      loadBalance(walletAddress);
    }
  }, [isOpen, network, rpcUrl, loadBalance]);

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRefresh = () => {
    loadBalance(address);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Fund In-Browser Wallet
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-800">
            <strong>⚠️ Security Warning:</strong> The wallet key is stored in your browser's local storage. This is not secure for storing large amounts of funds. Only add small amounts for testing purposes.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Wallet Address
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={address}
                readOnly
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm font-mono"
              />
              <button
                onClick={handleCopy}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              USDC Balance
            </label>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-gray-900">
                {loading ? (
                  <span className="text-gray-400">Loading...</span>
                ) : balance !== null ? (
                  `$${balance.toFixed(6)} USDC`
                ) : (
                  "N/A"
                )}
              </span>
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                title="Refresh balance"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              QR Code
            </label>
            <div className="flex justify-center p-4 bg-gray-50 rounded-lg">
              {qrCode ? (
                <img
                  src={qrCode}
                  alt="Wallet QR Code"
                  className="w-48 h-48"
                />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center text-gray-400">
                  Loading QR code...
                </div>
              )}
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> Send USDC to this address to fund your
              in-browser wallet. Payments will be processed automatically when
              this wallet is selected as the payment source.
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

