/**
 * Formats a price amount for display in the UI
 * @param amount - The raw amount as a string (in smallest unit: lamports for SOL, micro-units for USDC)
 * @param asset - The asset type ("SOL" or "USDC")
 * @returns Formatted price string (e.g., "0.01 USD" for USDC, "0.0001 SOL" for SOL)
 */
export function formatPrice(amount: string, asset: string): string {
  const amountNum = parseFloat(amount);

  if (isNaN(amountNum)) {
    return `${amount} ${asset}`;
  }

  if (asset === "USDC") {
    const usdAmount = amountNum / 1e6;
    const formatted = usdAmount.toFixed(6).replace(/\.?0+$/, "");
    return `$${formatted} USD`;
  } else if (asset === "SOL") {
    const solAmount = amountNum / 1e9;
    const formatted = solAmount.toFixed(9).replace(/\.?0+$/, "");
    return `${formatted} SOL`;
  } else {
    return `${amount} ${asset}`;
  }
}
