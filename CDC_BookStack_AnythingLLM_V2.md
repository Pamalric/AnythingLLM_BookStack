# XPERTEAM — Cahier des charges technique V2
## Connecteur BookStack → AnythingLLM avec console d'administration

**Statut :** spécification de référence pour développement avec Cursor  
**Date :** 13 novembre 2026  
**Version :** 2.0  
**Source :** `https://documentation.xperteam.net`  
**Destination :** `https://jarvis.xperteam.net`  
**Déploiement :** VPS hébergeant Jarvis, service Docker autonome

## 1. Contexte et finalité

XPERTEAM utilise BookStack comme base documentaire et AnythingLLM (Jarvis) pour interroger les connaissances internes au moyen du RAG. Des documents BookStack ont déjà été importés manuellement dans un workspace AnythingLLM. Le projet doit automatiser et fiabiliser leur alimentation, sans modifier les applications existantes.

Le service nommé provisoirement **BookStack Sync** doit être administrable depuis un navigateur, sans accès SSH pour les opérations ordinaires.

### 1.1 Objectifs

1. Inventorier **tous les livres et pages accessibles** au compte technique BookStack (pagination incluse).
2. Répliquer le contenu utile de chaque page sous la forme d'un document logique individualisé dans un workspace AnythingLLM choisi.
3. N'actualiser que les pages nouvelles ou réellement modifiées.
4. Traiter les retraits et changements de visibilité de manière sûre, sans suppression automatique lors d'une panne d'inventaire.
5. Fournir une console React pour la configuration, l'observation, les alertes, l'historique, les relances et les validations de retrait.
6. Permettre l'exploitation en production et une évolution ultérieure vers d'autres sources documentaires.

### 1.2 Hors périmètre V1

- Synchronisation Jarvis → BookStack ou édition dans Jarvis.
- Création/modification des pages BookStack.
- Import massif des pièces jointes, OCR, PDF complexes et indexation multimodale, sauf prise en charge validée après diagnostic.
- Synchronisation instantanée par webhook.
- Gestion multi-tenant, multi-destination ou moteur générique complet de connecteurs.
- Modification de l'interface ou du schéma de données AnythingLLM.
- Reprise automatique destructrice des anciens imports manuels.

## 2. Stack technique

- **Runtime :** version Node.js LTS supportée au moment du développement, version figée dans l'image.
- **Langage :** TypeScript strict, ESM ou CommonJS selon décision de lot 0.
- **API :** Express + Zod pour validation des entrées.
- **Interface :** React + Vite + Tailwind CSS, React Router, TanStack Query recommandé.
- **Stockage :** SQLite dédié au connecteur via Prisma et migrations versionnées.
- **Réseau :** `fetch` natif ou client HTTP éprouvé avec timeout et retry contrôlés.
- **Planification :** `node-cron` ou équivalent, avec exclusion mutuelle en base.
- **Logs :** Pino, JSON structuré, corrélation `runId`.
- **Tests :** Vitest pour unitaires et intégration, Playwright pour parcours UI critiques si possible.
- **Déploiement :** image Docker multi-stage, un conteneur applicatif avec frontend compilé servi par Express et volume SQLite persistant.

L'architecture correspond à la famille technologique d'AnythingLLM, mais reste intégralement découplée.

## 3. Architecture logique

```text
[Administrateur / navigateur]
            |
   HTTPS + authentification
            |
  [Traefik / reverse proxy]
            |
 [BookStack Sync — Docker]
     ├── React/Vite (assets statiques)
     ├── Express (API admin / auth)
     ├── Scheduler + Job runner
     ├── Sync engine
     │    ├── BookStackAdapter
     │    ├── DocumentTransformer
     │    ├── AnythingLLMAdapter
     │    └── Reconciler
     └── Prisma / SQLite (volume dédié)
            |                  |
     API BookStack         API AnythingLLM
   documentation...        jarvis...
```

Le processus d'exécution doit être **indépendant de la requête HTTP**. Une fois le job accepté, fermer le navigateur n'interrompt pas le traitement. L'interface suit sa progression par polling de l'API (par exemple toutes les 2–5 secondes).

Un seul job de synchronisation peut être actif par destination. Utiliser un verrou persistant avec bail et expiration, et une procédure de récupération au redémarrage. Un simple booléen mémoire est insuffisant.

