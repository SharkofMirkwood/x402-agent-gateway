# @x402-agent-gateway/client

Frontend SDK for x402-native agent and tool orchestration.

## Installation

```bash
npm install @x402-agent-gateway/client @solana/web3.js
```

## Usage

```typescript
import { createClient } from '@x402-agent-gateway/client';
import { Keypair } from '@solana/web3.js';

const wallet = Keypair.fromSecretKey(yourSecretKey);

const client = createClient({
  baseURL: 'http://localhost:3000',
  wallet,
  network: 'solana-devnet',
});
```

## Bundler Configuration

This package depends on `@solana/web3.js` and its dependencies, which may require special bundler configuration.

### Vite

Add the following to your `vite.config.ts` to handle CommonJS dependencies from `@solana/web3.js`:

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    include: ['@solana/web3.js'],
    exclude: ['@solana/spl-token', '@solana/spl-token-metadata'],
    esbuildOptions: {
      target: 'esnext',
    },
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true,
    },
    rollupOptions: {
      external: ['@solana/spl-token', '@solana/spl-token-metadata'],
    },
  },
  resolve: {
    dedupe: ['@solana/web3.js'],
  },
});
```

This configuration:
- Includes `@solana/web3.js` in optimization to handle CommonJS interop
- Excludes problematic SPL token packages that aren't needed for SOL payments
- Ensures proper CommonJS transformation for dependencies

### Webpack

If using Webpack, ensure it's configured to handle CommonJS modules from `node_modules`:

```javascript
module.exports = {
  resolve: {
    fallback: {
      buffer: require.resolve('buffer/'),
    },
  },
};
```

## Browser Compatibility

This package is designed for browser environments. For Node.js usage, consider using `@x402-agent-gateway/server` instead.

