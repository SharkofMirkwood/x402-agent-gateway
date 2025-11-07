# Multi-stage build for x402 integration tests with workspace support
# Build context must be the monorepo root: docker build -f tests/integration/Dockerfile .

# Stage 1: Install dependencies and build SDKs
FROM node:20-slim AS builder

WORKDIR /app

# Copy workspace configuration
COPY package*.json ./
COPY tsconfig.base.json ./

# Copy SDK packages
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/

# Copy integration tests package.json
COPY tests/integration/package.json ./tests/integration/

# Install all workspace dependencies
RUN npm install

# Copy SDK source code
COPY packages/server/ ./packages/server/
COPY packages/client/ ./packages/client/

# Build SDKs
RUN npm run build -w @x402-agent-gateway/server
RUN npm run build -w @x402-agent-gateway/client

# Copy integration test source
COPY tests/integration/ ./tests/integration/

# Stage 2: Copy Solana binaries from tchambard/solana-test-validator image
FROM tchambard/solana-test-validator AS solana

# Stage 3: Test runtime
FROM node:20-slim AS test

WORKDIR /app

# Copy Solana CLI tools from tchambard/solana-test-validator image
# Binaries are located at /home/ubuntu/.local/share/solana/install/active_release/bin/
COPY --from=solana /home/ubuntu/.local/share/solana/install/active_release/bin/solana* /usr/local/bin/

# Verify Solana CLI tools are accessible
RUN solana --version && solana-test-validator --version

# Copy package files and lock file for consistent installs
COPY package*.json ./
COPY tsconfig.base.json ./
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/
COPY tests/integration/package.json ./tests/integration/

# Copy built artifacts from builder
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/server/package.json ./packages/server/
COPY --from=builder /app/packages/client/dist ./packages/client/dist
COPY --from=builder /app/packages/client/package.json ./packages/client/

# Copy source files for Jest moduleNameMapper (needed for @x402-agent-gateway/* imports)
COPY --from=builder /app/packages/server/src ./packages/server/src
COPY --from=builder /app/packages/client/src ./packages/client/src

# Install all dependencies (including dev dependencies for tests)
# Do this after copying source files so TypeScript can resolve all imports
RUN npm install --workspaces --include-workspace-root

# Copy integration test source
COPY tests/integration/ ./tests/integration/

# Solana CLI tools are already in /usr/local/bin which is in PATH

# Run integration tests
CMD ["npm", "run", "test", "-w", "tests/integration"]

