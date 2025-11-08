import {
  createToolServer,
  registerTool,
  registry,
} from "@x402-agent-gateway/server";
import { PublicKey } from "@solana/web3.js";
import { z } from "zod";

const RECIPIENT_WALLET = process.env.RECIPIENT_WALLET as string;
const PORT = parseInt(process.env.PORT || "3000");
const DEV_MODE = process.env.DEV_MODE === "true";
const NETWORK = (process.env.NETWORK || "solana") as "solana" | "solana-devnet";
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || "";
const COINGECKO_BASE_URL = "https://pro-api.coingecko.com/api/v3";

// USDC mint address (mainnet: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)
// For devnet, use: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
const USDC_MINT = new PublicKey(
  NETWORK === "solana"
    ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    : "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);

// USDC amounts are in micro-units (6 decimals): 0.01 USDC = 10000
// Token-based pricing: calculates price dynamically based on message token count
const CHAT_PAYMENT_PRICE = process.env.CHAT_PAYMENT_STATIC
  ? // Static pricing (if CHAT_PAYMENT_STATIC is set)
    {
      asset: "USDC",
      amount: process.env.CHAT_PAYMENT_STATIC,
      mint: USDC_MINT,
    }
  : // Dynamic token-based pricing (default)
    {
      asset: "USDC",
      mint: USDC_MINT,
      costPerToken: process.env.CHAT_COST_PER_TOKEN || "1", // 1 micro-USDC per token (0.000001 USDC)
      baseAmount: process.env.CHAT_BASE_AMOUNT || "0", // Optional base amount
      min: process.env.CHAT_MIN_AMOUNT || "10000", // Minimum 10000 micro-USDC (0.01 USDC) - facilitator may reject smaller amounts
      max: process.env.CHAT_MAX_AMOUNT, // Optional maximum
      model: process.env.CHAT_MODEL || "gpt-4o", // Model for token counting
    };

const server = createToolServer({
  port: PORT,
  // facilitatorUrl: "https://facilitator.x402.rs",
  facilitatorUrl: "https://facilitator.payai.network",
  recipientWallet: RECIPIENT_WALLET,
  network: NETWORK,
  devMode: DEV_MODE,
  chatPaymentPrice: CHAT_PAYMENT_PRICE,
  openaiApiKey: process.env.OPENAI_API_KEY,
});

registerTool({
  name: "calculate",
  description: "Performs basic arithmetic calculations",
  inputSchema: z.object({
    operation: z.enum(["add", "subtract", "multiply", "divide"]),
    a: z.number(),
    b: z.number(),
  }),
  price: {
    asset: "USDC",
    amount: "5000",
    mint: USDC_MINT,
  },
  handler: async (args) => {
    console.log(`[Calculate] ${args.a} ${args.operation} ${args.b}`);

    let result: number;
    switch (args.operation) {
      case "add":
        result = args.a + args.b;
        break;
      case "subtract":
        result = args.a - args.b;
        break;
      case "multiply":
        result = args.a * args.b;
        break;
      case "divide":
        if (args.b === 0) throw new Error("Division by zero");
        result = args.a / args.b;
        break;
      default:
        throw new Error(`Unknown operation: ${args.operation}`);
    }

    return {
      operation: args.operation,
      a: args.a,
      b: args.b,
      result,
    };
  },
});

// CoinGecko API Tools

// Helper function to make CoinGecko API requests
async function coingeckoRequest(
  endpoint: string,
  params?: Record<string, string>
) {
  const url = new URL(`${COINGECKO_BASE_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }

  const headers: Record<string, string> = {
    "User-Agent": "x402-agent-gateway/1.0",
  };

  if (COINGECKO_API_KEY) {
    headers["x-cg-pro-api-key"] = COINGECKO_API_KEY;
  }

  const response = await fetch(url.toString(), { headers });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `CoinGecko API error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  return response.json();
}

registerTool({
  name: "get-coins-list",
  description:
    "Get a list of all supported coins on CoinGecko with their IDs, names, and symbols. Optionally include platform and contract address information.",
  inputSchema: z.object({
    includePlatform: z.boolean().optional().default(false),
    status: z.enum(["active", "inactive"]).optional().default("active"),
  }),
  price: {
    asset: "USDC",
    amount: "15000",
    mint: USDC_MINT,
  },
  handler: async (args) => {
    console.log(
      `[CoinGecko] Getting coins list (includePlatform: ${args.includePlatform}, status: ${args.status})`
    );

    try {
      const params: Record<string, string> = {};
      if (args.includePlatform) {
        params.include_platform = "true";
      }
      if (args.status) {
        params.status = args.status;
      }

      const data = await coingeckoRequest("/coins/list", params);

      return {
        count: Array.isArray(data) ? data.length : 0,
        coins: Array.isArray(data) ? data.slice(0, 100) : data, // Limit to first 100 for response size
        totalAvailable: Array.isArray(data) ? data.length : 0,
        note:
          Array.isArray(data) && data.length > 100
            ? "Showing first 100 coins. Use search-coins to find specific coins."
            : undefined,
      };
    } catch (error) {
      throw new Error(
        `Failed to fetch coins list: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  },
});

registerTool({
  name: "get-coin-data",
  description:
    "Get detailed information about a specific cryptocurrency coin by its CoinGecko ID. Returns market data, price, market cap, volume, and more.",
  inputSchema: z.object({
    coinId: z
      .string()
      .describe("The CoinGecko coin ID (e.g., 'bitcoin', 'ethereum')"),
    localization: z.boolean().optional().default(true),
    tickers: z.boolean().optional().default(false),
    marketData: z.boolean().optional().default(true),
    communityData: z.boolean().optional().default(false),
    developerData: z.boolean().optional().default(false),
    sparkline: z.boolean().optional().default(false),
  }),
  price: {
    asset: "USDC",
    amount: "20000",
    mint: USDC_MINT,
  },
  handler: async (args) => {
    console.log(`[CoinGecko] Getting coin data for: ${args.coinId}`);

    try {
      const params: Record<string, string> = {
        localization: args.localization ? "true" : "false",
        tickers: args.tickers ? "true" : "false",
        market_data: args.marketData ? "true" : "false",
        community_data: args.communityData ? "true" : "false",
        developer_data: args.developerData ? "true" : "false",
        sparkline: args.sparkline ? "true" : "false",
      };

      const data = (await coingeckoRequest(
        `/coins/${args.coinId}`,
        params
      )) as any;

      // Extract only essential fields, filtering out large objects like marketData
      const result: any = {
        id: data.id,
        symbol: data.symbol,
        name: data.name,
        description: data.description?.en || data.description,
        currentPrice: data.market_data?.current_price,
        marketCap: data.market_data?.market_cap,
        totalVolume: data.market_data?.total_volume,
        priceChange24h: data.market_data?.price_change_percentage_24h,
        high24h: data.market_data?.high_24h,
        low24h: data.market_data?.low_24h,
        circulatingSupply: data.market_data?.circulating_supply,
        totalSupply: data.market_data?.total_supply,
        maxSupply: data.market_data?.max_supply,
        image: data.image,
      };

      // Only include links if they exist and are not too large
      if (data.links && typeof data.links === "object") {
        result.links = {
          homepage: data.links.homepage?.[0] || data.links.homepage,
          blockchain_site: data.links.blockchain_site?.slice(0, 3),
          official_forum_url: data.links.official_forum_url?.slice(0, 3),
          twitter_screen_name: data.links.twitter_screen_name,
          facebook_username: data.links.facebook_username,
          subreddit_url: data.links.subreddit_url,
        };
      }

      return result;
    } catch (error) {
      throw new Error(
        `Failed to fetch coin data: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  },
});

registerTool({
  name: "get-coin-price",
  description:
    "Get current price and market data for one or more cryptocurrencies. Supports multiple coin IDs and multiple currencies.",
  inputSchema: z.object({
    coinIds: z
      .string()
      .describe(
        "Comma-separated list of CoinGecko coin IDs (e.g., 'bitcoin,ethereum,solana')"
      ),
    vsCurrencies: z
      .string()
      .optional()
      .default("usd")
      .describe(
        "Comma-separated list of target currencies (e.g., 'usd,eur,btc')"
      ),
    includeMarketCap: z.boolean().optional().default(true),
    include24hrVol: z.boolean().optional().default(true),
    include24hrChange: z.boolean().optional().default(true),
    includeLastUpdatedAt: z.boolean().optional().default(true),
  }),
  price: {
    asset: "USDC",
    amount: "15000",
    mint: USDC_MINT,
  },
  handler: async (args) => {
    console.log(
      `[CoinGecko] Getting prices for: ${args.coinIds} in ${args.vsCurrencies}`
    );

    try {
      const params: Record<string, string> = {
        ids: args.coinIds,
        vs_currencies: args.vsCurrencies,
        include_market_cap: args.includeMarketCap ? "true" : "false",
        include_24hr_vol: args.include24hrVol ? "true" : "false",
        include_24hr_change: args.include24hrChange ? "true" : "false",
        include_last_updated_at: args.includeLastUpdatedAt ? "true" : "false",
      };

      const data = await coingeckoRequest("/simple/price", params);

      return {
        prices: data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(
        `Failed to fetch coin prices: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  },
});

registerTool({
  name: "search-coins",
  description:
    "Search for cryptocurrencies by name or symbol. Returns matching coins with their IDs, names, and symbols. Useful for finding the correct coin ID to use with other tools.",
  inputSchema: z.object({
    query: z.string().describe("Search query (coin name or symbol)"),
    limit: z.number().optional().default(10),
  }),
  price: {
    asset: "USDC",
    amount: "10000",
    mint: USDC_MINT,
  },
  handler: async (args) => {
    console.log(`[CoinGecko] Searching for coins: ${args.query}`);

    try {
      // First get the coins list
      const allCoins = await coingeckoRequest("/coins/list", {
        include_platform: "false",
      });

      if (!Array.isArray(allCoins)) {
        throw new Error("Unexpected response format from CoinGecko API");
      }

      // Filter coins by query (case-insensitive search in name and symbol)
      const queryLower = args.query.toLowerCase();
      const matches = allCoins.filter(
        (coin: { name: string; symbol: string; id: string }) =>
          coin.name.toLowerCase().includes(queryLower) ||
          coin.symbol.toLowerCase().includes(queryLower) ||
          coin.id.toLowerCase().includes(queryLower)
      );

      // Sort by relevance (exact matches first, then by name)
      matches.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const aSymbol = a.symbol.toLowerCase();
        const bSymbol = b.symbol.toLowerCase();
        const aId = a.id.toLowerCase();
        const bId = b.id.toLowerCase();

        const aExact =
          aName === queryLower || aSymbol === queryLower || aId === queryLower;
        const bExact =
          bName === queryLower || bSymbol === queryLower || bId === queryLower;

        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        if (aName.startsWith(queryLower) && !bName.startsWith(queryLower))
          return -1;
        if (!aName.startsWith(queryLower) && bName.startsWith(queryLower))
          return 1;
        return aName.localeCompare(bName);
      });

      return {
        query: args.query,
        matches: matches.slice(0, args.limit),
        totalMatches: matches.length,
        showing: Math.min(args.limit, matches.length),
      };
    } catch (error) {
      throw new Error(
        `Failed to search coins: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  },
});

registerTool({
  name: "get-coin-market-data",
  description:
    "Get market data for cryptocurrencies including price, market cap, volume, and price changes. Supports multiple coins and currencies.",
  inputSchema: z.object({
    coinIds: z
      .string()
      .describe(
        "Comma-separated list of CoinGecko coin IDs (e.g., 'bitcoin,ethereum')"
      ),
    vsCurrency: z.string().optional().default("usd"),
    order: z
      .enum(["market_cap_desc", "market_cap_asc", "volume_desc", "volume_asc"])
      .optional()
      .default("market_cap_desc"),
    perPage: z.number().optional().default(100),
    page: z.number().optional().default(1),
    sparkline: z.boolean().optional().default(false),
    priceChangePercentage: z
      .string()
      .optional()
      .describe(
        "Comma-separated time ranges for price change (e.g., '24h,7d,30d')"
      ),
  }),
  price: {
    asset: "USDC",
    amount: "20000",
    mint: USDC_MINT,
  },
  handler: async (args) => {
    console.log(
      `[CoinGecko] Getting market data for: ${args.coinIds} in ${args.vsCurrency}`
    );

    try {
      const params: Record<string, string> = {
        vs_currency: args.vsCurrency,
        ids: args.coinIds,
        order: args.order,
        per_page: args.perPage.toString(),
        page: args.page.toString(),
        sparkline: args.sparkline ? "true" : "false",
      };

      if (args.priceChangePercentage) {
        params.price_change_percentage = args.priceChangePercentage;
      }

      const data = await coingeckoRequest("/coins/markets", params);

      return {
        markets: Array.isArray(data) ? data : [data],
        count: Array.isArray(data) ? data.length : 1,
        vsCurrency: args.vsCurrency,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(
        `Failed to fetch market data: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  },
});

// CoinGecko NFT API Tools

registerTool({
  name: "get-nft-list",
  description:
    "Get a list of all supported NFT collections on CoinGecko with their IDs, names, symbols, and contract addresses.",
  inputSchema: z.object({
    assetPlatformId: z
      .string()
      .optional()
      .describe(
        "Filter by asset platform ID (e.g., 'ethereum', 'solana', 'polygon-pos')"
      ),
    limit: z.number().optional().default(100),
  }),
  price: {
    asset: "USDC",
    amount: "15000",
    mint: USDC_MINT,
  },
  handler: async (args) => {
    console.log(
      `[CoinGecko NFT] Getting NFT list (assetPlatformId: ${
        args.assetPlatformId || "all"
      })`
    );

    try {
      const data = (await coingeckoRequest("/nfts/list")) as any[];

      if (!Array.isArray(data)) {
        throw new Error("Unexpected response format from CoinGecko API");
      }

      // Filter by asset platform if specified
      let filtered = data;
      if (args.assetPlatformId) {
        filtered = data.filter(
          (nft: any) =>
            nft.asset_platform_id?.toLowerCase() ===
            args.assetPlatformId?.toLowerCase()
        );
      }

      return {
        count: filtered.length,
        nfts: filtered.slice(0, args.limit),
        totalAvailable: filtered.length,
        showing: Math.min(args.limit, filtered.length),
        assetPlatformId: args.assetPlatformId || "all",
      };
    } catch (error) {
      throw new Error(
        `Failed to fetch NFT list: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  },
});

registerTool({
  name: "get-nft-data",
  description:
    "Get detailed information about a specific NFT collection by its CoinGecko ID. Returns floor price, market cap, volume, and collection details.",
  inputSchema: z.object({
    nftId: z
      .string()
      .describe(
        "The CoinGecko NFT collection ID (e.g., 'cryptopunks', 'bored-ape-yacht-club')"
      ),
  }),
  price: {
    asset: "USDC",
    amount: "20000",
    mint: USDC_MINT,
  },
  handler: async (args) => {
    console.log(`[CoinGecko NFT] Getting NFT data for: ${args.nftId}`);

    try {
      const data = (await coingeckoRequest(`/nfts/${args.nftId}`)) as any;

      // Extract only essential fields, filtering out large objects
      const result: any = {
        id: data.id,
        contract_address: data.contract_address,
        asset_platform_id: data.asset_platform_id,
        name: data.name,
        symbol: data.symbol,
        image: data.image?.small || data.image,
        description: data.description,
        floor_price: data.floor_price,
        floor_price_in_usd_24h_percentage_change:
          data.floor_price_in_usd_24h_percentage_change,
        market_cap: data.market_cap,
        market_cap_24h_percentage_change: data.market_cap_24h_percentage_change,
        volume_24h: data.volume_24h,
        number_of_unique_addresses: data.number_of_unique_addresses,
        number_of_unique_addresses_24h_percentage_change:
          data.number_of_unique_addresses_24h_percentage_change,
        total_supply: data.total_supply,
      };

      // Include links if available (limited to essential ones)
      if (data.links && typeof data.links === "object") {
        result.links = {
          homepage: data.links.homepage?.[0] || data.links.homepage,
          twitter: data.links.twitter,
          discord: data.links.discord,
        };
      }

      return result;
    } catch (error) {
      throw new Error(
        `Failed to fetch NFT data: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  },
});

registerTool({
  name: "donate",
  description:
    "Donate USDC to support the service. The donation amount will be charged when this tool is invoked.",
  inputSchema: z.object({
    amount: z
      .string()
      .describe(
        "The amount of USDC to donate in normal USD format. For example, '0.01' = 0.01 USDC, '1.5' = 1.5 USDC, '10' = 10 USDC"
      ),
  }),
  price: (args: any) => {
    // Extract amount from request body and convert from USD to micro-USDC
    const donationAmountUSD = parseFloat(args.amount || "0");
    if (isNaN(donationAmountUSD) || donationAmountUSD <= 0) {
      throw new Error("Invalid donation amount. Must be a positive number.");
    }
    // Convert from USD to micro-USDC (6 decimals: multiply by 1,000,000)
    const donationAmountMicroUSDC = Math.floor(donationAmountUSD * 1000000);
    return {
      asset: "USDC",
      amount: donationAmountMicroUSDC.toString(),
      mint: USDC_MINT,
    };
  },
  handler: async (args) => {
    console.log(`[Donate] Donation amount: ${args.amount} USDC`);
    return {
      success: true,
      message: `Thank you for your donation of ${args.amount} USDC!`,
      amount: args.amount,
    };
  },
});

server.start();

console.log("=".repeat(60));
console.log("x402 Tool Server - Example Backend");
console.log("=".repeat(60));
console.log("Available tools:");
const registeredTools = registry.getAll();
for (const tool of registeredTools) {
  console.log(`  - ${tool.name}: ${tool.description}`);
}
console.log("=".repeat(60));
console.log(
  `Dev Mode: ${
    DEV_MODE ? "ENABLED (payments disabled for testing)" : "DISABLED"
  }`
);
console.log(
  `Chat Payments: ${
    CHAT_PAYMENT_PRICE
      ? `${CHAT_PAYMENT_PRICE.amount} ${CHAT_PAYMENT_PRICE.asset}`
      : "FREE (disabled)"
  }`
);
console.log("=".repeat(60));
