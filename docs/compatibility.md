# Compatibilité — Lot 0 (diagnostic lecture seule)

**Date :** 2026-11-13  
**Périmètre :** BookStack Sync (BookStack → AnythingLLM / Jarvis)  
**Méthode :** inspection dépôt local + sondes HTTPS publiques + SSH lecture seule sur VPS Jarvis  
**Mutations :** aucune (ni BookStack, ni Jarvis, ni Traefik, ni volumes)

## 1. Synthèse exécutive

| Zone | Statut | Commentaire |
|---|---|---|
| BookStack version & API docs | **Validé** | `v23.10.2`, `/api/docs` public, auth Token obligatoire |
| BookStack inventaire / export MD authentifié | **Non validé (bloquant tokens)** | Endpoints présents dans docs ; appels authentifiés impossibles sans token |
| AnythingLLM image / déploiement Docker | **Validé** | Image locale `anythingllm:picker-html-1.19.0`, Compose + Traefik |
| AnythingLLM OpenAPI (Swagger instance) | **Validé (contrat)** | Spec extraite de `/api/docs/swagger-ui-init.js` (67 paths) |
| AnythingLLM appels authentifiés | **Non validé (bloquant)** | `api_keys = 0` en base ; 403 sans clé |
| Workspace de recette | **Non validé (bloquant autorisation)** | Création `POST /v1/workspace/new` non exécutée |
| Remplacement atomique document | **Partiel** | Faisable au niveau applicatif ; pas d’API transactionnelle native |
| Domaine `sync.xperteam.net` | **Non validé / bloquant DNS+TLS** | Pointe ailleurs ; certificat expiré |
| Auth console Sync (SSO Traefik) | **Non validé** | Aucun middleware ForwardAuth/OIDC sur Jarvis aujourd’hui |
| Confidentialité workspace | **À arbitrer (bloquant prod)** | ACL BookStack ≠ ACL AnythingLLM |

## 2. Inventaire dépôt de travail

| Élément | Résultat |
|---|---|
| Chemin local | `C:\Users\phama\OneDrive - XPERTEAM\00 Encours\AnythingLLM et Bookstack` |
| Contenu local | Uniquement `CDC_BookStack_AnythingLLM_V2.md`, `CDC_Connecteur_BookStack_AnythingLLM_XPERTEAM.md` et `docs/` (lot 0) |
| Remote GitHub | `https://github.com/Pamalric/AnythingLLM_BookStack.git` — **dépôt public créé le 2026-11-13, encore vide** (pas de branche, pas de commit) |
| Code applicatif | Absent (attendu : lot 1 → push initial vers ce remote) |
| Accès VPS | SSH OK : `ubuntu@jarvis.xperteam.net` via `~/.ssh/id_ed25519_vps_portable` ; Docker via `sudo -n` |

## 3. VPS Jarvis — versions et déploiement (preuves)

| Élément | Valeur observée | Preuve |
|---|---|---|
| Hôte | `vps-22df17cf` — Ubuntu, kernel `7.0.0-43-generic` | SSH |
| IP publique Jarvis | `148.113.184.97` | DNS / known_hosts |
| Conteneur Jarvis | `jarvis-anythingllm-1` | `docker ps` |
| Image | `anythingllm:picker-html-1.19.0` (`pull_policy: never`) | Compose + `docker ps` |
| Version applicative | `1.19.0` (`/app/server/package.json`) | `docker exec` lecture |
| Runtime Node | `v24.22.2` | `docker exec` |
| Image OCI source | GitHub `Mintplex-Labs/anything-llm`, revision `ace9dad3…`, label version `master`, created 2026-11-09 | `docker image inspect` |
| Écart CDC | CDC mentionne `xperteamdigital/anythingllm-custom` | **Non observé** ; image locale `picker-html` |
| Santé | `healthy` (« Server is up ») | healthcheck Docker |
| Compose | `/opt/docker/jarvis/compose.yaml` (projet Compose `jarvis`) | filesystem |
| Env | `/opt/docker/jarvis/anythingllm.env` monté en `.env` | inspect (clés listées, valeurs non lues) |
| Volume | `jarvis_storage` → `/app/server/storage` | **ne pas monter en écriture depuis Sync** |
| Réseau | bridge externe `proxy` | membres : `traefik`, `jarvis-anythingllm-1` |
| Traefik | `traefik:v3.6`, ports 80/443, ACME HTTP-01, email `admin@xperteam.fr` | `/opt/docker/traefik/compose.yaml` |
| Router Jarvis | `Host(\`jarvis.xperteam.net\`)` → port conteneur `3001`, TLS letsencrypt | labels Docker |
| Mode multi-user | `multi_user_mode=true` | SQLite `system_settings` (lecture seule) |
| Clés API AnythingLLM | **0** | table `api_keys` |
| Workspaces existants | voir §5 | SQLite lecture seule |
| Docs en bibliothèque | 4 fichiers JSON ; dossiers `documents/Documentation`, `documents/custom-documents` | find (comptage) |
| Docs liés workspaces | workspaceId 2 → 2 ; workspaceId 3 → 1 | `workspace_documents` |
| Tables sync natives image | `document_sync_queues` / `document_sync_executions` présentes, **0 ligne** | SQLite |

