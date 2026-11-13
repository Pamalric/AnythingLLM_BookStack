# Lot 4 — Indexation AnythingLLM (compte-rendu)

**Date :** 2026-11-13

## Livré

- Client `AnythingLlmClient` : auth, workspaces, `uploadMarkdown` (`/document/upload/{folderName}`), `updateEmbeddings`, `removeDocuments` (Swagger Jarvis uniquement)
- Folder dédié `bookstack-sync` (décision D6)
- Remplacement sûr : upload + embed nouvelle version → delete ancienne
- Sync ciblée `POST /api/v1/documents/:id/sync` (trigger `DOCUMENT`, HTTP 202)
- Persistance `TargetDocument` (`CONNECTOR_OWNED`, `documentPath`, `publishedHash`)
- Branchement `POST /api/v1/sync-runs` (incremental / full / dry-run)

## Critères

| Critère | Statut |
|---|---|
| Adapter Swagger only | OK |
| Upload + association + location | OK (code) |
| Remplacement sûr | OK |
| Sync document tracée | OK |

## Garde-fous

- Sync réelle exige `workspaceSlug` configuré (prévoir workspace **recette** avant tout essai Jarvis).
- Aucun déploiement VPS ; aucune écriture prod tant que le workspace cible n’est pas un workspace de recette validé.
