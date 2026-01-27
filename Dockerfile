# Multi-stage Dockerfile for LLM Scheduler
# Supports development, build, and production environments

# ============================================
# Stage 1: Development Environment
# ============================================
FROM node:20-alpine AS development

WORKDIR /app

# Install necessary tools and Claude CLI compatibility libraries
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    libc6-compat \
    libgcc \
    libstdc++

# Create nodejs user and setup Claude directories
ARG USER_ID=1001
ARG GROUP_ID=1001
RUN addgroup -g ${GROUP_ID} -S nodejs && \
    adduser -S nodejs -u ${USER_ID} -G nodejs && \
    mkdir -p /home/nodejs/.claude /home/nodejs/.local/share/claude && \
    chown -R nodejs:nodejs /home/nodejs

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY . .

# Expose ports
EXPOSE 5173 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5173', (r) => {if (r.statusCode !== 404) throw new Error(r.statusCode)})"

# Start development server (default)
CMD ["npm", "run", "dev"]

# ============================================
# Stage 2: Build Stage
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY . .

# Build application
RUN npm run build

# ============================================
# Stage 3: Production Environment
# ============================================
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies only
RUN apk add --no-cache \
    dumb-init \
    curl

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy server files
COPY server ./server
COPY src ./src

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start production server with dumb-init to handle signals properly
ENTRYPOINT ["/sbin/dumb-init", "--"]
CMD ["node", "server/index.ts"]
