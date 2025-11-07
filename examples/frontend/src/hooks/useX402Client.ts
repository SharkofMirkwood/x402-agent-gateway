import { useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { createClient } from "@x402-agent-gateway/client";

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  "https://x402-agent-gateway-api.up.railway.app";
const NETWORK = (import.meta.env.VITE_NETWORK || "solana") as
  | "solana"
  | "solana-devnet";

export const useX402Client = () => {
  const { wallet, publicKey } = useWallet();

  const client = useMemo(() => {
    if (!wallet?.adapter || !publicKey) {
      return null;
    }

    return createClient({
      baseURL: BACKEND_URL,
      wallet: wallet.adapter as any,
      network: NETWORK,
      rpcUrl: "https://solana.drpc.org",
    });
  }, [wallet, publicKey]);

  return client;
};
