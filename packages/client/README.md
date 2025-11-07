# @x402-agent-gateway/client

Frontend SDK for x402-native agent and tool orchestration. This package provides a client-side interface for interacting with x402 payment-enabled tool servers and chat completions.

For the server SDK, see [@x402-agent-gateway/server](https://www.npmjs.com/package/@x402-agent-gateway/server).

## Installation

```bash
npm install @x402-agent-gateway/client @solana/web3.js
```

## Configuration

The client requires a configuration object with the following options:

```typescript
interface ClientConfig {
  baseURL: string;        // Base URL of the x402 tool server
  wallet: any;            // Solana wallet adapter or Keypair
  network: Network;       // "solana" | "solana-devnet"
  rpcUrl?: string;       // Optional custom RPC URL
}
```

### Configuration Options

- **`baseURL`** (required): The base URL of your x402 tool server (e.g., `"http://localhost:3000"` or `"https://api.example.com"`)
- **`wallet`** (required): A Solana wallet adapter (from `@solana/wallet-adapter-react`) or a `Keypair` from `@solana/web3.js`
- **`network`** (required): The Solana network to use. Must be either `"solana"` (mainnet) or `"solana-devnet"` (devnet)
- **`rpcUrl`** (optional): Custom Solana RPC endpoint. If not provided, defaults to a public RPC endpoint

## Usage

### Basic Setup

```typescript
import { createClient } from '@x402-agent-gateway/client';
import { Keypair } from '@solana/web3.js';

// Using a Keypair
const wallet = Keypair.fromSecretKey(yourSecretKey);

const client = createClient({
  baseURL: 'http://localhost:3000',
  wallet,
  network: 'solana-devnet',
});
```

### With Wallet Adapter (React)

```typescript
import { createClient } from '@x402-agent-gateway/client';
import { useWallet } from '@solana/wallet-adapter-react';

function MyComponent() {
  const { wallet, publicKey } = useWallet();
  
  const client = useMemo(() => {
    if (!wallet?.adapter || !publicKey) return null;
    
    return createClient({
      baseURL: 'http://localhost:3000',
      wallet: wallet.adapter,
      network: 'solana-devnet',
      rpcUrl: 'https://api.mainnet-beta.solana.com',
    });
  }, [wallet, publicKey]);
  
  // Use client...
}
```

## API Reference

### Tools API

To make use of tools here you must first register them in your API using the [server SDK](https://www.npmjs.com/package/@x402-agent-gateway/server).

#### List Available Tools

```typescript
const tools = await client.tools.list();
// Returns: ToolMetadata[]
```

#### Invoke a Tool

```typescript
const result = await client.tools.invoke('tool-name', {
  arg1: 'value1',
  arg2: 123,
});
// Automatically handles payment if required
```

### Chat API

#### Create Chat Completion

```typescript
const response = await client.chat.completions.create({
  model: 'gpt-4',
  messages: [
    { role: 'user', content: 'Hello!' }
  ],
  tools: 'auto', // Automatically includes available tools defined with the server SDK
});
// Automatically handles payment if required
```

The chat completion API follows the OpenAI Chat Completions format and automatically includes available tools from the server.