### Clés d’environnement AnythingLLM observées (noms seuls)

`STORAGE_DIR`, `JWT_SECRET`, `SIG_KEY`, `SIG_SALT`, `LLM_PROVIDER`, `OPEN_AI_KEY`, `OPEN_MODEL_PREF`, `EMBEDDING_ENGINE`, `VECTOR_DB`, `IMAGE_GEN_*`

Aucune clé OIDC / ForwardAuth / SSO visible dans ce fichier.

## 4. BookStack — endpoints et auth

**Base :** `https://documentation.xperteam.net`  
**IP :** `178.33.58.164` (distincte de Jarvis)  
**Version UI :** `v23.10.2` (`dist/app.js?version=v23.10.2`)

| Endpoint | Méthode | Test lot 0 | Résultat | Statut |
|---|---|---|---|---|
| `/api/docs` | GET | Oui | 200 HTML « API Documentation \| Documentation xLMS » | Validé (docs) |
| `/api/docs.json` | GET sans token | Oui | 401 `No authorization token found` | Validé (auth requise) |
| `/api/books` | GET sans token | Oui | 401 JSON | Validé (auth) |
| `/api/pages` | — | Non (auth) | Documenté dans `/api/docs` | Contrat documenté |
| `/api/pages/{id}` | — | Non (auth) | Documenté | Contrat documenté |
| `/api/pages/{id}/export/markdown` | — | Non (auth) | Documenté (« Export a page as a markdown file ») | Contrat documenté |
| `/api/chapters` | — | Non (auth) | Documenté | Contrat documenté |
| `/api/system` | GET sans token | Oui | 404 HTML (pas de JSON API) | Non disponible / non confirmé en 23.10.2 sans auth |

### Authentification BookStack (docs instance)

- Permission rôle : **Access System API**
- Header : `Authorization: Token <token_id>:<token_secret>`
- Rate-limit observé : `X-RateLimit-Limit: 180`

### Pagination (contrat BookStack standard, cohérent avec docs instance)

- Réponse : `{ "data": [...], "total": N }`
- Query : `count` (défaut 100, max 500), `offset`, `sort`, `filter[...]`
- **Non rejoué avec token** sur l’instance XPERTEAM

### Champs utiles (exemples docs instance)

Pages : `id`, `book_id`, `chapter_id` (0 possible = page hors chapitre), `name`, `slug`, `updated_at`, `book_slug`, `draft`, etc.

## 5. AnythingLLM — endpoints réellement exposés (Swagger instance)

**Swagger UI :** `https://jarvis.xperteam.net/api/docs/` → 200  
**Spec :** embarquée dans `https://jarvis.xperteam.net/api/docs/swagger-ui-init.js` (OpenAPI 3.0.0, `info.version=1.0.0`, 67 paths)  
**Auth :** `Authorization: Bearer <API_KEY>`  
**Preuve sans clé :**

| Endpoint | Résultat |
|---|---|
| `GET /api/v1/auth` | 403 `{"error":"No valid api key found."}` |
| `GET /api/v1/workspaces` | 403 idem |
| `GET /api/v1/documents` | 403 idem |
| `GET /api/v1/system` | 403 idem |
| `POST /api/v1/workspace/new` | 403 (probe GET non pertinent ; route présente en Swagger POST) |

### Endpoints critiques pour Sync (présents dans Swagger Jarvis)

