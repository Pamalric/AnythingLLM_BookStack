# Plan de réalisation — BookStack Sync

Critères transverses à chaque lot : code testé, docs à jour, commandes de lancement, démonstration des critères de sortie, **zéro impact Jarvis prod** sans accord explicite.

## Lot 0 — Diagnostic ✅

Livré : `compatibility.md`, `architecture.md`, `plan.md`, `decisions.md`. Validé 2026-11-13.

## Lot 1 — Socle ✅ (2026-11-13)

| Tâche | Critère de sortie | Statut |
|---|---|---|
| Monorepo `apps/*` + `packages/*` + `prisma` + `tests` + `docs` | Structure CDC | OK |
| pnpm lock + TS strict ESM | Builds verts | OK |
| ESLint / Vitest | 11 tests unitaires | OK |
| Express `/health` `/ready` + auth admin | Smoke test login | OK |
| React/Vite/Tailwind | Build servi par Express | OK |
| Prisma migrations SQLite | `20261113170000_init` | OK |
| Docker + Compose + `.env.example` | Fichiers prêts | OK (image non poussée en prod) |

**Exit lot 1 :** application démarrable en local, sans mutation Jarvis. Voir `docs/lot1.md`.

## Lot 2 — Configuration ✅ (2026-11-13)

| Tâche | Critère de sortie | Statut |
|---|---|---|
| Écran Configuration FR | URLs, workspace, fréquence, activation, retraits | OK |
| Zod + SSRF allowlist | Rejets URL malicieuses | OK |
| Secrets serveur | Jamais restitués ; env ou AES-GCM | OK |
| Tests de connexion | Messages exploitables | OK |
| Audit | Journalisé | OK |

**Exit lot 2 :** config sauvegardable ; tests lecture seule. Voir `docs/lot2.md`.

## Lot 3 — Collecte BookStack

| Tâche | Critère de sortie |
|---|---|
| Client Token + pagination complète | Inventaire = `total` |
| Books/chapters/pages + export MD | Une page = un document logique |
| Hash SHA-256 déterministe | Tests unitaires |
| Panne source | Aucun retrait déclenché |

**Exit :** inventaire + export vérifiés (compte technique) ; tests pagination/erreurs.

## Lot 4 — Indexation AnythingLLM

| Tâche | Critère de sortie |
|---|---|
| Adapter sur Swagger Jarvis uniquement | Pas d’endpoint inventé |
| Workspace **recette** uniquement | Aucune écriture workspaces prod |
| Upload + association + confirmation | `location` persistée `CONNECTOR_OWNED` |
| Remplacement sûr | Nouvelle version avant retrait ancienne |
| Sync ciblée document | Trace `DOCUMENT` |

**Exit :** documents de test indexés en recette ; idempotence sur relance.

## Lot 5 — Moteur & automation

| Tâche | Critère de sortie |
|---|---|
| Diff incrémental hash/dates | 0 réindex si inchangé |
| Scheduler + fuseau Europe/Paris | Fréquences CDC |
| JobLock bail/heartbeat/reprise | Restart mid-job OK |
| Retry/backoff borné | 429/5xx gérés |
| `PENDING_REMOVAL` / `ACCESS_REVIEW` | Aucun retrait auto V1 |
| Dry-run | Simulation sans mutation cible |

**Exit :** moteur robuste sur recette ; file d’approbation.

## Lot 6 — Console complète

| Tâche | Critère de sortie |
|---|---|
| Dashboard / Documents / Historique / Config | Responsive FR |
| API `/api/v1/*` | 202 async, 409 conflit, auth |
| Polling progression | Navigateur fermé ≠ stop job |

**Exit :** parcours admin complets + tests UI critiques.

## Lot 7 — Durcissement & déploiement

| Tâche | Critère de sortie |
|---|---|
| Tests unitaires / intégration mock / e2e | Scénarios CDC §15 |
| Ops : backup SQLite, secrets, Traefik, rollback | `docs/operations.md` |
| Recette workspace test | Checklist CDC signée |
| Migration contrôlée imports manuels | Procédure approuvée, pas auto-destructive |
| Prod | **Uniquement après accord explicite** |

## Dépendances bloquantes actuelles (post lot 0)

1. Tokens BookStack RO + clé API AnythingLLM (création UI ; `api_keys` actuellement à 0).
2. Autorisation de créer un workspace de recette.
3. Arbitrage workspace prod cible + revue confidentialité.
4. Décision auth console (local vs SSO futur) — proposition locale en D3.
5. DNS/TLS `sync.xperteam.net` (ou autre domaine) vers IP Jarvis.

## Garde-fous permanents

- Aucune écriture DB/volume AnythingLLM hors API.
- Aucune modif image `anythingllm:picker-html-1.19.0` / stacks Jarvis.
- Aucune suppression sur inventaire incomplet ou panne.
- Jamais toucher documents non `CONNECTOR_OWNED`.
- Aucun secret dans Git, logs, réponses API, captures.
