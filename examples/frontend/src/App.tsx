import { useMemo, useEffect } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { clusterApiUrl } from "@solana/web3.js";
import { Header } from "./components/Header";
import { ChatInterface } from "./components/ChatInterface";
import { ToolsList } from "./components/ToolsList";
import { useX402Client } from "./hooks/useX402Client";
import { useChat } from "./hooks/useChat";
import { getInBrowserWallet } from "./utils/wallet";

function AppContent() {
  const network = (import.meta.env.VITE_NETWORK || "solana-devnet") as
    | "solana"
    | "solana-devnet";
  const rpcUrl = import.meta.env.VITE_RPC_URL || "https://solana.drpc.org";
  
  const client = useX402Client();
  const {
    messages,
    loading,
    sendMessage,
    executeToolManually,
    clearChatHistory,
  } = useChat(client);

  // Initialize in-browser wallet on first load
  useEffect(() => {
    getInBrowserWallet();
  }, []);

  return (
    <div className="h-screen flex flex-col">
      <Header
        onClearChatHistory={clearChatHistory}
        hasMessages={messages.length > 0}
        network={network}
        rpcUrl={rpcUrl}
      />
      <div className="flex-1 flex overflow-hidden">
        <ChatInterface
          messages={messages}
          loading={loading}
          sendMessage={sendMessage}
        />
        <ToolsList client={client} onToolExecute={executeToolManually} />
      </div>
    </div>
  );
}

function App() {
  const network = (import.meta.env.VITE_NETWORK || "solana-devnet") as
    | "solana"
    | "solana-devnet";
  const endpoint = useMemo(
    () => (network === "solana" ? clusterApiUrl("mainnet-beta") : clusterApiUrl("devnet")),
    [network]
  );
  const wallets = useMemo(() => {
    const walletList = [new SolflareWalletAdapter()];
    // Filter out Brave wallet if it gets auto-detected
    // Note: Phantom is auto-detected via Wallet Standard, no need to include it explicitly
    return walletList;
  }, []);

  // Only auto-connect if user has previously connected a wallet and hasn't rejected
  const shouldAutoConnect = useMemo(() => {
    try {
      const connectionRejected = localStorage.getItem(
        "walletConnectionRejected"
      );
      if (connectionRejected === "true") {
        return false;
      }
      // The wallet adapter stores this under 'walletName' key
      const storedWalletName = localStorage.getItem("walletName");
      return !!storedWalletName;
    } catch {
      return false;
    }
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={shouldAutoConnect}>
        <WalletModalProvider>
          <AppContent />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default App;
