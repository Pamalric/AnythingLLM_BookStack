# BookStack Sync — multi-stage, utilisateur non-root
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
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
ENV DATABASE_URL=file:./prisma/build-placeholder.db
RUN pnpm --filter @bookstack-sync/api exec prisma generate --schema=../../prisma/schema.prisma \
  && pnpm -r --filter=./packages/* build \
  && pnpm --filter @bookstack-sync/web build \
  && pnpm --filter @bookstack-sync/api build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PNPM_HOME=/pnpm \
    PATH=$PNPM_HOME:$PATH \
    PORT=8080 \
    HOST=0.0.0.0
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate \
  && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 10001 sync \
  && useradd --system --uid 10001 --gid sync --home /app --shell /usr/sbin/nologin sync
WORKDIR /app

COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps ./apps
COPY --from=build /app/packages ./packages
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/apps/web/dist ./apps/web/dist

RUN mkdir -p /app/data && chown -R sync:sync /app
USER sync
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "--filter", "@bookstack-sync/api", "start"]
