# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG PNPM_VERSION=11.1.2
ARG NPM_REGISTRY=https://registry.npmjs.org/
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV npm_config_registry=${NPM_REGISTRY}
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}/bin:${PNPM_HOME}:${PATH}

FROM base AS deps
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm config set registry ${NPM_REGISTRY} \
  && pnpm config set store-dir /pnpm/store \
  && CI=true pnpm install --frozen-lockfile \
    --network-concurrency=4 \
    --fetch-retries=5 \
    --fetch-retry-factor=2 \
    --fetch-retry-mintimeout=20000 \
    --fetch-retry-maxtimeout=120000 \
    --fetch-timeout=300000

FROM base AS builder
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN chmod +x scripts/*.sh \
  && DATABASE_URL="postgresql://image2:change-me@localhost:5432/image2?schema=public" scripts/use-postgres-prisma.sh \
  && NEXT_STANDALONE=true pnpm build \
  && pnpm build:worker

FROM base AS runner
WORKDIR /app
ARG APP_VERSION=dev
ENV NODE_ENV=production
ENV APP_VERSION=${APP_VERSION}
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NODE_PATH=/opt/runtime-node_modules

RUN apk add --no-cache su-exec \
  && addgroup -S nodejs \
  && adduser -S nextjs -G nodejs

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/node_modules /opt/runtime-node_modules
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/dist-worker ./dist-worker
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts

RUN rm -rf data public/generated public/uploads storage \
  && mkdir -p public/generated public/uploads storage \
  && chmod +x scripts/*.sh \
  && chown -R nextjs:nodejs /app

RUN set -eu; \
  prisma_generated_dir="$(find /opt/runtime-node_modules/.pnpm -type d -path '*/node_modules/.prisma' | head -n 1)"; \
  if [ -z "$prisma_generated_dir" ]; then \
    echo "Docker build failed: Prisma generated client artifacts were not found in /opt/runtime-node_modules/.pnpm." >&2; \
    exit 1; \
  fi; \
  rm -rf /app/node_modules/.prisma /opt/runtime-node_modules/.prisma; \
  mkdir -p /app/node_modules/.prisma /opt/runtime-node_modules/.prisma; \
  cp -R "$prisma_generated_dir"/. /app/node_modules/.prisma/; \
  cp -R "$prisma_generated_dir"/. /opt/runtime-node_modules/.prisma/; \
  NODE_PATH=/opt/runtime-node_modules node -e "require('@prisma/client'); require('bullmq'); require('ioredis')"

EXPOSE 3000

CMD ["scripts/docker-entrypoint.sh"]
