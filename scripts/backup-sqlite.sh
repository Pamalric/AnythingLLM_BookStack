#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="$ROOT/data/bookstack-sync.db"
OUT="$ROOT/data/backups"
[[ -f "$DB" ]] || { echo "Base introuvable: $DB" >&2; exit 1; }
mkdir -p "$OUT"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$OUT/bookstack-sync-$STAMP.db"
cp -a "$DB" "$DEST"
for ext in -wal -shm; do
  [[ -f "${DB}${ext}" ]] && cp -a "${DB}${ext}" "${DEST}${ext}" || true
done
echo "Backup OK: $DEST"
