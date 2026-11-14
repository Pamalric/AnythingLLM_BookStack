# BookStack Sync — multi-stage, utilisateur non-root
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/bookstack-adapter/package.json packages/bookstack-adapter/
COPY packages/anythingllm-adapter/package.json packages/anythingllm-adapter/
COPY packages/sync-engine/package.json packages/sync-engine/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Ré-édite les liens workspace après COPY du code source
RUN pnpm install --frozen-lockfile
ENV DATABASE_URL=file:./prisma/build-placeholder.db
RUN pnpm --filter @bookstack-sync/api exec prisma generate --schema=../../prisma/schema.prisma \
  && pnpm --filter @bookstack-sync/shared build \
  && pnpm --filter @bookstack-sync/bookstack-adapter build \
  && pnpm --filter @bookstack-sync/anythingllm-adapter build \
  && pnpm --filter @bookstack-sync/sync-engine build \
  && pnpm --filter @bookstack-sync/web build \
  && pnpm --filter @bookstack-sync/api build

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0
RUN groupadd --system --gid 10001 bssync \
  && useradd --system --uid 10001 --gid bssync --home /app --shell /usr/sbin/nologin bssync
WORKDIR /app

COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps ./apps
COPY --from=build /app/packages ./packages
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY scripts/docker-entrypoint.sh /app/docker-entrypoint.sh

RUN chmod +x /app/docker-entrypoint.sh \
  && mkdir -p /app/data \
  && chown -R bssync:bssync /app
USER bssync
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/app/docker-entrypoint.sh"]
