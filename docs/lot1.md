# Lot 1 — Socle (compte-rendu)

**Date :** 2026-11-13  
**Remote :** https://github.com/Pamalric/AnythingLLM_BookStack.git

## Livré

- Monorepo pnpm + TypeScript strict ESM
- Packages : `shared`, `bookstack-adapter`, `anythingllm-adapter`, `sync-engine`
- Apps : `api` (Express), `web` (React/Vite/Tailwind)
- Prisma SQLite + schéma CDC
- Auth admin Argon2id + cookies session/CSRF + rate-limit login
- `/health`, `/ready`, `/api/v1/auth/*`, stub `/api/v1/dashboard`
- Docker multi-stage non-root + `compose.yaml` + `.env.example`
- Tests Vitest unitaires (clé source, hash, session, password)

## Non livré (lots suivants)

- Configuration métier complète, sync réelle, console KPI, scheduler

## Impact Jarvis

Aucun : pas de déploiement VPS, pas d’appel mutation API Jarvis.
