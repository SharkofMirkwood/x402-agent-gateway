# @x402-agent-gateway/server

Backend SDK for x402-native agent and tool orchestration. This package provides a server-side framework for creating payment-enabled tool servers with integrated OpenAI chat completions.

For the client SDK, see [@x402-agent-gateway/client](https://www.npmjs.com/package/@x402-agent-gateway/client).

## Installation

```bash
npm install @x402-agent-gateway/server
```

## Quick Start

```typescript
import { createToolServer, registerTool } from '@x402-agent-gateway/server';
import { PublicKey } from '@solana/web3.js';
import { z } from 'zod';

// Create the server
const server = createToolServer({
  port: 3000,
  facilitatorUrl: 'https://facilitator.payai.network',
  recipientWallet: 'YourSolanaWalletAddress',
  network: 'solana-devnet',
  openaiApiKey: process.env.OPENAI_API_KEY,
});

// Register a tool

const USDC_MINT = new PublicKey(
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // Mainnet USDC
  // For devnet: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
);

registerTool({
  name: 'echo',
  description: 'Echoes back the input message',
  inputSchema: z.object({
    message: z.string(),
  }),
  price: {
    asset: 'USDC',
    amount: '10000', // 0.01 USDC (6 decimals)
    mint: USDC_MINT,
  },
  handler: async (args) => {
    return { echo: args.message };
  },
});

// Start the server
server.start();
```

## Configuration

The server accepts a `ServerConfig` object with the following options:

```typescript
interface ServerConfig {
  port?: number;                    // Server port (default: 3000)
  facilitatorUrl: string;           // x402 facilitator URL (required)
  recipientWallet: string;          // Solana wallet address to receive payments (required)
  network: Network;                 // "solana" | "solana-devnet" (required)
  devMode?: boolean;                // Disable payments for testing (default: false)
  openaiApiKey?: string;            // OpenAI API key for chat completions (optional)
  chatPaymentPrice?: ChatPaymentPrice; // Price for chat completions (optional)
}

type ChatPaymentPrice =
  | PaymentPrice                    // Static price
  | TokenBasedPricing               // Dynamic token-based pricing
  | null                            // Free chat completions
  | ((messages: ChatMessage[]) => PaymentPrice | Promise<PaymentPrice>); // Custom function
```

### Configuration Options

- **`port`** (optional): The port number to listen on. Defaults to `3000`
- **`facilitatorUrl`** (required): The URL of the x402 payment facilitator service (e.g., `"https://facilitator.payai.network"`)
- **`recipientWallet`** (required): A valid Solana public key address where payments will be sent
- **`network`** (required): The Solana network to use. Must be either `"solana"` (mainnet) or `"solana-devnet"` (devnet)
- **`devMode`** (optional): When `true`, disables payment verification for testing. Defaults to `false`
- **`openaiApiKey`** (optional): Your OpenAI API key. Required if you want to use the chat completions endpoint
- **`chatPaymentPrice`** (optional): The payment price for chat completions. Can be:
  - `null` - Free chat completions
  - `PaymentPrice` - Static fixed price
  - `TokenBasedPricing` - Dynamic price based on message token count
  - `Function` - Custom pricing function

## Chat Payment Pricing

The `chatPaymentPrice` option supports multiple pricing models:

### Static Pricing

Use a fixed price for all chat completions:

```typescript
const server = createToolServer({
  // ... other config
  chatPaymentPrice: {
    asset: 'USDC',
    amount: '10000', // 0.01 USDC (6 decimals)
    mint: USDC_MINT,
  },
});
```

### Token-Based Pricing (Recommended)

Automatically calculate price based on the number of tokens in the messages. This ensures fair pricing that scales with usage:

```typescript
const server = createToolServer({
  // ... other config
  chatPaymentPrice: {
    asset: 'USDC',
    mint: USDC_MINT,
    costPerToken: '1',        // 1 micro-USDC per token (0.000001 USDC)
    baseAmount: '0',          // Optional base amount to add
    min: '100',                // Minimum price: 100 micro-USDC (0.0001 USDC)
    max: '1000000',            // Optional maximum: 1 USDC
    model: 'gpt-4o',          // Model for token counting (default: "gpt-4o")
  },
});
```

**Token-Based Pricing Options:**

- **`asset`** (required): The payment asset (e.g., `"USDC"`)
- **`mint`** (optional): SPL token mint address (required for tokens, not needed for SOL)
- **`costPerToken`** (required): Price per token in the same unit as `baseAmount`
- **`baseAmount`** (optional): Base amount to add to the token-based calculation (default: `"0"`)
- **`min`** (optional): Minimum price to charge regardless of token count
- **`max`** (optional): Maximum price cap
- **`model`** (optional): OpenAI model name for accurate token counting (default: `"gpt-4o"`)

The final price is calculated as: `max(min, min(max, baseAmount + (tokens × costPerToken)))`

### Custom Function Pricing

For advanced use cases, you can provide a custom function:

```typescript
const server = createToolServer({
  // ... other config
  chatPaymentPrice: async (messages) => {
    // Custom logic to calculate price
    const tokenCount = /* your calculation */;
    return {
      asset: 'USDC',
      amount: (tokenCount * 0.00001).toString(),
      mint: USDC_MINT,
    };
  },
});
```

### Free Chat Completions

Set `chatPaymentPrice` to `null` to make chat completions free:

```typescript
const server = createToolServer({
  // ... other config
  chatPaymentPrice: null, // Free chat completions
});
```

## Registering Tools

Tools are registered using the `registerTool` function. Each tool must have:

- **`name`**: A unique identifier for the tool
- **`description`**: A description of what the tool does (used by OpenAI)
- **`inputSchema`**: A Zod schema defining the input parameters
- **`outputSchema`** (optional): A Zod schema for validating the output
- **`price`**: A fixed price or a function that calculates the price based on input
- **`handler`**: An async function that executes the tool logic

### Fixed Price Example

```typescript
import { registerTool } from '@x402-agent-gateway/server';
import { z } from 'zod';

registerTool({
  name: 'calculate',
  description: 'Performs basic arithmetic calculations',
  inputSchema: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number(),
  }),
  outputSchema: z.object({
    result: z.number(),
  }),
  price: {
    asset: 'USDC',
    amount: '5000', // 0.005 USDC (6 decimals)
    mint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  },
  handler: async (args) => {
    let result: number;
    switch (args.operation) {
      case 'add': result = args.a + args.b; break;
      case 'subtract': result = args.a - args.b; break;
      case 'multiply': result = args.a * args.b; break;
      case 'divide': result = args.a / args.b; break;
    }
    return { result };
  },
});
```

### Dynamic Price Example

```typescript
registerTool({
  name: 'data-processor',
  description: 'Processes data with variable pricing',
  inputSchema: z.object({
    dataSize: z.number(),
  }),
  price: async (args) => {
    // Calculate price based on data size
    const basePrice = 10000; // 0.01 USDC
    const sizeMultiplier = args.dataSize / 1000;
    return {
      asset: 'USDC',
      amount: (basePrice * sizeMultiplier).toString(),
      mint: USDC_MINT,
    };
  },
  handler: async (args) => {
    // Process the data...
    return { processed: true };
  },
});
```

## Payment Price Format

### PaymentPrice Interface

The `price` field for tools accepts either a `PaymentPrice` object or a function that returns one:

```typescript
interface PaymentPrice {
  asset: string;        // Asset name (e.g., "USDC")
  amount: string;       // Amount as a string (supports decimals)
  mint?: PublicKey;     // Required: SPL token mint address
}
```

### TokenBasedPricing Interface

For chat completions, you can use the `TokenBasedPricing` interface for dynamic token-based pricing:

```typescript
interface TokenBasedPricing {
  asset: string;         // Asset name (e.g., "USDC")
  mint?: PublicKey;     // SPL token mint address (required for tokens)
  costPerToken: string; // Price per token
  baseAmount?: string;  // Optional base amount to add
  min?: string;         // Optional minimum price
  max?: string;         // Optional maximum price
  model?: string;       // Model name for token counting (default: "gpt-4o")
}
```

### USDC Payments

```typescript
import { PublicKey } from '@solana/web3.js';

price: {
  asset: 'USDC',
  amount: '10000', // 0.01 USDC (6 decimals)
  mint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
}
```

## API Endpoints

The server automatically creates the following endpoints:

### `GET /tools`

Returns metadata for all registered tools.

**Response:**
```json
[
  {
    "name": "echo",
    "description": "Echoes back the input message",
    "inputSchema": { ... },
    "outputSchema": { ... },
    "price": { ... }
  }
]
```

### `POST /tools/:name/invoke`

Invokes a specific tool. Requires payment verification.

**Request Body:**
```json
{
  "arg1": "value1",
  "arg2": 123
}
```

**Response:**
The tool handler's return value, validated against `outputSchema` if provided.

### `POST /v1/chat/completions`

OpenAI-compatible chat completions endpoint with automatic tool integration.

**Request Body:**
```json
{
  "model": "gpt-4",
  "messages": [
    { "role": "user", "content": "Hello!" }
  ],
  "tools": "auto",
  "temperature": 0.7
}
```

**Response:**
OpenAI-compatible chat completion response with tool calls if applicable.

## Advanced Usage

### Using the Express App Directly

If you need more control, you can access the underlying Express app:

```typescript
const server = createToolServer({ ... });
const app = server.getApp();

// Add custom middleware or routes
app.use('/custom', customRouter);
```

### Manual Router Setup

For more advanced use cases, you can use the router directly:

```typescript
import { createX402Router, registerTool } from '@x402-agent-gateway/server';
import express from 'express';

const app = express();
const router = createX402Router({
  recipientWallet: '...',
  network: 'solana-devnet',
  facilitatorUrl: '...',
  openaiApiKey: process.env.OPENAI_API_KEY,
});

app.use('/', router);
app.listen(3000);
```

## Error Handling

The server returns standardized error responses:

```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable error message",
  "retriable": true,  // Whether the client should retry
  "details": "..."    // Additional error details (optional)
}
```

Common error codes:
- `TOOL_NOT_FOUND`: The requested tool doesn't exist
- `VALIDATION_ERROR`: Input validation failed (not retriable)
- `EXECUTION_ERROR`: Tool execution failed (retriable)
- `PAYMENT_REQUIRED`: Payment verification failed
- `OPENAI_API_ERROR`: OpenAI API error

## Development Mode

When `devMode` is enabled, payment verification is bypassed, allowing you to test your tools without making actual payments:

```typescript
const server = createToolServer({
  // ... other config
  devMode: true, // Payments disabled
});
```


