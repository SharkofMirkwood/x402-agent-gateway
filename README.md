# x402 Agent Gateway - Payment-Gated AI Tool Orchestration

A TypeScript monorepo providing client + server SDKs to easily make LLM tools and agent workflows paywalled via x402 micro-payments on Solana, with dynamic pricing options.

Turn any existing LLM tool, API endpoint or any code into a paywalled microservice that can be paid for by a user interacting with an agent. Have users pay for the LLM interactions + any function tools called by the LLM, with payment coming directly from the user's self-custody wallet.


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

### Basic Server Setup

```typescript
import { createToolServer, registerTool } from '@x402-agent-gateway/server';
import { z } from 'zod';

import { PublicKey } from '@solana/web3.js';

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

const server = createToolServer({
  port: 3000,
  facilitatorUrl: 'https://facilitator.payai.network',
  recipientWallet: 'YOUR_SOLANA_ADDRESS',
  network: 'solana',
  devMode: true,  // Disable payments for testing
  
  // Chat payment options:
  // chatPaymentPrice: { asset: 'USDC', amount: '10000', mint: USDC_MINT }  // Charge for chat (USDC)
  // chatPaymentPrice: null  // Make chat free
  chatPaymentPrice: {
      asset: "USDC",
      mint: USDC_MINT,
      costPerToken: "100", // 100 micro-USDC per token (0.0001 USDC)
      baseAmount: "0", // Optional base amount
      min: "10000", // Minimum 10000 micro-USDC (0.01 USDC) per request
  }
});

// Register a simple echo function tool that the LLM can choose to call

// For USDC payments (requires mint address):
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

### Basic Client Setup & Use

```typescript
import { createClient } from '@x402-agent-gateway/client';
import { Keypair } from '@solana/web3.js';

const wallet = Keypair.fromSecretKey(yourSecretKey);

const client = createClient({
  baseURL: 'http://localhost:3000',
  wallet,
  network: 'solana'
});

// Send a chat completions request to the LLM; if your server config requires payment, this will be handled automatically
const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: chatHistory,
  tools: "auto",
});

// List
const tools = await client.tools.list();

// Invoke a function tool manually (payment handled automatically by the SDK)
const result = await client.tools.invoke('echo', { 
  message: 'Hello, x402!' 
});
console.log(result); // { echo: 'Hello, x402!' }
```

## Demo

We have a live hosted demo app that makes use of the SDKs: [Live demo](https://x402-agent-gateway.up.railway.app/)

Alternatively, run the demo yourself in a couple of steps:

```
git clone https://github.com/SharkofMirkwood/x402-agent-gateway.git
cd x402-agent-gateway
cp examples/backend/.env.example examples/backend/.env # set env vars in the .env file; OpenAI API key required
docker compose --profile dev up --build
# then open http://localhost:3000
```

## Overview

This project consists of two core packages:

- **[@x402-agent-gateway/server](https://www.npmjs.com/package/@x402-agent-gateway/server)**: Backend SDK for registering and serving x402-paywalled AI tools 
- **[@x402-agent-gateway/client](https://www.npmjs.com/package/@x402-agent-gateway/client)**: Frontend SDK for interacting with LLM + discovering and invoking tools with automatic payment handling

The architecture is built upon the concept of [function calling](https://platform.openai.com/docs/guides/function-calling), a mechanism for LLMs to interface with external systems. This is the mechanism that MCP servers are built on top of, and is supported in a fairly consistent way by the leading LLMs services. 
These SDKs integrate the [x402 payments protocol](https://github.com/coinbase/x402) with function calling, in order to provide automatic payment handling for requests both to the LLM and to the function tools the LLM uses while perfoming its agentic duties.

Combined, this means you can offer agentic functionality that interacts with external services while having the end user pay directly for each interaction, enabling sustainable permissionless and stateless agentic applications.

## Backend API

The backend acts as a proxy for all requests, to the LLM or to functions the LLM wants to call. It handles x402 payment requirements for all these requests, and manages the pricing for each including the option to price requests dynamically based on the contents of the request or other factors.

### Endpoints


- **GET /tools** - Tool discovery endpoint returning JSON descriptors with name, description, input schemas, and prices
- **POST /tools/:name/invoke** - Invokes named tool with JSON input, protected with x402 payment middleware
- **POST /v1/chat/completions** - OpenAI-compatible chat completions endpoint with tool orchestration (optionally paywalled)

### Chat Payment Configuration

You can configure whether of how users pay for chat completions, with flexible monetisation options:

**Charge per request:**
```typescript
createToolServer({
  // ...
  chatPaymentPrice: { asset: 'USDC', amount: '0.01', mint: USDC_MINT }
})
```

**Charge per input token passed:**
This allows you to charge per input token, making it possible to cover your AI provider costs or even profit from LLM requests (note the cost doesn't include output tokens, so it's recommended to over-charge for input tokens so the output tokens are covered on average)
```typescript
createToolServer({
  // ...
  chatPaymentPrice: {
      asset: "USDC",
      mint: USDC_MINT,
      costPerToken: "100", // 100 micro-USDC per token (0.0001 USDC)
      baseAmount: "0", // Optional base amount
      min: "10000", // Minimum 10000 micro-USDC (0.01 USDC) per request
  }
})
```

**Make chat free:**
```typescript
createToolServer({
  // ...
  chatPaymentPrice: null  // Chat is free, tools still require payment
})
```


### Tool Registration

Note that tools are defined with zod input schemas. This allows the LLM to easily generate valid parameters for calling the tools.

```typescript

