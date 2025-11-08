import { useMemo, useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { createClient } from "@x402-agent-gateway/client";
import {
  getPaymentSource,
  getInBrowserWallet,
  PaymentSource,
} from "../utils/wallet";

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  "https://x402-agent-gateway-api.up.railway.app";
const NETWORK = (import.meta.env.VITE_NETWORK || "solana") as
  | "solana"
  | "solana-devnet";
const RPC_URL = import.meta.env.VITE_RPC_URL || "https://solana.drpc.org";

export const useX402Client = () => {
  const { wallet, publicKey } = useWallet();
  const [paymentSource, setPaymentSource] = useState<PaymentSource>(
    getPaymentSource()
  );

  // Listen for payment source changes
  useEffect(() => {
    const handlePaymentSourceChange = (event: CustomEvent<PaymentSource>) => {
      setPaymentSource(event.detail);
    };

    window.addEventListener(
      "paymentSourceChanged",
      handlePaymentSourceChange as EventListener
    );

    return () => {
      window.removeEventListener(
        "paymentSourceChanged",
        handlePaymentSourceChange as EventListener
      );
    };
  }, []);

  const client = useMemo(() => {
    // If using in-browser wallet, use it directly
    if (paymentSource === "in-browser") {
      const inBrowserWallet = getInBrowserWallet();
      return createClient({
        baseURL: BACKEND_URL,
        wallet: inBrowserWallet,
        network: NETWORK,
        rpcUrl: RPC_URL,
      });
    }

    // Otherwise, use connected wallet (requires wallet to be connected)
    if (!wallet?.adapter || !publicKey) {
      return null;
    }

    return createClient({
      baseURL: BACKEND_URL,
      wallet: wallet.adapter as any,
      network: NETWORK,
      rpcUrl: RPC_URL,
    });
  }, [wallet, publicKey, paymentSource]);

  return client;
};
