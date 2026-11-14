#!/bin/sh
set -eu
cd /app
pnpm exec prisma generate --schema=prisma/schema.prisma
pnpm exec prisma migrate deploy --schema=prisma/schema.prisma
exec pnpm --filter @bookstack-sync/api start
