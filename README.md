# x402 Agent Gateway - Payment-Gated AI Tool Orchestration

A TypeScript monorepo providing SDK frameworks for building payment-gated AI tools and agent workflows using Solana blockchain micropayments via the x402 protocol.

## Overview

This project consists of two core packages:

- **@x402-agent-gateway/server**: Backend SDK for registering and serving paywalled AI tools
- **@x402-agent-gateway/client**: Frontend SDK for discovering and invoking tools with automatic payment handling

The architecture follows an HTTP 402 (Payment Required) pattern where tool invocations are gated behind Solana blockchain transactions, with automatic retry logic for seamless payment flows.

## Quick Start

### Installation

**Backend:**
```bash
npm install @x402-agent-gateway/server @solana/web3.js zod
```

**Frontend:**
```bash
npm install @x402-agent-gateway/client @solana/web3.js
```

### Basic Backend Server Setup

```typescript
import { createToolServer, registerTool } from '@x402-agent-gateway/server';
import { z } from 'zod';

import { PublicKey } from '@solana/web3.js';

const server = createToolServer({
  port: 3000,
  facilitatorUrl: 'https://facilitator.payai.network',
  recipientWallet: 'YOUR_SOLANA_ADDRESS',
  network: 'solana',
  devMode: true,  // Disable payments for testing
  
  // Chat payment options:
  // chatPaymentPrice: { asset: 'USDC', amount: '10000', mint: USDC_MINT }  // Charge for chat (USDC)
  chatPaymentPrice: null  // Make chat free
});

// Register a simple echo tool

// For USDC payments (requires mint address):
const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'); // devnet
registerTool({
  name: 'echo',
  description: 'Echoes back the input message',
  inputSchema: z.object({ message: z.string() }),
  price: { asset: 'USDC', amount: '10000', mint: USDC_MINT }, // 0.01 USDC (10000 micro-units)
  handler: async (args) => {
    return { echo: args.message };
  }
});

server.start();
```

### Basic Frontend Client Setup

```typescript
import { createClient } from '@x402-agent-gateway/client';
import { Keypair } from '@solana/web3.js';

const wallet = Keypair.fromSecretKey(yourSecretKey);

const client = createClient({
  baseURL: 'http://localhost:3000',
  wallet,
  network: 'solana-devnet'
});

// Invoke the echo tool (payment handled automatically)
const result = await client.tools.invoke('echo', { 
  message: 'Hello, x402!' 
});
console.log(result); // { echo: 'Hello, x402!' }
```

## Backend API

### Endpoints

- **GET /tools** - Tool discovery endpoint returning JSON descriptors with name, description, input schemas, and prices
- **POST /tools/:name/invoke** - Invokes named tool with JSON input, protected with x402 payment middleware
- **POST /v1/chat/completions** - OpenAI-compatible chat completions endpoint with tool orchestration (optionally paywalled)

### Chat Payment Configuration

You can configure whether users pay for chat completions:

**Charge for chat messages:**
```typescript
createToolServer({
  // ...
  chatPaymentPrice: { asset: 'USDC', amount: '0.01' }
})

// For USDC payments (requires mint address):
import { PublicKey } from '@solana/web3.js';
const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'); // devnet
createToolServer({
  // ...
  chatPaymentPrice: { asset: 'USDC', amount: '10000', mint: USDC_MINT } // 0.01 USDC
})
```

**Make chat free:**
```typescript
createToolServer({
  // ...
  chatPaymentPrice: null  // Chat is free, tools still require payment
})
```

This gives you flexible monetization:
- Charge for both LLM orchestration AND tool executions (recommended)
- Make chat free, only charge for tools
- Different prices for chat vs. tools

### Tool Registration

```typescript

// For USDC payments (requires mint address):
import { PublicKey } from '@solana/web3.js';
const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'); // devnet
registerTool({
  name: 'web-search',
  description: 'Search the web and return results',
  inputSchema: z.object({ 
    query: z.string(), 
    limit: z.number().optional() 
  }),
  price: { asset: 'USDC', amount: '100000', mint: USDC_MINT }, // 0.1 USDC
  handler: async (args) => {
    // implement web search logic
    return { results: [...] };
  }
});
```

### Payment Middleware

- On first tool call without payment, responds HTTP 402 with PaymentRequirements JSON
- On retry with validated `X-Payment` header:
  1. Verifies transaction structure and amount
  2. Submits transaction to Solana blockchain
  3. Confirms transaction on-chain
  4. Executes tool handler only after confirmed payment
- Prevents nonce replay using in-memory store with TTL

## Frontend SDK

### Automatic 402 Payment Handling

When the backend responds with 402 Payment Required:
1. SDK constructs and signs Solana payment transaction with wallet
2. Encodes signed transaction as base64 proof in `X-Payment` header
3. Retries original request transparently after payment confirmation

