import { Request, Response, NextFunction } from "express";
import { PublicKey } from "@solana/web3.js";
import { X402PaymentHandler } from "x402-solana/server";
import { PaymentRequirements, PaymentPrice } from "./types";

/**
 * Converts SOL amount (string with decimals) to lamports (uint256 as string)
 * Example: "0.001" -> "1000000"
 */
function solToLamports(solAmount: string): string {
  const lamports = Math.floor(parseFloat(solAmount) * 1e9);
  return lamports.toString();
}

/**
 * Converts a relative path to an absolute URL
 * Example: "/v1/chat/completions" -> "https://example.com/v1/chat/completions"
 */
function getAbsoluteUrl(req: Request): string {
  const protocol = req.protocol || "http";
  const host = req.get("host") || "localhost";
  const path = req.originalUrl || req.url;
  return `${protocol}://${host}${path}`;
}

export interface PaymentConfig {
  recipientWallet: string;
  network: string;
  facilitatorUrl: string;
  devMode?: boolean;
}

let paymentConfig: PaymentConfig;
let x402PaymentHandler: X402PaymentHandler;

export function setPaymentConfig(config: PaymentConfig): void {
  try {
    new PublicKey(config.recipientWallet);
  } catch (error) {
    throw new Error(
      `Invalid recipient wallet address: ${config.recipientWallet}. Must be a valid Solana public key.`
    );
  }

  // facilitatorUrl validation is done in server.ts, no need to duplicate here
  paymentConfig = config;

  x402PaymentHandler = new X402PaymentHandler({
    network: config.network === "solana" ? "solana" : "solana-devnet",
    treasuryAddress: config.recipientWallet,
    facilitatorUrl: config.facilitatorUrl,
  });
}

/**
 * Converts our PaymentPrice format to x402-solana's RouteConfig format
 */
function convertPriceToRouteConfig(
  price: PaymentPrice,
  resource: string,
  description: string,
  maxTimeoutSeconds: number
): Parameters<typeof x402PaymentHandler.createPaymentRequirements>[0] {
  let amount: string;
  let assetAddress: string;

  if (price.asset === "SOL") {
    amount = solToLamports(price.amount);
    assetAddress = ""; // x402-solana may handle SOL differently
  } else {
    amount = price.amount;
    if (price.mint) {
      assetAddress = price.mint.toBase58();
    } else {
      throw new Error("Token payment requires mint address");
    }
  }

  return {
    price: {
      amount: amount,
      asset: {
        address: assetAddress || "",
        decimals: price.asset === "SOL" ? 9 : 6,
      },
    },
    network: paymentConfig.network === "solana" ? "solana" : "solana-devnet",
    config: {
      description: description,
      resource: resource as `${string}://${string}`,
      mimeType: "application/json",
      maxTimeoutSeconds: maxTimeoutSeconds,
    },
  };
}

