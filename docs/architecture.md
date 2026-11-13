# Architecture — BookStack Sync

**Statut :** conception lot 0 (aucune implémentation code)  
**Référence :** `CDC_BookStack_AnythingLLM_V2.md`  
**Décisions associées :** `docs/decisions.md`

## 1. Objectif

Service Docker autonome **BookStack Sync** qui inventorie les pages BookStack visibles d’un compte technique, les réplique en documents Markdown dans un workspace AnythingLLM choisi, avec console d’administration, sans jamais écrire dans la base/volumes Jarvis ni modifier l’image existante.

## 2. Schéma de déploiement cible (VPS Jarvis)

```text
                    Internet
                       |
              Traefik v3.6 (réseau proxy)
                       |
        +--------------+---------------+
        |                              |
 Host(`jarvis.xperteam.net`)   Host(`sync.xperteam.net`)  [DNS/TLS à provisionner]
        |                              |
 jarvis-anythingllm-1          bookstack-sync (nouveau)
 image: picker-html-1.19.0     image: bookstack-sync:<ver>
 volume: jarvis_storage        volume: bookstack_sync_data
 (INTANGIBLE)                  (SQLite + tmp contrôlés)
        |                              |
        +---------- proxy -------------+
                       |
            HTTPS sortant vers
     documentation.xperteam.net (BookStack)
```

Contraintes dures :

- Pas de bind-mount écriture sur `jarvis_storage`.
- Accès AnythingLLM préféré via réseau Docker `proxy` (URL interne HTTP vers service `anythingllm:3001`) **ou** HTTPS public ; à trancher au lot 1/7 selon résolution DNS interne.
- Secrets via env / Docker secrets ; jamais dans SQLite en clair ni dans Git.

## 3. Schéma logique applicatif

```text
[Admin navigateur]
       | HTTPS + session
[Express API /api/v1 + static React]
       |
  +----+----+------------------+
  |         |                  |
 Auth    Settings           JobRunner
  |         |                  |
  |    Credential vault    SyncEngine
  |         |             /    |    \
  |         |    BookStack  Transform  AnythingLLM
  |         |    Adapter               Adapter
  |         |         |                    |
  |         v         v                    v
  |      Prisma/SQLite (état, locks, audit)
  |
 /health /ready (sans secrets)
```

Le job vit **hors** de la requête HTTP : acceptation `202` + `runId`, progression par polling.

## 4. Modules (cible monorepo lot 1)

| Package / app | Responsabilité |
|---|---|
| `apps/api` | Express, auth admin, routes `/api/v1`, scheduler, sert le build web |
| `apps/web` | React + Vite + Tailwind, 4 écrans FR |
| `packages/shared` | Types, schémas Zod, codes erreur, DTO |
| `packages/bookstack-adapter` | Client Token, pagination, export Markdown |
| `packages/anythingllm-adapter` | Client Bearer fondé **uniquement** sur OpenAPI Jarvis validé |
| `packages/sync-engine` | Inventaire, hash, plan, remplacement sûr, réconciliation, dry-run |
| `prisma/` | SQLite dédiée Sync (pas celle de Jarvis) |

## 5. Persistance (SQLite Sync)

Entités minimales alignées CDC §9 :

- `Settings` — config non secrète
- `CredentialRef` / secrets externes — références seulement
- `SourcePage` — clé `bookstack:<instanceId>:page:<id>`
- `TargetDocument` — `location` AnythingLLM, ownership `CONNECTOR_OWNED`
- `SyncRun` / `SyncEvent` — exécutions et événements
- `PendingRemoval` — file d’approbation
- `AuditEvent` — actions sensibles
- `JobLock` — exclusion mutuelle persistante + bail/heartbeat

Règles :

- WAL à valider sur le volume Docker retenu.
- Aucune réindexation si `contentHash` inchangé.
- Inventaire incomplet ⇒ aucun passage en `PENDING_REMOVAL`.

## 6. Flux de synchronisation (rappel)

1. Lock job + `SyncRun RUNNING`
2. Health auth BookStack + AnythingLLM + workspace cible
3. Pagination complète pages (+ maps books/chapters)
4. Validation complétude (`offset` jusqu’à `total`, pas d’erreur critique)
5. Diff local (dates/hash) → export MD si besoin
6. Remplacement sûr : nouvelle version confirmée → retrait ancienne version connecteur
7. Absences → `PENDING_REMOVAL` seulement si inventaire complet
8. Bilan `SUCCESS` / `PARTIAL` / `FAILED`

## 7. Sécurité

| Domaine | Mesure |
|---|---|
| Transport | HTTPS Traefik obligatoire |
| Console | Auth admin (voir décision SSO vs local) ; cookies `HttpOnly`/`Secure`/`SameSite` ; CSRF ; brute-force limit |
| Secrets API | Env/Docker secrets ou chiffrement clé maître hors SQLite ; jamais renvoyés à l’UI |
| SSRF | Allowlist d’hôtes BookStack/AnythingLLM configurés ; pas d’URL arbitraire runtime |
| Jarvis | Clé API dédiée ; folder documents dédié ; ownership strict |
| BookStack | Compte RO + scope livres autorisés |
| Logs | Pino JSON, `runId`, **zéro secret** |
| Headers | Helmet, rate-limit admin API |

## 8. Identité documentaire

- Clé stable : `bookstack:<instanceId>:page:<pageId>`
- Fichier : `bookstack-page-<id>.md` (préfixe instance optionnel)
- Métadonnées embarquées : titre, livre, chapitre, URL canonique, IDs, `updated_at`
- Empreinte SHA-256 sur contenu normalisé + métadonnées impactant citation/recherche
- Images/attachments : non ingérés en V1 → warning journalisé

## 9. Remplacement sûr (AnythingLLM)

Séquence cible (pas d’atomicité native API) :

1. `POST /v1/document/upload/{folderName}` vers folder connecteur (ex. `bookstack-sync`) **sans** delete de l’ancien
2. Confirmer `documents[].location` + présence bibliothèque
3. `POST /v1/workspace/{slug}/update-embeddings` avec `adds: [newLocation]`
4. Confirmer association workspace
5. Puis `deletes: [oldLocation]` si ancienne version `CONNECTOR_OWNED`
6. Optionnel : `DELETE /v1/system/remove-documents` seulement si exclusivité prouvée et politique approuvée
7. Mettre à jour `TargetDocument` local **après** confirmations

En cas de doute (timeout, 5xx, réponse perdue) : réconcilier, ne pas supprimer.

## 10. Frontières strictes avec Jarvis

| Autorisé | Interdit |
|---|---|
| Appels HTTP API documentés | SQL / fichiers sur `anythingllm.db` Jarvis |
| Conteneur Sync + volume Sync | Modifier image `anythingllm:picker-html-1.19.0` |
| Labels Traefik **nouveaux** pour Sync (après OK) | Toucher router/volume Jarvis existants sans validation |
| Workspace de recette | Sync prod / suppressions sans approbation |

## 11. Stack technique proposée (lot 1)

- Node.js LTS figé dans l’image
- TypeScript strict, **ESM** (décision D1)
- Express + Zod + Pino + node-cron
- React + Vite + Tailwind + React Router + TanStack Query
- Prisma + SQLite
- Vitest (+ Playwright plus tard)
- pnpm workspaces (décision D2)
- Docker multi-stage non-root
