# Décisions d’architecture — BookStack Sync

Format : décisions **prises pour lever une ambiguïté** (lot 0) vs **en attente de validation utilisateur**.  
Aucune exigence métier du CDC n’est remplacée silencieusement.

## Décisions prises (lot 0)

### D1 — Modules TypeScript en ESM

**Contexte :** CDC laisse ESM ou CommonJS au lot 0.  
**Décision :** ESM (`"type": "module"`) partout, compatible Node LTS actuel et tooling Vite.  
**Conséquence :** imports avec extensions selon règles TSNode/tsx retenues au lot 1.

### D2 — Gestionnaire de paquets pnpm

**Contexte :** monorepo multi-packages.  
**Décision :** **pnpm** workspaces + lockfile versionné.  
**Pourquoi :** discrimine bien le graphe monorepo, évite la duplication npm classique.

### D3 — Authentification console V1 = admin local

**Contexte :** CDC privilégie SSO/OIDC Traefik « si disponible et vérifiable ».  
**Constat lot 0 :** aucun middleware ForwardAuth/OIDC sur Traefik pour Jarvis ; pas de variables SSO dans `anythingllm.env`.  
**Décision :** V1 = **compte admin local** (Argon2id, cookie session sécurisé, CSRF, rate-limit).  
**Évolution :** SSO Traefik possible plus tard sans changer le reste du sync engine.  
**À confirmer :** OK produit sur cette orientation.

### D4 — Nom d’image Jarvis réel

**Contexte :** CDC cite `xperteamdigital/anythingllm-custom`.  
**Constat :** image déployée = `anythingllm:picker-html-1.19.0` (locale, `pull_policy: never`), package `1.19.0`.  
**Décision :** toute compatibilité API se base sur le **Swagger de l’instance** `jarvis.xperteam.net`, pas sur le nom d’image CDC.  
**Action :** ne pas pull/retagger cette image.

### D5 — Accès AnythingLLM depuis Sync

**Décision provisoire :** en déploiement VPS, joindre le réseau Docker `proxy` et appeler l’URL interne `http://anythingllm:3001` (nom DNS Compose) pour éviter le hairpin TLS ; fallback HTTPS public configurable.  
**SSRF :** allowlist stricte des deux bases (interne + public).  
**À confirmer** au moment du Compose Sync.

### D6 — Dossier bibliothèque connecteur

**Décision :** uploads Sync via `POST /v1/document/upload/{folderName}` avec folder dédié (ex. `bookstack-sync`) pour isoler des imports manuels (`custom-documents`, `Documentation`).  
**Pourquoi :** facilite ownership et audits ; n’empêche pas un humain d’y déposer un fichier — l’ownership reste piloté par la DB Sync.

### D7 — Remplacement de document

**Décision :** pas d’attente d’atomicité native ; séquence confirmée upload → embed → delete ancienne (CDC §6.1).  
`DELETE /v1/system/remove-documents` seulement après désindexation, exclusivité, et (V1) approbation si politique l’exige.  
Vérifier toujours la présence réelle après remove (HTTP 200 non fiable).

### D8 — `instanceId` BookStack

**Décision provisoire :** `instanceId` = identifiant configuration stable dérivé de l’hôte source normalisé (ex. `documentation.xperteam.net`), pas du titre.  
Clé : `bookstack:<instanceId>:page:<pageId>`.  
Modifiable uniquement avant première sync productive (sinon migration de clés).

### D9 — Périmètre V1 suppressions

**Décision (CDC) confirmée :** aucun retrait automatique AnythingLLM en V1 ; file `PENDING_REMOVAL` + approbation humaine. Mode auto désactivé.

### D10 — Hors usage des tables sync natives Jarvis

**Constat :** l’image expose `document_sync_queues` / `document_sync_executions` (vides).  
**Décision :** le connecteur XPERTEAM **n’écrit pas** dans la SQLite Jarvis ; état uniquement dans SQLite Sync.

### D11 — Remote Git du projet

**Contexte :** remote fourni : `https://github.com/Pamalric/AnythingLLM_BookStack.git`.  
**Constat lot 0 :** dépôt public **vide** (aucun commit / branche).  
**Décision :** ce remote est la cible officielle du code Sync ; le lot 1 initialisera le monorepo localement puis proposera le premier push (après votre OK commit/push).  
**Attention :** ne jamais committer `.env`, tokens, ni `anythingllm.env` du VPS.

---

## Décisions en attente (validation requise)

### A1 — Credentials

- Créer compte BookStack RO + token API.
- Créer clé API AnythingLLM (actuellement **0** clé).
- Stocker hors chat/Git (1Password / Docker secrets / env serveur).

### A2 — Workspace de recette

- Autoriser `POST /v1/workspace/new` nom proposé : `BookStack Sync Recette`.
- Confirmer qu’aucun test d’upload ne touche `commercial-and-marketing` / `support-produit` / `mon-espace-de-travail`.

### A3 — Workspace production cible

- Choisir le slug final parmi les existants (ou nouveau workspace dédié).
- Revue audience utilisateurs vs livres BookStack visibles du compte technique.

### A4 — Domaine console

- `sync.xperteam.net` aujourd’hui : mauvaise IP + certificat expiré + backend ASP.NET vide.
- Options : corriger DNS vers `148.113.184.97` + labels Traefik, **ou** autre sous-domaine (ex. `bookstack-sync.xperteam.net`).

### A5 — Auth console

- Confirmer D3 (local) ou demander mise en place SSO Traefik avant lot 6.

### A6 — Imports manuels existants

- Confirmer le rôle du dossier bibliothèque `Documentation` et des 3 `workspace_documents`.
- Procédure de migration différée (CDC §16) : pas d’écrasement auto.

### A7 — Go / No-go lot 1

- **Validé** 2026-11-13 (« ok ») : socle monorepo démarré sans déploiement prod ni mutation Jarvis.