export function createPaymentMiddleware(
  price: PaymentPrice | ((args: any) => PaymentPrice | Promise<PaymentPrice>)
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (paymentConfig.devMode) {
      return next();
    }

    const paymentHeader = req.headers["x-payment"] as string;

    if (!paymentHeader) {
      let actualPrice: PaymentPrice;
      try {
        if (typeof price === "function") {
          if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({
              code: "INVALID_REQUEST",
              message: "Request body is required",
              retriable: false,
            });
          }
          actualPrice = await price(req.body);
        } else {
          actualPrice = price;
        }
      } catch (error) {
        console.error("Error calculating price:", error);
        return res.status(400).json({
          code: "PRICE_CALCULATION_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to calculate payment price",
          retriable: false,
        });
      }

      const maxTimeoutSeconds = 120;
      const resource = getAbsoluteUrl(req);
      const description = `Payment required for ${req.path}`;

      const routeConfig = convertPriceToRouteConfig(
        actualPrice,
        resource,
        description,
        maxTimeoutSeconds
      );

      const paymentRequirements =
        await x402PaymentHandler.createPaymentRequirements(routeConfig);

      const requirementsWithFacilitator = {
        ...paymentRequirements,
        extra: paymentRequirements.extra
          ? {
              ...(paymentRequirements.extra as object),
              facilitatorUrl: paymentConfig.facilitatorUrl,
            }
          : {
              facilitatorUrl: paymentConfig.facilitatorUrl,
            },
      };

      // The client expects: { x402Version: number, accepts: PaymentRequirements[] }
      return res.status(402).json({
        x402Version: 1,
        accepts: [requirementsWithFacilitator],
        error: "Payment required",
      });
    }

    try {
      let actualPrice: PaymentPrice;
      try {
        if (typeof price === "function") {
          if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({
              code: "INVALID_REQUEST",
              message: "Request body is required",
              retriable: false,
            });
          }
          actualPrice = await price(req.body);
        } else {
          actualPrice = price;
        }
      } catch (error) {
        console.error("Error calculating price for verification:", error);
        return res.status(400).json({
          code: "PRICE_CALCULATION_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to calculate payment price",
          retriable: false,
        });
      }

      const maxTimeoutSeconds = 120;
      const resource = getAbsoluteUrl(req);
      const description = `Payment required for ${req.path}`;

      const routeConfig = convertPriceToRouteConfig(
        actualPrice,
        resource,
        description,
        maxTimeoutSeconds
      );

      const paymentRequirements =
        await x402PaymentHandler.createPaymentRequirements(routeConfig);

      const verifyResult = await x402PaymentHandler.verifyPayment(
        paymentHeader,
        paymentRequirements
      );

      if (!verifyResult.isValid) {
        console.error("Payment verification failed:", verifyResult);
        return res.status(400).json({
          code: "INVALID_PAYMENT",
          message: verifyResult.invalidReason || "Payment verification failed",
          retriable: false,
        });
      }

      const originalEnd = res.end.bind(res);
      let settlementInProgress = false;
      let settlementCompleted = false;

      const performSettlement = async (): Promise<void> => {
        if (settlementCompleted || settlementInProgress) return;
        settlementInProgress = true;

        try {
          // Note: settlePayment expects the requirements in x402-solana format, not our extended format
          const settleResult = await x402PaymentHandler.settlePayment(
            paymentHeader,
            paymentRequirements
          );

          if (settleResult.success && settleResult.transaction) {
            // x402-solana returns transaction hash in the transaction field
            const paymentResponse = {
              txHash: settleResult.transaction,
              networkId: settleResult.network || paymentConfig.network,
            };
            res.setHeader(
              "X-PAYMENT-RESPONSE",
              Buffer.from(JSON.stringify(paymentResponse)).toString("base64")
            );
            console.log(
              "Payment settled by facilitator:",
              settleResult.transaction
            );
            settlementCompleted = true;
          } else {
            const errorMessage =
              settleResult.errorReason || "Payment settlement failed";
            console.error("Payment settlement failed:", errorMessage);
            settlementCompleted = true;
            throw new Error(errorMessage);
          }
        } catch (error) {
          console.error("Error during payment settlement:", error);
          settlementCompleted = true;
          throw error;
        } finally {
          settlementInProgress = false;
        }
      };

      res.end = function (chunk?: any, encoding?: any, cb?: any) {
        if (typeof chunk === "function") {
          cb = chunk;
          chunk = undefined;
          encoding = undefined;
        } else if (typeof encoding === "function") {
          cb = encoding;
          encoding = undefined;
        }

        performSettlement()
          .then(() => {
            if (cb) {
              originalEnd(chunk, encoding as any, cb);
            } else if (encoding) {
              originalEnd(chunk, encoding as any);
            } else {
              originalEnd(chunk);
            }
          })
          .catch((error) => {
            console.error("Payment settlement failed, returning error:", error);
            const errorMessage =
              error instanceof Error
                ? error.message
                : "Payment settlement failed";

            res.status(500);
            res.setHeader("Content-Type", "application/json");

            const errorResponse = {
              code: "SETTLEMENT_ERROR",
              message: errorMessage,
              retriable: true,
            };

            const errorJson = JSON.stringify(errorResponse);
            if (cb) {
              originalEnd(errorJson, "utf8", cb);
            } else {
              originalEnd(errorJson, "utf8");
            }
          });

        return res;
      };

      next();
    } catch (error) {
      return res.status(400).json({
        code: "PAYMENT_ERROR",
        message:
          error instanceof Error ? error.message : "Payment processing failed",
        retriable: false,
      });
    }
  };
}
