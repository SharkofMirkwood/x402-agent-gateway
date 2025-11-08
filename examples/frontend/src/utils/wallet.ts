import { Keypair, PublicKey, Connection } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddress } from "@solana/spl-token";

const IN_BROWSER_WALLET_KEY = "x402_in_browser_wallet";
const PAYMENT_SOURCE_KEY = "x402_payment_source";

export type PaymentSource = "in-browser" | "connected-wallet";

/**
 * Gets or creates an in-browser wallet (Keypair)
 * Stores the private key in localStorage
 */
export function getInBrowserWallet(): Keypair {
  try {
    const stored = localStorage.getItem(IN_BROWSER_WALLET_KEY);
    if (stored) {
      const secretKey = Uint8Array.from(JSON.parse(stored));
      return Keypair.fromSecretKey(secretKey);
    }

    // Create new wallet
    const newWallet = Keypair.generate();
    localStorage.setItem(
      IN_BROWSER_WALLET_KEY,
      JSON.stringify(Array.from(newWallet.secretKey))
    );
    return newWallet;
  } catch (error) {
    console.error("Failed to get in-browser wallet:", error);
    // Fallback: create new wallet
    const newWallet = Keypair.generate();
    localStorage.setItem(
      IN_BROWSER_WALLET_KEY,
      JSON.stringify(Array.from(newWallet.secretKey))
    );
    return newWallet;
  }
}

/**
 * Gets the public key address of the in-browser wallet
 */
export function getInBrowserWalletAddress(): string {
  const wallet = getInBrowserWallet();
  return wallet.publicKey.toBase58();
}

/**
 * Gets the current payment source preference
 */
export function getPaymentSource(): PaymentSource {
  try {
    const stored = localStorage.getItem(PAYMENT_SOURCE_KEY);
    return (stored as PaymentSource) || "connected-wallet";
  } catch {
    return "connected-wallet";
  }
}

/**
 * Sets the payment source preference
 */
export function setPaymentSource(source: PaymentSource): void {
  localStorage.setItem(PAYMENT_SOURCE_KEY, source);
}

/**
 * Checks USDC balance for a given public key
 * Returns 0 if the token account doesn't exist
 */
export async function getUSDCBalance(
  connection: Connection,
  publicKey: PublicKey,
  usdcMint: PublicKey
): Promise<number> {
  try {
    const tokenAddress = await getAssociatedTokenAddress(usdcMint, publicKey);
    const accountInfo = await getAccount(connection, tokenAddress);
    // USDC has 6 decimals
    return Number(accountInfo.amount) / 1e6;
  } catch {
    // Token account doesn't exist, return 0
    return 0;
  }
}

/**
 * Gets the USDC mint address based on network
 */
export function getUSDCMint(network: "solana" | "solana-devnet"): PublicKey {
  // Mainnet USDC: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
  // Devnet USDC: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
  return new PublicKey(
    network === "solana"
      ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
      : "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
  );
}
