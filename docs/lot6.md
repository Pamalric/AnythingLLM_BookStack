# Lot 6 — Console complète (compte-rendu)

**Date :** 2026-11-13

## Livré

- Parcours FR : Tableau de bord / Documents / Historique / Configuration
- Déconnexion UI (`POST /auth/logout`)
- Polling progression (2 s si run actif ; Historique auto-refresh `RUNNING`)
- Compteurs libellés FR ; distinction `PARTIAL` ≠ succès
- Recherche documents (Entrée / bouton) ; confirmation resync avec remplacement
- Modales fermables Échap ; ID de corrélation run visible
- Version `v.26.11.13` login + pied de page
- API déjà en 202 async / 409 conflit sync / auth session

## Critères

| Critère | Statut |
|---|---|
| Écrans responsive FR | OK |
| API `/api/v1/*` auth + 202/409 | OK |
| Polling ; navigateur ≠ stop job | OK |

## Hors scope lot 6

Tests e2e navigateur automatisés (reportés / partiels lot 7).
