# ── Semester — production image (multi-stage, ~180 MB) ────────────────────
# Build:  docker compose build
# Run:    docker compose up -d          → http://<host>:8899

# 1. dependencies -----------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --ignore-scripts

# 2. build (public Appwrite vars are inlined at build time) -----------------
FROM node:22-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
ARG NEXT_PUBLIC_APPWRITE_PROJECT_ID=6aac46e3001a9ef65b25
ENV NEXT_PUBLIC_APPWRITE_ENDPOINT=$NEXT_PUBLIC_APPWRITE_ENDPOINT
ENV NEXT_PUBLIC_APPWRITE_PROJECT_ID=$NEXT_PUBLIC_APPWRITE_PROJECT_ID
COPY package.json pnpm-lock.yaml ./
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && pnpm build

# 3. runtime (standalone server, no node_modules needed) --------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8899
ENV HOSTNAME=0.0.0.0

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# uploaded-document text (persisted via the volume in docker-compose.yml)
RUN mkdir -p /app/.data && chown nextjs:nodejs /app/.data
VOLUME ["/app/.data"]

USER nextjs
EXPOSE 8899
CMD ["node", "server.js"]
