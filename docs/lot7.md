# Lot 7 — Durcissement & déploiement (compte-rendu)

**Date :** 2026-11-13

## Livré (code / docs)

- `docs/operations.md` : backup, secrets, Traefik, rollback, checklist recette CDC §15
- Scripts `scripts/backup-sqlite.ps1` / `.sh`
- Purge historique SyncRun/Event > 90 jours (scheduler quotidien)
- Reprise runs `RUNNING` orphelins au démarrage → `FAILED` + pages `PROCESSING` → `OUTDATED`
- Compose Traefik labels commentés prêts à activer

## Non livré volontairement

| Élément | Motif |
|---|---|
| Déploiement prod VPS | Accord explicite requis |
| Workspace recette signé | Action humaine / tokens |
| Suite e2e Playwright complète | À brancher après recette manuelle |
| Migration auto imports manuels Jarvis | Interdit sans procédure approuvée |

## Critères

| Critère | Statut |
|---|---|
| Ops documentées | OK |
| Backup script | OK |
| Recette checklist | OK (à signer) |
| Prod | **Bloqué** sans accord |