| Besoin | Endpoint | Notes contrat Swagger |
|---|---|---|
| Vérifier clé | `GET /v1/auth` | `{ authenticated: true }` |
| Lister workspaces | `GET /v1/workspaces` | `workspaces[].slug` |
| Créer workspace recette | `POST /v1/workspace/new` | body `{ name, ... }` |
| Lire workspace + docs liés | `GET /v1/workspace/{slug}` | inclut `documents` |
| Upload fichier | `POST /v1/document/upload` | multipart `file` ; optionnel `addToWorkspaces`, `metadata` |
| Upload dossier dédié | `POST /v1/document/upload/{folderName}` | idem + organisation |
| Upload texte brut | `POST /v1/document/raw-text` | `textContent` + metadata ; `location` retournée |
| Lister bibliothèque | `GET /v1/documents` | arborescence `localFiles` |
| Associer / désindexer | `POST /v1/workspace/{slug}/update-embeddings` | `{ adds: [location], deletes: [location] }` |
| Suppression physique | `DELETE /v1/system/remove-documents` | `{ names: [location] }` — **succès HTTP même si cible absente (comportement connu upstream)** |
| Settings | `GET /v1/system` | settings (attention secrets booléanisés) |

### Workspaces observés (lecture SQLite, sans mutation)

| id | name | slug | docs liés |
|---|---|---|---|
| 1 | Mon Espace de Travail | `mon-espace-de-travail` | 0 |
| 2 | Commercial & Marketing | `commercial-and-marketing` | 2 |
| 3 | Support produit | `support-produit` | 1 |

**Hypothèse non confirmée :** le dossier bibliothèque `Documentation` contient des imports manuels BookStack non nécessairement liés via `workspace_documents`. À inventorier uniquement en lot 4+ sur workspace de recette, sans toucher la prod.

## 6. Remplacement de version & suppressions

| Capacité | Statut | Analyse |
|---|---|---|
| Upload nouvelle version | Contrat validé | Nouveau `location` UUID typiquement distinct |
| Indexation workspace | Contrat validé | `update-embeddings.adds` ou `addToWorkspaces` à l’upload |
| Retrait workspace (désassociation) | Contrat validé | `update-embeddings.deletes` |
| Suppression fichier bibliothèque | Contrat validé (prudence) | `DELETE /v1/system/remove-documents` ; idempotence HTTP trompeuse |
| Remplacement **atomique DB native** | **Non supporté** | Pas d’endpoint « replace document » transactionnel |
| Remplacement **sûr applicatif** | **Faisable** | Upload → confirmer présence/`location` → `adds` nouvelle → vérifier → `deletes` ancienne → (optionnel) remove physique si exclusive |
| Concurrence / réponse perdue | Risque | Nécessite états locaux + réconciliation par `sourceKey` / hash / `location` |
| Protection imports manuels | Exigence métier | Jamais appeler delete/remove sur un `location` non enregistré `CONNECTOR_OWNED` |

## 7. Confidentialité

AnythingLLM **ne réplique pas** les ACL BookStack page à page. Tout document indexé dans un workspace est interrogeable par les utilisateurs autorisés de ce workspace (multi-user actif, 4 comptes : 1 admin + 3 default).

**Niveau requis :**

1. Compte technique BookStack **lecture seule**, scoped aux seuls livres/pages partageables avec le public du workspace cible.
2. Workspace cible **restreint** aux utilisateurs autorisés (pas de workspace « ouvert » si contenus internes).
3. Clé API AnythingLLM dédiée au connecteur, rotation possible, jamais partagée dans le chat/Git.
4. Revue humaine avant toute sync production : inventaire BookStack visible vs audience Jarvis.

**Statut :** règle comprise ; **validation métier des périmètres non faite** (bloquant mise en prod).

## 8. Authentification console Sync & Traefik

| Sujet | Constat |
|---|---|
| SSO / OIDC Traefik existant | **Absent** sur le router Jarvis (pas de middleware auth) |
| Domaine suggéré `sync.xperteam.net` | Résout vers `178.33.58.164` (même IP que BookStack), **pas** Jarvis |
| TLS `sync.xperteam.net` | Certificat **expiré** (`SEC_E_CERT_EXPIRED`) ; avec `-k` : HTTP 200 vide, header `X-AspNet-Version` |
| Conclusion | Domaine **non prêt** ; il faudra DNS → IP Jarvis + labels Traefik dédiés **après validation** |
| Stratégie auth console V1 proposée | Login admin local (Argon2id, cookie sécurisé, CSRF, rate-limit) — voir `decisions.md` |

## 9. Comment obtenir les credentials (sans coller de secrets ici)

### BookStack (compte technique dédié)

1. Admin BookStack → créer utilisateur `bookstack-sync-ro` (ou équivalent).
2. Rôle : permission **Access System API** + droits de **lecture** uniquement sur les livres à indexer (pas create/update/delete).
3. Éditer l’utilisateur → **API Tokens** → Create Token (nom + expiry).
4. Noter Token ID / Secret **hors Git** (gestionnaire de secrets / Docker secret).
5. Test local (chez vous) :  
   `curl -sS -H "Authorization: Token $ID:$SECRET" "https://documentation.xperteam.net/api/pages?count=1"`

