# BookStack Sync

Connecteur autonome **BookStack → AnythingLLM (Jarvis)** pour XPERTEAM.

- Console admin (React / Vite / Tailwind)
- API Express TypeScript
- SQLite / Prisma dédiée (hors volumes Jarvis)
- Déploiement Docker indépendant

Spécification : `CDC_BookStack_AnythingLLM_V2.md`  
Diagnostic lot 0 : `docs/compatibility.md`, `docs/architecture.md`, `docs/plan.md`, `docs/decisions.md`

## Prérequis

- Node.js 22+
- pnpm 9 (`corepack enable`)

## Démarrage local

```bash
cp .env.example .env
# Éditer .env : SESSION_SECRET (>=32 car.)
# Défaut login : administrator / administrator
mkdir -p data
export DATABASE_URL="file:./data/bookstack-sync.db"

pnpm install
pnpm db:generate
pnpm --filter @bookstack-sync/api exec prisma migrate dev --name init --schema=../../prisma/schema.prisma

pnpm -r --filter=./packages/* build
pnpm --filter @bookstack-sync/web build
pnpm --filter @bookstack-sync/api dev
```

UI : http://127.0.0.1:8080 (assets après build web) ou `pnpm dev:web` sur :5173 avec proxy API.

## Tests

```bash
pnpm test
pnpm lint
pnpm typecheck
```

## Docker

```bash
cp .env.example .env
# renseigner ADMIN_PASSWORD + SESSION_SECRET
docker compose up --build
curl http://127.0.0.1:8080/health
```

**Ne monte jamais** le volume `jarvis_storage`. Les labels Traefik sont commentés jusqu’à validation prod.

## Sécurité

- Ne pas committer `.env`, tokens BookStack/AnythingLLM, ni hash admin de production.
- Les secrets ne sont jamais renvoyés par l’API.
- Écritures AnythingLLM uniquement via API publique, folder `bookstack-sync`, workspace configuré (recette avant prod).
- Inventaire BookStack incomplet ⇒ aucun retrait proposé.

## Lots livrés

| Lot | Contenu | Doc |
|---|---|---|
| 0–2 | Diagnostic, socle, configuration | `docs/lot1.md`, `docs/lot2.md` |
| 3 | Inventaire BookStack + hash | `docs/lot3.md` |
| 4 | Upload / embeddings / sync document | `docs/lot4.md` |
| 5 | Scheduler, verrous, dry-run, retraits | `docs/lot5.md` |