## 4. Contrats d'intégration à vérifier en lot 0

### 4.1 BookStack

Routes candidates à confirmer sur l'installation :

- `GET /api/books` : liste des livres.
- `GET /api/chapters` : liste des chapitres.
- `GET /api/pages` : liste paginée des pages.
- `GET /api/pages/{id}` : informations détaillées.
- `GET /api/pages/{id}/export/markdown` : export Markdown.

Valider l'authentification token, l'étendue des permissions, la pagination, les champs de création/modification, l'accès aux pages de livre sans chapitre, les codes d'erreur et les éventuelles limites.

Le compte technique doit être en **lecture seule**, avec accès aux contenus effectivement autorisés à être visibles dans Jarvis. L'inventaire est limité aux éléments accessibles à CE compte, pas nécessairement à tous les contenus de BookStack.

### 4.2 AnythingLLM

Consulter `https://jarvis.xperteam.net/api/docs` ou l'endpoint interne équivalent. Vérifier les opérations effectives :

- Lister les workspaces et identifier le slug cible.
- Importer un fichier Markdown ou document textuel.
- Associer le document au workspace et déclencher l'indexation.
- Vérifier l'état documentaire/indexation.
- Désassocier proprement un document du workspace.
- Supprimer, si supporté et autorisé, un fichier détenu exclusivement par le connecteur.

**Ne pas coder les requêtes de mutation sur la seule base de routes supposées.** Documenter les formes des requêtes/réponses d'après la documentation Swagger effective et les tests sur un workspace de recette.

### 4.3 Limite des droits d'accès

BookStack applique des droits au niveau de ses contenus. AnythingLLM ne réplique pas automatiquement ces permissions page par page. Tous les documents chargés dans le workspace doivent être réputés accessibles à ses utilisateurs. Le compte technique et le workspace doivent donc former une frontière de confidentialité cohérente. En cas d'écart, suspendre la mise en production.

## 5. Identité documentaire et représentation

