# Multi-stage Dockerfile for x402 backend example
# Supports both development and production builds
# Build context must be the monorepo root: docker build -f examples/backend/Dockerfile .
#
# For development: docker build --target dev -f examples/backend/Dockerfile .
# For production: docker build --target prod -f examples/backend/Dockerfile .

# Stage 1: Base dependencies
FROM node:20-alpine AS base

WORKDIR /app

# Copy workspace configuration
COPY package*.json ./
COPY tsconfig.base.json ./

# Copy SDK packages
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/

# Copy example backend package.json
COPY examples/backend/package.json ./examples/backend/

# Install all workspace dependencies
RUN npm install

# Stage 2: Builder (for production builds)
FROM base AS builder

# Copy SDK source code
COPY packages/server/ ./packages/server/
COPY packages/client/ ./packages/client/

# Build SDKs
RUN npm run build -w @x402-agent-gateway/server
RUN npm run build -w @x402-agent-gateway/client

# Copy backend example source
COPY examples/backend/ ./examples/backend/

# Build backend example
RUN npm run build -w examples/backend

# Stage 3: Development runtime
FROM base AS dev

# Copy SDK source (will be volume-mounted in development)
COPY packages/ ./packages/

# Copy backend source (will be volume-mounted in development)
COPY examples/backend/ ./examples/backend/

# Build server package so it can be resolved by TypeScript
RUN npm run build -w packages/server

# Expose backend port
EXPOSE 3000

# Development server with ts-node
CMD ["npm", "run", "dev", "-w", "examples/backend"]

# Stage 4: Production runtime
FROM node:20-alpine AS prod

WORKDIR /app

# Copy package files for production dependencies
COPY package*.json ./
COPY packages/server/package.json ./packages/server/
COPY examples/backend/package.json ./examples/backend/

# Install production dependencies only
RUN npm install --production --workspaces

# Copy built artifacts from builder
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/server/package.json ./packages/server/
COPY --from=builder /app/examples/backend/dist ./examples/backend/dist

# Expose backend port
EXPOSE 3000

# Run the backend server
CMD ["node", "examples/backend/dist/index.js"]
