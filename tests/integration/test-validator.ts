import { spawn, ChildProcess } from "child_process";
import { Keypair, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

export class TestValidator {
  private process: ChildProcess | null = null;
  private ledgerPath: string;
  private rpcUrl: string;
  private rpcPort: number;
  private connections: Connection[] = [];
  private static portCounter = 8900; // Start from 8900 to avoid conflicts

  constructor() {
    // Use a unique port for each validator instance to avoid conflicts
    this.rpcPort = TestValidator.portCounter++;
    this.rpcUrl = `http://127.0.0.1:${this.rpcPort}`;
    // Use unique ledger path to avoid conflicts between test runs
    const uniqueId = randomUUID().substring(0, 8);
    this.ledgerPath = path.join(__dirname, `.test-ledger-${uniqueId}`);
  }

  async start(): Promise<void> {
    await this.cleanLedger();

    return new Promise((resolve, reject) => {
      this.process = spawn(
        "solana-test-validator",
        [
          "--ledger",
          this.ledgerPath,
          "--reset",
          "--quiet",
          "--rpc-port",
          this.rpcPort.toString(),
          "--bind-address",
          "127.0.0.1",
        ],
        {
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env },
        }
      );

      if (!this.process.stdout || !this.process.stderr) {
        reject(new Error("Failed to capture validator output"));
        return;
      }

      let started = false;
      let errorOutput = "";
      const timeout = setTimeout(() => {
        if (!started) {
          this.stop().catch(() => {});
          reject(
            new Error(
              `Validator failed to start within timeout. Last error: ${errorOutput}`
            )
          );
        }
      }, 60000);

      this.process.stdout.on("data", (data) => {
        const output = data.toString();
        if (
          output.includes("Waiting for fees to stabilize") ||
          output.includes("RPC service listening on")
        ) {
          if (!started) {
            started = true;
            clearTimeout(timeout);
            this.waitForReady().then(resolve).catch(reject);
          }
        }
      });

      this.process.stderr.on("data", (data) => {
        const output = data.toString();
        errorOutput = output;
        if (!output.includes("deprecated") && !output.includes("warning")) {
          console.error(`Validator stderr: ${output}`);
        }
      });

      this.process.on("error", (error) => {
        clearTimeout(timeout);
        reject(
          new Error(
            `Failed to start validator: ${error.message}. Make sure solana-test-validator is installed.`
          )
        );
      });

      this.process.on("exit", (code, signal) => {
        if (!started) {
          clearTimeout(timeout);
          const errorMsg = code
            ? `Validator exited early with code ${code}`
            : `Validator exited early with signal ${signal}`;
          reject(
            new Error(`${errorMsg}. Error output: ${errorOutput || "none"}`)
          );
        }
      });
    });
  }

  private async waitForReady(): Promise<void> {
    const connection = this.getConnection();
    const maxAttempts = 60; // Increased attempts for slower systems
    const delayMs = 500;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        await connection.getVersion();
        // Additional check: try to get slot to ensure validator is fully ready
        await connection.getSlot();
        return;
      } catch (error) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw new Error(
      `Validator failed to become ready after ${maxAttempts} attempts`
    );
  }

  async stop(): Promise<void> {
    // Close all WebSocket connections before stopping the validator
    // This prevents "ws error: connect ECONNREFUSED" after tests complete
    for (const connection of this.connections) {
      try {
        const rpcWebSocket = (connection as any)._rpcWebSocket;
        if (rpcWebSocket && typeof rpcWebSocket.close === "function") {
          rpcWebSocket.close();
        }
        if (typeof (connection as any).close === "function") {
          (connection as any).close();
        }
      } catch (error) {}
    }
    this.connections = [];

    if (this.process) {
      this.process.kill("SIGTERM");

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.process) {
            this.process.kill("SIGKILL");
          }
          resolve();
        }, 10000); // Increased timeout for slower systems

        if (this.process) {
          this.process.on("exit", () => {
            clearTimeout(timeout);
            resolve();
          });
        } else {
          clearTimeout(timeout);
          resolve();
        }
      });

      this.process = null;
    }

    // Increased timeout to allow connections created by client/server to close
    await new Promise((resolve) => setTimeout(resolve, 2000));

    await this.cleanLedger();
  }

  private async cleanLedger(): Promise<void> {
    try {
      await fs.rm(this.ledgerPath, { recursive: true, force: true });
    } catch (error) {}
  }

  getConnection(): Connection {
    const connection = new Connection(this.rpcUrl, "confirmed");
    this.connections.push(connection);
    return connection;
  }

  getRpcUrl(): string {
    return this.rpcUrl;
  }

  async fundWallet(
    keypair: Keypair,
    lamports: number = LAMPORTS_PER_SOL
  ): Promise<void> {
    const connection = this.getConnection();

    const airdropSignature = await connection.requestAirdrop(
      keypair.publicKey,
      lamports
    );

    await connection.confirmTransaction(airdropSignature, "confirmed");
  }

  async createFundedWallet(
    lamports: number = LAMPORTS_PER_SOL
  ): Promise<Keypair> {
    const keypair = Keypair.generate();
    await this.fundWallet(keypair, lamports);
    return keypair;
  }
}

export async function withTestValidator<T>(
  fn: (validator: TestValidator) => Promise<T>
): Promise<T> {
  const validator = new TestValidator();

  try {
    await validator.start();
    return await fn(validator);
  } finally {
    await validator.stop();
  }
}
