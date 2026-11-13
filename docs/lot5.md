# Lot 5 — Moteur & automation (compte-rendu)

**Date :** 2026-11-13

## Livré

- Diff incrémental : pas de réindexation si hash inchangé
- `JobLock` (bail + heartbeat) — un seul run `RUNNING`
- Planificateur local (`scheduleEnabled` + `scheduleIntervalMin`, tick 30 s)
- `PENDING_REMOVAL` + approbation/rejet (`/removals/:id/approve|reject`) — pas de retrait auto
- `ACCESS_REVIEW` sur export BookStack 403/404 isolé
- Mode `dry-run` : inventaire + hash, **aucune** mutation AnythingLLM
- Conflit 409 si sync déjà en cours

## Critères

| Critère | Statut |
|---|---|
| Incrémental hash | OK |
| Scheduler | OK (process local) |
| JobLock | OK |
| Retraits sur approbation | OK |
| Dry-run | OK |

## Suite (lot 6/7)

Retry/backoff borné affiné, purge historique 90 j, ops déploiement.
