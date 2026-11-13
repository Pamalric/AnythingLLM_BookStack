# Lot 3 — Collecte BookStack (compte-rendu)

**Date :** 2026-11-13

## Livré

- Client `BookStackClient` : pagination complète (`listAll*`), `getPage`, `exportPageMarkdown`, `probeConnection`, erreurs `BookStackHttpError`
- Inventaire → upsert `SourcePage` (clé `bookstack:<instance>:page:<id>`, URL, livre/chapitre, `lastSeenAt`)
- Hash SHA-256 déterministe (`contentHash` + métadonnées canoniques)
- Diff inventaire : CREATE / UPDATE / UNCHANGED / SKIP_DRAFT ; absents → `PENDING_REMOVAL` **uniquement si inventaire complet**
- Tests : pagination, inventaire incohérent, 401, diff, hash/métadonnées

## Critères

| Critère | Statut |
|---|---|
| Pagination = `total` | OK |
| Books/chapters/pages + export MD | OK |
| Hash SHA-256 déterministe | OK |
| Panne source → aucun retrait | OK |

## Impact Jarvis

Aucune écriture AnythingLLM dans ce lot (lecture BookStack + persistance locale Sync).
