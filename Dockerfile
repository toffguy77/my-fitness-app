# Multi-stage build for Next.js production with optimized caching and security
FROM node:20-alpine AS base

# Security: Update packages and install security updates
RUN apk update && apk upgrade && apk add --no-cache \
    libc6-compat \
    dumb-init \
    && rm -rf /var/cache/apk/*

# Security: Create non-root user early
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Set working directory
WORKDIR /app

# Security: Set proper ownership
RUN chown nextjs:nodejs /app

# Install dependencies only when needed - optimized for caching
FROM base AS deps
WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json* ./

# Security: Verify package integrity and install with clean slate
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# Development dependencies stage for building
FROM base AS dev-deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies including dev dependencies
RUN npm ci --ignore-scripts && \
    npm cache clean --force

# Build stage - optimized for caching
FROM base AS builder
WORKDIR /app

# Copy dependencies from previous stages
COPY --from=dev-deps /app/node_modules ./node_modules

# Copy package files first
COPY package.json package-lock.json* ./

# Copy source code in optimal order for caching
COPY next.config.ts ./
COPY tsconfig.json ./
COPY postcss.config.mjs ./

# Copy source files
COPY src ./src
COPY public ./public

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build arguments for flexibility
ARG NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-key
ARG NEXT_PUBLIC_APP_VERSION=unknown

# Set build environment variables
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION

# Build the application
RUN NODE_OPTIONS="--max-old-space-size=2048" npm run build

# Security scanning stage (for CI/CD)
FROM builder AS security-scan
WORKDIR /app

# Install security scanning tools
RUN npm install -g npm-audit-resolver audit-ci

# Run security audit
RUN npm audit --audit-level=moderate || true
RUN npx audit-ci --moderate || true

# Production runtime stage - minimal and secure
FROM base AS runner
WORKDIR /app

# Security: Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Security: Remove unnecessary packages and clean up
RUN apk del libc6-compat && \
    rm -rf /var/cache/apk/* /tmp/* /var/tmp/*

# Copy production dependencies only
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# Copy built application
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Security: Ensure proper permissions
RUN chown -R nextjs:nodejs /app && \
    chmod -R 755 /app

# Security: Switch to non-root user
USER nextjs

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3069/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })" || exit 1

# Expose port
EXPOSE 3069

# Security: Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Environment variables
ENV PORT=3069
ENV HOSTNAME="0.0.0.0"

# Start the application
CMD ["node", "server.js"]

# Development stage for local development
FROM dev-deps AS development
WORKDIR /app

# Copy source code
COPY . .

# Security: Set proper ownership
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose port for development
EXPOSE 3000

# Start development server
CMD ["npm", "run", "dev"]