### Chat Completions

```typescript
const response = await client.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'What is Solana?' }],
  tools: 'auto'
});
```


### Direct Tool Invocation

```typescript
const result = await client.tools.invoke('web-search', { 
  query: 'Solana news' 
});
```

## Payment Flow (x402 Exact Scheme)

1. Client calls protected endpoint without payment
2. Server responds 402 with PaymentRequirements following x402 exact-scheme:
   - `amount`: Payment amount in lamports
   - `recipient`: Server's Solana wallet address
   - `nonce`: One-time-use nonce (expires in 2 minutes)
   - `scheme`: "exact" (x402 payment scheme)
   - `resource`: Endpoint path being accessed
   - `expiry`: Unix timestamp when payment requirement expires
   - `network`: Solana network (devnet/mainnet/testnet)
3. Client constructs and signs Solana payment transaction
4. Client retries request with `X-Payment` header containing base64-encoded payment proof
5. Server verifies transaction structure and amount
6. **Server submits transaction to Solana and confirms on-chain**
7. Server consumes nonce (prevents replay attacks)
8. Server executes tool handler and returns 200 with result

## Project Structure

```
x402-agent-gateway-monorepo/
├── packages/
│   ├── server/              # Backend SDK
│   │   ├── src/
│   │   │   ├── types.ts             # TypeScript type definitions
│   │   │   ├── registry.ts          # Tool registration and metadata
│   │   │   ├── payment-middleware.ts # HTTP 402 payment verification
│   │   │   ├── router.ts            # Express router with x402 endpoints
│   │   │   ├── server.ts            # Express server with endpoints
│   │   │   └── index.ts             # Public API exports
│   │   └── __tests__/               # Unit tests
│   │
│   └── client/              # Frontend SDK
│       ├── src/
│       │   ├── types.ts             # TypeScript type definitions
│       │   ├── http-client.ts       # Axios client with 402 interceptor
│       │   ├── client.ts            # Main client class
│       │   ├── polyfills.ts         # Browser polyfills for Node.js APIs
│       │   └── index.ts             # Public API exports
│       └── __tests__/               # Unit tests
│
└── examples/
    ├── backend/             # Example backend server
    │   └── src/index.ts     # Server with sample tools (echo, web-search, calculate, url-fetcher, summarizer)
    │
    └── frontend/            # Example frontend client
        └── src/             # React frontend application
```

## Running the Examples

### Start the Backend Server

```bash
npm run example:backend
```

The server starts on port 3000 (configurable via `PORT` environment variable) with 5 tools. By default, chat payments are enabled (0.01 USDC) and dev mode is enabled (payments disabled for testing).

**Configuration via environment variables:**
- `PORT` - Server port (default: 3000)
- `RECIPIENT_WALLET` - Solana wallet address to receive payments
- `NETWORK` - Solana network: `solana` (mainnet) or `solana-devnet` (default: `solana`)
- `DEV_MODE` - Set to `false` to enable payments (default: `true`)
- `CHAT_PAYMENT_PRICE` - Chat payment amount in micro-units (default: `10000` = 0.01 USDC)
- `OPENAI_API_KEY` - OpenAI API key for chat completions

Tools available (all priced in USDC):
- `echo` - Echoes back messages (0.01 USDC = 10000 micro-units)
- `calculate` - Basic arithmetic (0.005 USDC = 5000 micro-units)
- `web-search` - Stub web search (0.1 USDC = 100000 micro-units)
- `url-fetcher` - Fetch HTML from URLs (0.01 USDC = 10000 micro-units)
- `summarizer` - Text summarization (0.02 USDC = 20000 micro-units)

### Run the Frontend Client

```bash
npm run example:frontend
```

The client will:
1. List available tools
2. Invoke the echo tool
3. Invoke the calculate tool
4. Invoke the web-search tool
5. Test chat completions

## Development Mode

Set `devMode: true` in server configuration to bypass payments during testing:

```typescript
createToolServer({
  // ...
  devMode: true  // Payments disabled
})
```

## Running Tests

```bash
# Test all packages
npm test

# Test specific package
npm test -w @x402-agent-gateway/server
npm test -w @x402-agent-gateway/client
```

## Building

```bash
# Build all packages
npm run build
```

## Security Features

- **Transaction Verification**: Server validates transaction structure and amount before execution
- **On-Chain Confirmation**: Transactions are submitted to Solana and confirmed before granting access
- **Zod Schema Validation**: Input/output validation for type safety
- **No Payment Bypass**: Server confirms actual on-chain settlement before executing tools

## Future Enhancements

- Distributed nonce store for horizontal scaling
- Enhanced telemetry and monitoring
- Full MCP server compliance
- Additional SPL token support beyond USDC

## License

MIT License

## Contributing

Contributions welcome! This project was built as a hackathon demonstration of x402-native payment-gated AI tools.
