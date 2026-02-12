# Multi-stage build for Next.js production (monorepo) with optimized caching and security
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

# Install all dependencies (needed for monorepo workspace build)
FROM base AS deps
WORKDIR /app

# Copy root and workspace package files for layer caching
COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/
COPY packages/utils/package.json ./packages/utils/
COPY packages/config/package.json ./packages/config/

# Install all dependencies (workspaces require dev deps for build)
RUN npm ci --ignore-scripts && \
    npm cache clean --force

# Build stage
FROM base AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy all source files (monorepo needs full context)
COPY . .

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build arguments
ARG NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-key
ARG NEXT_PUBLIC_APP_VERSION=unknown

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION

# Build the web application
RUN NODE_OPTIONS="--max-old-space-size=2048" npm run build --workspace=apps/web

# Production runtime stage - minimal and secure
FROM base AS runner
WORKDIR /app

# Security: Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Security: Remove unnecessary packages and clean up
RUN apk del libc6-compat && \
    rm -rf /var/cache/apk/* /tmp/* /var/tmp/*

# Copy built application from monorepo paths
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static

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
