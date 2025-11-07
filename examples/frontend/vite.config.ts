import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
  },
  build: {
    outDir: "dist",
  },
  // Use cache directory outside mounted volume to avoid cross-device link issues
  cacheDir: process.env.VITE_CACHE_DIR || "node_modules/.vite",
  resolve: {
    alias: {
      "@x402-agent-gateway/client": path.resolve(
        __dirname,
        "../../packages/client/dist/index.js"
      ),
    },
    dedupe: ["@solana/web3.js", "react", "react-dom"],
  },
  optimizeDeps: {
    include: [
      "@solana/web3.js",
      "@solana/wallet-adapter-base",
      "@solana/wallet-adapter-react",
      "@solana/wallet-adapter-react-ui",
    ],
    exclude: ["@x402-agent-gateway/client"],
  },
});