- Clé stable : `bookstack:<instanceId>:page:<pageId>`.
- Ne jamais utiliser le titre ou l'URL comme clé primaire : ils changent lors des renommages et déplacements.
- Exporter **une page BookStack par document logique**.
- Nom déterministe de fichier : `bookstack-page-<id>.md` (éventuellement préfixé par l'instance).
- Ajouter au document : titre, livre, chapitre éventuel, URL canonique, ID source, date de modification et contenu Markdown.
- Préserver les titres, listes, liens et tableaux utiles ; nettoyer les éléments HTML manifestement décoratifs sans altérer les informations.
- Normaliser le contenu avant empreinte `SHA-256` ; inclure les métadonnées qui affectent la recherche ou la citation (titre, chemin, URL).
- Conserver l'URL source pour citations, sans garantir que l'interface Jarvis la restitue automatiquement : ce comportement doit être testé.
- Ne pas traiter les images/attachments silencieusement : journaliser les contenus non pris en charge et remonter un avertissement.

## 6. Synchronisation — algorithme

### 6.1 Inventaire complet

1. Démarrer `SyncRun` avec statut `RUNNING` et `runId` unique.
2. Tester disponibilité et authentification des deux API ; vérifier la destination configurée.
3. Parcourir **toutes les pages** BookStack, en suivant toutes les pages de pagination.
4. Résoudre livres, chapitres et métadonnées, en privilégiant une collecte efficiente.
5. Valider l'inventaire : pas de pagination incomplète, réponses cohérentes, absence d'erreur critique.
6. Comparer les clés source et les dates/empreintes locales.
7. Exporter le Markdown et calculer le hash pour les pages nouvelles ou présumées modifiées ; en cas de doute, comparer le contenu.
8. Pour une page changée, importer et indexer la nouvelle version, **vérifier le succès avant de retirer l'ancienne**.
9. Mettre à jour atomiquement la correspondance locale seulement après confirmation de l'opération cible.
10. Identifier les pages absentes et les placer en `PENDING_REMOVAL`, mais **uniquement si l'inventaire est complet et validé**.
11. Enregistrer le bilan, les erreurs détaillées et l'état final `SUCCESS`, `PARTIAL` ou `FAILED`.

### 6.2 Synchronisation ciblée

Relance d'une page par son identifiant, à partir de la console. Elle suit les mêmes validations et règles d'indexation et produit une exécution traçable de type `DOCUMENT`.

### 6.3 Règles de suppression

- Par défaut : validation humaine avant tout retrait d'AnythingLLM.
- Proposer une file `PENDING_REMOVAL` avec motif, date du dernier état observé et impact.
- Ne jamais considérer une API inaccessible, un inventaire incomplet ou un HTTP 5xx comme une suppression.
- Une réponse 403/404 isolée doit être marquée `ACCESS_REVIEW` ou anomalie à confirmer ; ne pas supprimer directement.
- Exiger une confirmation explicite pour les retraits en lot.
- Retirer seulement les références et documents **créés et suivis par le connecteur**. Jamais les imports manuels.
- Supprimer physiquement un document seulement si l'API le permet et si aucun autre workspace ne l'utilise ; sinon seulement désindexer/dissocier.
- Ajouter le mode `dry-run` pour simuler les effets avant traitement réel.

### 6.4 Réconciliation

- Synchronisation incrémentale par défaut **toutes les heures**, fréquence modifiable (15 min / 30 min / 1 h / 6 h / 24 h).
- Contrôle complet journalier de cohérence : inventaire local ↔ BookStack ↔ documents possédés côté AnythingLLM.
- Les documents inchangés n'entraînent aucun nouveau calcul d'embeddings.
- Éviter les doublons après crash, redémarrage ou délai réseau grâce aux états, aux clés et à la réconciliation.
- Retry limité avec backoff exponentiel pour 429, 5xx et erreurs réseau transitoires ; ne pas répéter sans contrôle les opérations de mutation dont la réussite est inconnue.

## 7. Console d'administration : exigences UI

Interface responsive, français, sobre, accessible au clavier. Navigation : **Tableau de bord / Documents / Historique / Configuration**.

### 7.1 Tableau de bord

- Santé des connexions BookStack et AnythingLLM (avec date de dernier test).
- Nombre de livres et pages trouvés, synchronisés, en attente, en erreur, en attente de retrait.
- Dernière exécution : date, durée, statut, ajouts, modifications, inchangés, retraits proposés, erreurs.
- Prochaine exécution prévue, activation du planificateur et statut du traitement en cours.
- Boutons `Synchroniser maintenant` et `Simuler` ; éviter les doubles clics par contrôle serveur.
- Barre de progression honnête (`pages traitées / total inventorié`) et phase courante.

### 7.2 Documents

- Tableau paginé avec recherche, tri et filtres (livre, chapitre, statut).
- Colonnes : titre, livre, page ID, dernière modification source, dernier sync, état et détails.
- Fiche document : lien BookStack, URL, hash, ID/chemin AnythingLLM, dernière opération, erreurs et historique récent.
- Action `Resynchroniser`, avec confirmation si elle implique un remplacement.
- Onglet/file de retraits en attente, validation/rejet et trace de décision.

### 7.3 Historique

- Liste paginée des jobs : déclencheur (`SCHEDULED`, `MANUAL`, `DOCUMENT`, `RECONCILIATION`, `DRY_RUN`), utilisateur, début/fin, durée, état.
- Résumé chiffré détaillé ; événements par document ; erreurs filtrables ; identifiant de corrélation.
- Visualisation du log fonctionnel sans afficher tokens ni secrets.
- Conservation 90 jours par défaut, configurable ; statistiques agrégées conservées selon politique de purge.

### 7.4 Configuration

- URL source BookStack, URL destination AnythingLLM (valeurs initiales suggérées).
- Renseignement/rotation des tokens : champs masqués ; **ne jamais renvoyer une valeur de secret dans les réponses API**.
- Choix du workspace cible à partir des workspaces renvoyés par AnythingLLM ; confirmation renforcée en cas de changement après première sync.
- Portée BookStack : `tous les livres accessibles` non restreinte par titre.
- Planification, activation/désactivation, fuseau `Europe/Paris`, intervalle.
- Politique de retrait : approbation manuelle par défaut (mode automatique désactivé en V1 sauf décision explicite future).
- Boutons de test de connexion et indication claire des permissions manquantes.
- Sauvegarde avec validation des URL et contrôle des changements sensibles.

### 7.5 États et messages

`NEW`, `SYNCED`, `OUTDATED`, `PROCESSING`, `ERROR`, `PENDING_REMOVAL`, `ACCESS_REVIEW`, `REMOVED`.

Différencier clairement `SUCCESS`, `PARTIAL`, `FAILED` et `RUNNING`, sans présenter un traitement partiel comme terminé avec succès. Messages compréhensibles, détails techniques dans un volet avancé.

## 8. API interne Express (versionnée)

Toutes les routes `/api/v1/*` sauf `/health` nécessitent authentification et autorisation.

| Méthode | Route | Fonction |
|---|---|---|
| GET | `/api/v1/dashboard` | Statistiques, connexions et activité |
| GET | `/api/v1/documents` | Liste paginée + filtres |
| GET | `/api/v1/documents/:id` | Détail document |
| POST | `/api/v1/documents/:id/sync` | Enqueue resynchronisation ciblée |
| GET | `/api/v1/sync-runs` | Historique paginé |
| GET | `/api/v1/sync-runs/:id` | Détails, événements et compteurs |
| POST | `/api/v1/sync-runs` | Démarrer `incremental`, `full` ou `dry-run` |
| GET | `/api/v1/removals` | Retraits à approuver |
| POST | `/api/v1/removals/:id/approve` | Approuver un retrait |
| POST | `/api/v1/removals/:id/reject` | Rejeter un retrait |
| GET | `/api/v1/settings` | Paramètres sans secrets |
| PATCH | `/api/v1/settings` | Mettre à jour paramètres autorisés |
| POST | `/api/v1/connections/test` | Test ciblé, sans renvoi de credentials |
| GET | `/health` | Liveness sans fuite d'informations |
| GET | `/ready` | Readiness interne, sans secrets |

Les mutations répondent `202 Accepted` avec un job ID si asynchrones et `409 Conflict` si une exécution incompatible est déjà active. Toutes les entrées sont validées via Zod, pagination bornée et erreurs structurées (`code`, `message`, `requestId`).

## 9. Modèle de données Prisma / SQLite

Entités minimales :

1. `Settings` : configuration non secrète, fréquence, destination slug, politique de retrait, dates, version.
2. `CredentialRef` ou mécanisme de secrets externe : référence à un secret, jamais token en clair dans l'API ; privilégier secrets Docker/env pour le bootstrap.
3. `SourcePage` : `id`, `sourceKey` unique, `bookstackId`, titre, livre, chapitre, URL, `sourceUpdatedAt`, `contentHash`, `state`, `lastSeenAt`, `lastSyncAt`, `lastError`.
4. `TargetDocument` : `sourcePageId` unique, document identifier/path API, workspace slug, version/hash publié, date d'indexation, ownership `CONNECTOR_OWNED`.
5. `SyncRun` : id, type, trigger, actor, status, timestamps, counters, progress, error summary.
6. `SyncEvent` : runId, pageId, action, status, message, diagnostic code, timestamps.
7. `PendingRemoval` : sourcePageId, reason, detectedAt, reviewedAt, reviewedBy, decision, decisionReason.
8. `AuditEvent` : actor, action, entity, date, détails non sensibles.
9. `JobLock` : key, owner, leaseUntil, heartbeatAt.

Index sur sourceKey, status, bookId, runId, dates ; contraintes d'unicité évitant les doublons. Migrations versionnées, sauvegarde SQLite cohérente avant migration et mode WAL si approprié (à tester sur le volume retenu).

## 10. Gestion des secrets et authentification

- HTTPS obligatoire via Traefik, domaine suggéré `sync.xperteam.net` à valider.
- Console protégée : privilégier SSO/OIDC via reverse proxy existant si disponible et vérifiable. Sinon authentification locale unique admin robuste, hash Argon2id, cookies `HttpOnly`, `Secure`, `SameSite`, protection CSRF, limitation brute force, sessions expirables ; **jamais une console ouverte**.
- Validation stricte des origines, URL autorisées et redirects pour éviter SSRF ; refuser les URL arbitraires en exécution.
- Les secrets API doivent être injectés via fichiers secrets/variables d'environnement ou stockage chiffré avec clé maître extérieure à SQLite ; rotation contrôlée.
- Ne pas afficher tokens dans réponse JSON, logs, captures ou export de configuration.
- Compte BookStack en lecture seule. Clé AnythingLLM dédiée si possible, avec portée minimale selon possibilités réelles.
- API admin accessible seulement via réseau/route autorisés ; pas de port de base exposé publiquement.
- Headers sécurisés (Helmet), limitation du débit, validation des entrées, dépendances à jour.
- Les données affichées du Markdown BookStack sont potentiellement non fiables : pas de rendu HTML brut sans assainissement.
- Audit des actions manuelles, particulièrement changement de destination et validation de suppression.

## 11. Déploiement Docker sur VPS Jarvis

- Dockerfile multi-stage (build frontend, build backend, runtime non-root).
- Un conteneur `bookstack-sync`, un volume persistant pour SQLite et fichiers temporaires contrôlés.
- Rattachement au réseau existant Traefik ; accès AnythingLLM sur un réseau interne si disponible, sinon HTTPS.
- Aucun mount en écriture sur les volumes AnythingLLM/BookStack.
- `restart: unless-stopped`, healthcheck, limites CPU/RAM raisonnables après mesures, logs rotation.
- Paramètres d'environnement documentés dans `.env.example` sans secret ; secrets réels exclus du dépôt Git.
- Sauvegarde régulière de la base SQLite et procédure de restauration documentée.
- Mettre en œuvre une stratégie simple de rollback d'image + données, sans restaurer une DB plus ancienne sans analyse de compatibilité des migrations.
- Nom final de domaine/réseau/ports à confirmer à l'étape de diagnostic ; ne pas modifier les stacks Jarvis/Traefik avant validation.

## 12. Organisation recommandée du dépôt

```text
bookstack-anythingllm-sync/
├── apps/
│   ├── api/                 # Express, routes, auth, jobs
│   └── web/                 # React, Vite, Tailwind
├── packages/
│   ├── shared/              # DTO, schémas Zod, types
│   ├── bookstack-adapter/   # client REST source
│   ├── anythingllm-adapter/ # client REST cible
│   └── sync-engine/         # orchestration, réconciliation
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
│   ├── compatibility.md
│   ├── architecture.md
│   ├── operations.md
│   └── acceptance.md
├── Dockerfile
├── compose.yaml
├── .env.example
└── README.md
```

Adapter la structure à la simplicité réelle de l'application ; éviter une abstraction lourde de type microservices ou une file Redis non nécessaire.

## 13. Comportements d'erreur

- API source indisponible : échec du job, conserver l'état cible, aucun retrait.
- Inventaire incomplet : statut `PARTIAL`/`FAILED`, ne pas calculer de documents disparus.
- Source modifiée mais import cible échoue : ancienne version indexée conservée, document `ERROR` ou `OUTDATED`.
- Import cible réussit mais réponse perdue : rechercher la version connue avant de recréer pour éviter doublon.
- Timeout d'indexation : vérifier le résultat et réconcilier, sans supprimer l'ancienne version aveuglément.
- Workspace supprimé/renommé : suspendre la synchronisation, alerte.
- Token expiré : alerte console, job échoue sans modification documentaire destructive.
- Redémarrage au milieu d'un run : état interrompu et mécanisme de reprise/reconciliation.
- Échec sur une page : continuer les autres pages si sûr ; job `PARTIAL` et erreurs individuelles.

## 14. Performance et volumétrie

La volumétrie réelle sera mesurée pendant le lot 0 : livres, pages, tailles Markdown, durées API, capacité CPU/RAM du VPS, consommation embeddings. Ne pas fixer arbitrairement des promesses de performance sans mesures.

Cibles fonctionnelles de recette : aucune réindexation sur second run sans modification, aucune suppression accidentelle, fonctionnement de la console pendant les syncs, traitement non bloquant, progression observable, journalisation de toutes les erreurs. Concurrence initiale faible (1–3 exports simultanés max) et configurable après tests de charge.

## 15. Tests et critères d'acceptation

### Unitaires
- Hash déterministe, transformation Markdown, détection d'ajout/modification/renommage/déplacement.
- Validation Zod, politique d'accès et d'approbation.
- Pagination, retry, backoff, idempotence, mapping des erreurs.

### Intégration (APIs simulées)
- Import réussi puis indexation confirmée.
- Erreur entre upload et indexation, relance sans doublon.
- Aucun index lors d'un second run inchangé.
- Suppression d'une page → demande de retrait, pas de suppression par défaut.
- BookStack retourne pagination incomplète / 403 / 500 → aucune suppression.
- Import manuel dans AnythingLLM → jamais touché.
- Reprise après crash et verrou expiré.

### E2E console
- Authentification et fermeture de session.
- Paramétrage + tests de connexion.
- Lancement manuel + progression + historique.
- Recherche document + resynchronisation ciblée.
- Approbation/rejet retrait avec audit.
- Interface mobile, clavier, erreurs explicites, accès refusés.

### Recette finale (obligatoire)
1. Workspace de test distinct et données de test identifiées.
2. Première importation contrôlée et comparaison des comptes de documents.
3. Exécution inchangée : 0 réindexation.
4. Éditer une page source : une seule page réindexée.
5. Renommer/déplacer une page : mise à jour, pas de doublon.
6. Simuler panne source : 0 suppression.
7. Simuler suppression et changement de permissions : retrait proposé, approbation nécessaire.
8. Simuler interruption/restart : reprise sans doublon.
9. Vérifier citations et réponse Jarvis sur un échantillon de questions.
10. Vérifier absence de fuite de secrets et traçabilité des actions.

## 16. Reprise des anciens imports manuels

Ne pas supprimer ni écraser les imports existants automatiquement. Le processus de migration doit : inventorier les fichiers manuels, identifier leur origine, tester les nouveaux documents dans un workspace de recette, mesurer les doublons et la qualité des réponses, puis faire approuver un retrait manuel des anciens documents. Le connecteur n'a aucune propriété sur ces anciens fichiers tant qu'une procédure explicite de transfert de propriété n'a pas été validée.

## 17. Lots de réalisation et livrables

| Lot | Objet | Livrable / jalon |
|---|---|---|
| 0 | Audit technique du VPS, des versions et APIs réelles, des droits et du workspace | `docs/compatibility.md`, décisions et risques ; **aucune mutation** |
| 1 | Monorepo TS, Express, React/Vite, Prisma, Docker et auth minimale | Application démarrable, migrations, CI/tests |
| 2 | Configuration, tests de connexion, sécurité des secrets | Écran Configuration fonctionnel |
| 3 | Inventaire/exports BookStack et modèle documentaire | Import source vérifié, pagination complète |
| 4 | Upload/indexation AnythingLLM et synchronisation ciblée | Workspace de recette alimenté |
| 5 | Incrémental, hash, scheduler, verrous, reconciliation, retraits | Moteur robuste, suppression sur approbation |
| 6 | Dashboard, Documents, Historique, progression, audits | Console complète |
| 7 | Tests, migration contrôlée, sauvegarde, Traefik, mise en production | Recette signée, `docs/operations.md` |

Chaque lot nécessite tests, mise à jour documentation, revue de sécurité et validation avant le suivant. Éviter tout déploiement production avant lot 7.

## 18. Éléments à vérifier / arbitrages restants

- Version effective de l'image AnythingLLM personnalisée `xperteamdigital/anythingllm-custom`, compatibilité exacte de son Swagger.
- Identification du workspace source existant et création éventuelle d'un workspace de recette.
- Authentification de la console : SSO/reverse proxy existant ou login local sécurisé.
- Accès au réseau Traefik, disponibilité du domaine proposé `sync.xperteam.net`.
- Comportement réel des fichiers Markdown et restitution des citations dans Jarvis.
- Contenus sensibles et contrôle des accès du workspace cible.
- Politique précise de sauvegarde et niveau de journalisation selon besoins internes.

## 19. Références publiques

- API BookStack : https://github.com/BookStackApp/BookStack/blob/development/routes/api.php
- Documentation API AnythingLLM : https://docs.anythingllm.com/features/api
- Swagger de l'instance (à contrôler) : https://jarvis.xperteam.net/api/docs
- Schéma SQLite/Prisma AnythingLLM (référence technologique, **ne pas utiliser directement**) : https://github.com/Mintplex-Labs/anything-llm/blob/master/server/prisma/schema.prisma
