# Lot 2 — Configuration (compte-rendu)

**Date :** 2026-11-13

## Livré

- `GET/PATCH /api/v1/settings` — paramètres sans secrets
- `PUT /api/v1/settings/secrets` — écriture seule (env ou fichier AES-GCM + `SECRETS_MASTER_KEY`)
- `POST /api/v1/connections/test` — probes lecture seule BookStack / AnythingLLM
- `GET /api/v1/settings/workspaces` — slugs pour choix workspace
- Écran React **Configuration** (FR) : URLs, workspace, cadence, secrets, tests
- Validation Zod + allowlist SSRF hôtes
- Audit des patches / secrets / tests
- Migration Prisma champs derniers tests

## Critères

| Critère | Statut |
|---|---|
| Écran config FR | OK |
| Zod + SSRF | OK |
| Secrets jamais restitués | OK |
| Tests connexion | OK (nécessite tokens pour succès réel) |
| Audit | OK |

## Impact Jarvis

Aucun déploiement VPS. Les tests de connexion, s’ils sont lancés, restent en **GET lecture seule** (`/api/pages?count=1`, `/api/v1/auth`, `/api/v1/workspaces`).