// For USDC payments (requires mint address):
import { PublicKey } from '@solana/web3.js';
const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'); // devnet
registerTool({
  name: 'web-search',
  description: 'Retrieve the top 10 tokens by market cap from Coingeck',
  inputSchema: z.object({ 
    query: z.string(), 
    limit: z.number().optional() 
  }),
  price: { asset: 'USDC', amount: '100000', mint: USDC_MINT }, // 0.1 USDC
  handler: async (args) => {
    // call Coingecko using your API key
    return { results: [...] };
  }
});
```

### Payment Middleware

An x402 middleware is added to every request to a chat completions or tool invocation endpoint. As per the x402 protocol, it returns an HTTP 402 error if there is no `X-Payment` header. When the header is provided (by the client SDK), it verifies the signed transaction with an x402 facilitator, completes the request, then settles the payment before returning the response to the client.

## Frontend SDK

The frontend SDK interacts with the server over HTTP, but intercepts 402 responses and handles payment appropriately. It also includes tools for discovering and manually executing your defined function tools.

### Automatic 402 Payment Handling

When the backend responds with 402 Payment Required:
1. SDK constructs and signs Solana payment transaction with wallet
2. Encodes signed transaction as base64 proof in `X-Payment` header
3. Retries original request transparently after payment confirmation

### Chat Completions

This is compatible with the OpenAI SDK & API, as well as many of the other large LLM providers:

```typescript
const response = await client.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'What is Solana?' }],
  tools: 'auto'
});
```

If the LLM decides to call a function, the frontend should detect this based on the response and call the function as in the [OpenAI documentation](https://platform.openai.com/docs/guides/function-calling#function-tool-example). See the example app in `/examples/frontend` for a full implementation of the flow.

### Direct Tool Invocation

This will call a tool directly, handling any required payment.

```typescript
const result = await client.tools.invoke('web-search', { 
  query: 'Solana news' 
});
```


## Project Structure

```
x402-agent-gateway-monorepo/
├── packages/
│   ├── server/              # Backend SDK
│   │   ├── src/
│   │   │   └── ...
│   │   └── __tests__/               # Unit tests
│   │
│   └── client/              # Frontend SDK
│       ├── src/
│       │   └── ...
│       └── __tests__/               # Unit tests
│
└── examples/
    ├── backend/             # Example backend server
    │   └── src/index.ts     # Server with sample tools
    │
    └── frontend/            # Example frontend client
        └── src/             # React frontend application
```

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
