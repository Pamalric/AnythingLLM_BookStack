#!/bin/sh
set -eu
cd /app
pnpm exec prisma migrate deploy --schema=prisma/schema.prisma
exec pnpm --filter @bookstack-sync/api start
