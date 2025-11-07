# Multi-stage Dockerfile for x402 frontend example
# Supports both development and production builds
# Build context must be the monorepo root: docker build -f examples/frontend/Dockerfile .
#
# For development: docker build --target dev -f examples/frontend/Dockerfile .
# For production: docker build --target prod -f examples/frontend/Dockerfile .

# Stage 1: Base dependencies
FROM node:20-alpine AS base

WORKDIR /app

# Copy workspace configuration
COPY package*.json ./
COPY tsconfig.base.json ./

# Copy SDK packages
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/

# Copy frontend package.json
COPY examples/frontend/package.json ./examples/frontend/

# Install all workspace dependencies
RUN npm install

# Stage 2: Builder (for production builds)
FROM base AS builder

# Copy SDK source code
COPY packages/server/ ./packages/server/
COPY packages/client/ ./packages/client/

# Build client SDK
RUN npm run build -w @x402-agent-gateway/client

# Copy frontend source
COPY examples/frontend/ ./examples/frontend/

# Build frontend (Vite production build)
RUN npm run build -w examples/frontend

# Stage 3: Development runtime
FROM base AS dev

# Copy SDK source (will be volume-mounted in development)
COPY packages/ ./packages/

# Copy frontend source (will be volume-mounted in development)
COPY examples/frontend/ ./examples/frontend/

# Build client package so it can be resolved by TypeScript
RUN npm run build -w packages/client

# Expose Vite dev server port
EXPOSE 5000

# Development server with hot reload
CMD ["npm", "run", "dev", "-w", "examples/frontend"]

# Stage 4: Production runtime (nginx)
FROM nginx:alpine AS prod

# Copy custom nginx configuration
COPY examples/frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built frontend from builder
COPY --from=builder /app/examples/frontend/dist /usr/share/nginx/html

# Expose frontend port
EXPOSE 5000

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