### AnythingLLM (clé API dédiée)

1. Se connecter admin sur `https://jarvis.xperteam.net` (multi-user).
2. Créer une API key dans l’UI admin (aujourd’hui `api_keys=0`).
3. Stocker la clé hors conversation / hors Git.
4. Test :  
   `curl -sS -H "Authorization: Bearer $KEY" https://jarvis.xperteam.net/api/v1/auth`

### Workspace de recette (après clé, avec votre OK)

1. `POST /api/v1/workspace/new` avec un nom explicite du type `BookStack Sync Recette`.
2. Noter le `slug` retourné.
3. **Ne pas** pointer la sync vers `commercial-and-marketing` / `support-produit` tant que non autorisé.

## 10. Checklist commandes lecture seule restantes (à exécuter quand tokens disponibles)

```bash
# BookStack — complétude pagination + export (remplacer via env, ne pas committer)
curl -sS -H "Authorization: Token ${BOOKSTACK_TOKEN_ID}:${BOOKSTACK_TOKEN_SECRET}" \
  "https://documentation.xperteam.net/api/pages?count=1&offset=0"
curl -sS -H "Authorization: Token ${BOOKSTACK_TOKEN_ID}:${BOOKSTACK_TOKEN_SECRET}" \
  "https://documentation.xperteam.net/api/books?count=500"
# Mesurer total pages, puis boucler offset jusqu'à total ; exporter 1 page markdown de test

# AnythingLLM
curl -sS -H "Authorization: Bearer ${ANYTHINGLLM_API_KEY}" \
  https://jarvis.xperteam.net/api/v1/auth
curl -sS -H "Authorization: Bearer ${ANYTHINGLLM_API_KEY}" \
  https://jarvis.xperteam.net/api/v1/workspaces

# VPS (déjà fait une partie) — ne jamais docker volume rm / compose down
ssh ubuntu@jarvis.xperteam.net 'sudo docker ps; sudo docker network inspect proxy'
```

**Interdit sans validation :** `update-embeddings`, `document/upload`, `remove-documents`, création workspace, modification Compose Traefik/Jarvis, écriture volume `jarvis_storage`.

## 11. Risques, contraintes, hypothèses restantes

### Bloquants avant lots d’intégration API

1. Absence de tokens BookStack et AnythingLLM pour tests authentifiés.
2. Aucune clé API AnythingLLM en base (`api_keys=0`).
3. Workspace de recette non créé (nécessite votre autorisation + clé).
4. Domaine `sync.xperteam.net` non utilisable en l’état (DNS/TLS).
5. Validation confidentialité compte technique ↔ audience workspace.

### Risques techniques

| Risque | Impact | Mitigation prévue |
|---|---|---|
| `remove-documents` renvoie succès même si non supprimé | Faux sentiment de purge | Vérifier via `GET /documents` / workspace après coup |
| Doublons si crash entre upload et delete | Pollution bibliothèque | États `PROCESSING`, clé stable, folder dédié `bookstack-sync/` |
| Image custom `picker-html` diverge du upstream | Endpoints futurs | **Coder uniquement sur Swagger Jarvis extrait** |
| Imports manuels existants | Effacement accidentel | Ownership `CONNECTOR_OWNED` strict |
| Volumétrie BookStack inconnue | Perf / coûts embeddings | Mesurer après token (lot 3) |
| Tables `document_sync_*` natives | Confusion produit | Sync XPERTEAM reste **service externe** ; ne pas écrire dans la DB Jarvis |

### Hypothèses encore ouvertes

- Quel workspace production cibler (parmi les 3) ?
- Le dossier `Documentation` est-il l’import manuel BookStack à migrer plus tard ?
- Faut-il réserver un sous-dossier bibliothèque `bookstack-sync` dès V1 ?
- Auth console : confirmer login local vs mise en place SSO Traefik ultérieure.
- `instanceId` dans `bookstack:<instanceId>:page:<id>` : hostname configuré vs UUID fixe.

## 12. Impact production Jarvis (lot 0)

**Aucun impact écrit.** Actions limitées à : HTTPS GET publics, SSH lecture (compose, inspect, SQLite `mode=ro`, listages). Aucun restart, aucun upload, aucun delete, aucun changement Traefik/Compose/image/volume.
