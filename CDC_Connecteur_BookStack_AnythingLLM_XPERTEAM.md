# XPERTEAM — Cahier des charges technique
## Connecteur de synchronisation BookStack → AnythingLLM (Jarvis)

**Version :** 1.0 — 12 novembre 2026  
**Statut :** spécification pour implémentation avec Cursor  
**Source :** `https://documentation.xperteam.net`  
**Cible :** `https://jarvis.xperteam.net`  
**Hébergement :** VPS Jarvis, service Docker dédié

## 1. Objectifs, périmètre et responsabilités

Construire un connecteur autonome, exécutable sans interface graphique, qui copie et maintient à jour dans un workspace AnythingLLM les pages de **tous les livres visibles pour un compte technique BookStack**. BookStack reste la source de vérité et les modifications ne remontent jamais de Jarvis vers BookStack.

- Granularité : **une page BookStack = un document logique** AnythingLLM.
- Pages dans des livres, directement à la racine du livre ou dans des chapitres : incluses.
- Livres et chapitres : utilisés pour les métadonnées, pas comme documents RAG supplémentaires.
- Synchronisation : toutes les heures, contrôle complet quotidien, commande manuelle disponible.
- Créations, modifications, déplacements, changements de titre, retraits d'accès et suppressions.
- Ne jamais modifier ni supprimer un document AnythingLLM **non créé et enregistré par le connecteur**.
- **V1 hors périmètre :** édition réciproque, interface web, synchronisation temps réel, OCR, transcription de pièces jointes, traitement des vidéos, duplication de la hiérarchie dans plusieurs workspaces, application automatique de permissions par utilisateur.
- Pièces jointes, images et contenus embarqués : gérer les liens et reporter les lacunes; leur ingestion binaire relève d'une V2, sauf validation spécifique.

### Préalable de sécurité
L'inventaire se fait selon les droits du compte technique BookStack. AnythingLLM ne reprend **pas** les ACL BookStack à la page : une page indexée est visible pour les personnes pouvant interroger le workspace. L'administrateur doit vérifier que le compte technique ne voit **que des contenus partageables avec l'ensemble des utilisateurs du workspace**. Ne pas démarrer en production tant que ce contrôle n'est pas validé. Prévoir un compte API à permissions minimales et une revue des permissions après ajout de nouveaux livres.

## 2. Architecture cible

```text
BookStack (documentation.xperteam.net)
  GET /api/pages ; GET /api/pages/{id}
  GET /api/pages/{id}/export/markdown
  GET /api/books ; GET /api/chapters
                |
                | HTTPS + Token ID/secret
                v
bookstack-anythingllm-sync (Docker sur VPS Jarvis)
  - inventory.py      collecte paginée + validation complétude
  - transform.py      normalisation Markdown, métadonnées, SHA-256
  - planner.py        comparaison inventaire / SQLite / destination
  - anythingllm.py    client API AnyLLM, imports et indexation
  - sync.py           orchestration + état transactionnel
  - cli.py            sync/status/doctor/reconcile
  - sqlite            état persistant, historique de runs
                |
                | réseau Docker privé, API Bearer
                v
AnythingLLM — workspace cible
  bibliothèque documentaire + index vectoriel workspace
```

Conteneur **sans port entrant**, réseau Docker partagé avec AnythingLLM si possible. Ne jamais présumer du nom du conteneur, de son réseau, de son slug ou de son port avant inspection de l'installation Jarvis. Conserver l'image personnalisée XPERTEAM inchangée.

## 3. Vérifications préalables obligatoires (phase 0)

1. Inspecter la configuration Docker Compose en place, la version et la santé d'AnythingLLM ; **aucune modification de la stack existante** pendant cette phase.
2. Identifier le réseau et l'URL interne réellement accessible au futur conteneur.
3. Vérifier l'accès Swagger local AnythingLLM (`/api/docs`, s'il est activé) ou les définitions OpenAPI de la version **installée**. Ne pas activer Swagger publiquement en production juste pour le projet.
4. Vérifier l'authentification API AnythingLLM, les espaces de travail existants, le slug retenu et le schéma des documents retournés par l'import (`location`, etc.).
5. Vérifier `GET /api/pages`, sa pagination et son total, l'export d'une page Markdown, les champs `updated_at`, `book_id`, `chapter_id`, `url`, le format d'une page déplacée et les codes d'erreur.
6. Vérifier les permissions du compte API BookStack : accès API, lecture des pages et permission d'export; ne pas donner de droits d'édition.
7. Vérifier les méthodes de retrait de workspace et suppression documentaire globale d'AnythingLLM **sur cette version** : chemins, corps attendus, effet réel et idempotence.
8. Tester une importation et un retrait avec **un document de test** dans un workspace de test, sans toucher aux documents déjà présents.
9. Produire `docs/compatibility.md` avec versions, résultats, échantillons expurgés, incompatibilités et décisions.

**Blocage :** si une fonctionnalité nécessaire n'est pas prise en charge par l'API installée, consigner le problème et proposer une variante documentée; ne pas inventer d'endpoint ni toucher à la DB AnythingLLM.

## 4. Contrats API (à confirmer sur l'instance)

### BookStack

Base : `https://documentation.xperteam.net/api`

Authentification : `Authorization: Token <BOOKSTACK_TOKEN_ID>:<BOOKSTACK_TOKEN_SECRET>`.

- `GET /pages` : itérer sur toutes les pages, gérer `count`, `offset`, `total`, jusqu'à preuve de complétude. Ne pas présumer que la première réponse contient tout.
- `GET /pages/{id}` : récupérer métadonnées et URL de la page quand nécessaire.
- `GET /pages/{id}/export/markdown` : récupérer le corps de texte; texte brut, pas nécessairement JSON.
- `GET /books`, `GET /chapters` : construire des tables de correspondance IDs → noms.

Le format exact de pagination, les champs et les permissions sont à vérifier dans la documentation `/api/docs` de la version présente.

### AnythingLLM

Base interne : `<ANYTHINGLLM_URL>/api/v1`.

Authentification : `Authorization: Bearer <ANYTHINGLLM_API_KEY>`.

- `GET /workspaces` : identifier le workspace cible.
- `POST /document/upload` : multipart form-data `file`, contenu Markdown; lire `documents[].location` dans la réponse si fourni.
- `POST /workspace/{slug}/update-embeddings` : `{"adds": ["<doc location>"], "deletes": []}` ou inversement pour retirer. Les identifiants attendus sont généralement les `location`, à **vérifier**.
- `GET /documents` : vérifier présence en bibliothèque.
- Suppression dans la bibliothèque : endpoint et schéma à relever dans la version déployée (la documentation OpenAPI récente signale `DELETE /system/remove-documents`; à ne pas supposer sans test).

**Ne jamais utiliser** de requêtes SQL directes sur AnythingLLM.

## 5. Modèle documentaire

Identifiant logique stable : `bookstack:<page_id>` ; il reste identique après renommage ou déplacement.
Nom de fichier exporté proposé : `bookstack-page-<page_id>.md`.

Préfixer le Markdown par un en-tête lisible et déterministe, sans secret :

```markdown
# <Titre de la page>

Source : BookStack
Document ID : bookstack:<page_id>
Livre : <Nom du livre>
Chapitre : <Nom du chapitre ou Aucun>
Modifié le : <updated_at ISO 8601>
URL source : <lien direct BookStack>

## Contenu

<markdown exporté, nettoyé>
```

Conserver en SQLite les champs : `source_id`, `book_id`, `chapter_id`, `source_url`, `title`, `source_updated_at`, `content_hash`, `target_location`, `workspace_slug`, `sync_status`, `last_success_at`, `last_seen_run_id`, `error_code`, `error_message`.

**Empreinte :** calculer `SHA-256` sur les octets UTF-8 du **contenu final transmis** (titre, contexte, URL et corps normalisé). Ainsi une modification du titre, du chapitre ou de l'URL provoque aussi une mise à jour si elle change le document final.

Normalisation : UTF-8, fins de lignes LF, suppression des doublons évidents de titre, conservation du code, des tableaux et des liens; éviter de retirer toute balise HTML aveuglément. Les images/attachments non analysables doivent rester identifiables par lien, avec avertissement dans les logs si besoin. Pas de téléchargement de fichiers arbitraires ou d'URL externes en V1.

## 6. État SQLite

Tables minimales :

- `documents` : PK `source_id`, hash courant, métadonnées, emplacement AnythingLLM, statut, dates, espace cible.
- `sync_runs` : run id, type (normal/full/dry-run), début/fin, état, counts, erreurs, inventaire complet booléen.
- `sync_events` : run id, page, opération, statut, timestamps, cause, ancien/nouvel emplacement.
- `settings` : version de schéma et paramètres de contrôle non secrets.

SQLite journal WAL si supporté par le volume; migrations versionnées. Écriture transactionnelle pour chaque transition. Ne pas sauvegarder les tokens en base.

La première exécution crée un inventaire initial; ne jamais présumer que des pages ont déjà été synchronisées parce qu'un fichier de nom similaire existe. Les documents préexistants importés manuellement demeurent hors gestion. La migration éventuelle des importations manuelles nécessite une opération explicite, distincte et précédée d'une sauvegarde.

## 7. Algorithme incrémental

### Inventaire

1. Créer un run et acquérir un verrou non bloquant empêchant les exécutions concurrentes.
2. Tester BookStack et AnythingLLM. Sur erreur d'authentification, arrêter sans mutation.
3. Charger **toutes** les pages accessibles, avec pagination jusqu'à validation de la complétude; ne jamais déduire les suppressions d'un inventaire incomplet.
4. Charger livres et chapitres; construire l'arborescence; relever anomalies.
5. Comparer chaque page à SQLite : nouvelles ou candidats modifiés selon `updated_at`, titre, parent, URL.
6. Pour les candidats, exporter Markdown et calculer l'empreinte finale. Si empreinte identique, actualiser uniquement `last_seen_run_id`.
7. Importer les documents nouveaux/modifiés en séquence ou par petits lots limités, initialement concurrence 1–2 et backoff sur 429/5xx.
8. Vérifier l'import, ajouter le **nouvel** emplacement au workspace, vérifier le résultat, puis retirer l'**ancien** emplacement. Si la création échoue, ne pas retirer l'ancien.
9. Enregistrer transactionnellement le nouvel emplacement et le hash dans SQLite. Si une étape échoue, garder l'état `pending`/`error` avec de quoi reprendre sans perte.
10. Nettoyer les anciens documents gérés par le connecteur uniquement si l'API de suppression globale est confirmée, après désindexation, sous conditions (voir section 8).
11. Marquer comme non vus les documents absents seulement après inventaire **complet** et cohérent; ne pas les supprimer immédiatement.
12. Journaliser le bilan et libérer le verrou.

### État de reprise et idempotence

En cas de coupure entre import et mise à jour SQLite, un second passage doit identifier les documents importés précédemment afin d'éviter les doublons : enregistrer un état `uploaded_pending_embed`, puis `embedded_pending_retire`, puis `complete`. Prévoir un mécanisme de reprise pour les artefacts orphelins et une commande `reconcile` comparant la bibliothèque cible aux seules traces appartenant au connecteur.

**Attention :** AnythingLLM peut retourner une opération acceptée avant la disponibilité de l'index. La vérification de visibilité peut nécessiter un court polling avec délai borné. Ne pas exiger qu'une question du LLM retourne immédiatement le nouveau contenu comme preuve unique.

## 8. Politique de retrait et suppression

Trois cas :

1. **Ancienne version remplacée :** désindexer l'ancien emplacement seulement après succès confirmé de la nouvelle indexation; supprimer ensuite l'ancien document **possédé par le connecteur** si l'opération globale est documentée et sûre.
2. **Page absente de l'inventaire :** ne pas supprimer sur une seule absence. Marquer `missing_candidate` et vérifier au prochain inventaire complet, avec contrôle de la santé API, total des pages et éventuelle chute anormale du volume. Par défaut, exiger deux inventaires complets consécutifs et confirmation explicite de la politique opérateur.
3. **Retrait d'autorisation :** le compte technique ne voit plus la page. Comme il est impossible de distinguer automatiquement une suppression d'une perte de visibilité, appliquer la même politique de retrait après confirmation. Pour les documents sensibles, prévoir une commande de retrait d'urgence par ID.

**Garde-fous :**
- Refuser la purge si les pages retournées chutent de plus de **20 %** par rapport au dernier inventaire complet validé; seuil configurable. Lever alerte.
- Refuser la purge si pagination partielle, erreur 401/403/429/5xx non résolue, `total` incohérent ou erreurs de lecture.
- `--dry-run` affiche créations / mises à jour / retraits / purges sans aucune mutation distante et sans valider un nouvel état métier.
- `--allow-deletions` nécessaire pour une purge exécutée manuellement en phase initiale; activation automatique possible seulement après réception V1, via config.
- Seuls les `target_location` conservés par le connecteur peuvent être retirés/supprimés.
- Le changement de workspace cible n'entraîne jamais automatiquement la suppression d'un autre workspace.

**Exception importante :** une demande de suppression urgente (confidentialité/incident) doit pouvoir forcer le retrait **immédiat** du workspace et la suppression du document en bibliothèque, puis être vérifiée; un processus ordinaire de confirmation ne doit pas retarder la réponse à un incident. Les historiques de chat et backups peuvent nécessiter un traitement distinct.

## 9. Configuration et déploiement

Projet à placer dans un répertoire dédié, par exemple `/opt/bookstack-anythingllm-sync`, après validation de la convention du VPS. Réseau Docker existant à identifier dans la phase 0.

`.env.example` sans secrets :

```dotenv
BOOKSTACK_BASE_URL=https://documentation.xperteam.net
BOOKSTACK_TOKEN_ID=replace-me
BOOKSTACK_TOKEN_SECRET=replace-me
ANYTHINGLLM_BASE_URL=http://anythingllm:3001
ANYTHINGLLM_API_KEY=replace-me
ANYTHINGLLM_WORKSPACE_SLUG=documentation-xperteam
SYNC_INTERVAL_MINUTES=60
FULL_RECONCILIATION_HOURS=24
SYNC_PAGE_CONCURRENCY=2
HTTP_TIMEOUT_SECONDS=30
HTTP_MAX_RETRIES=4
DELETE_ENABLED=false
DELETE_MISSING_CONFIRMATIONS=2
DELETE_MAX_DROP_PERCENT=20
LOG_LEVEL=INFO
DB_PATH=/data/sync.db
```

La valeur `ANYTHINGLLM_BASE_URL` est **indicative** et devra être remplacée par l'adresse interne réellement identifiée. Le slug du workspace devra correspondre à un espace réellement existant.

Exigences Docker :
- image Python légère, version figée, utilisateur non root;
- `restart: unless-stopped`, limite mémoire/CPU adaptées au VPS, `read_only` si compatible, volume `/data`, `/tmp` temporaire;
- secrets via fichier env protégé (permissions `0600`) ou secrets Docker disponibles;
- service sans `ports:` publics; réseau externe attaché à l'instance AnythingLLM;
- healthcheck testant l'état du worker (pas uniquement la vie du processus);
- signal SIGTERM géré pour arrêter proprement après une étape atomique;
- logs structurés JSON sur stdout, pas de contenu documentaire ni tokens dans les logs;
- rotation/limitation des logs Docker et sauvegarde SQLite.

### Exemple de Compose (à adapter)

```yaml
services:
  bookstack-sync:
    build: .
    restart: unless-stopped
    env_file: .env
    volumes:
      - bookstack_sync_data:/data
    networks:
      - jarvis_internal
    security_opt:
      - no-new-privileges:true
    # Pas de port entrant

volumes:
  bookstack_sync_data:

networks:
  jarvis_internal:
    external: true
    name: REPLACE_WITH_ACTUAL_DOCKER_NETWORK
```

Attention : avec `networks: ... external: true`, ne démarrer qu'après avoir remplacé le nom réseau; ne pas recréer le réseau d'AnythingLLM par accident. Vérifier si l'instance AnythingLLM expose effectivement un port interne sur ce réseau.

## 10. CLI et exploitabilité

Prévoir `python -m app <commande>` avec les sous-commandes :

```text
 doctor                 Vérifie configuration, connectivité et compatibilité
 inventory              Compte pages/livres/chapitres (lecture seule)
 sync --dry-run         Affiche le plan sans effet distant
 sync                   Synchronisation incrémentale
 sync --full            Réconciliation complète
 status                 Bilan des dernières exécutions
 reconcile --dry-run    Recherche les divergences/orphelins gérés
 remove-page <id>       Retrait urgent ciblé, confirmation requise
```

Sortie console utilisable manuellement ou via Docker. Code retour non nul si le run échoue ou est partiellement en erreur. Le scheduler ne doit jamais faire tourner deux runs en parallèle. Documenter `docker compose run --rm bookstack-sync ...` en adaptant l'entrypoint réel.

## 11. Observabilité et sauvegarde

Chaque run doit produire : date, durée, pages découvertes, nouvelles, modifiées, inchangées, retirées, erreurs, coût potentiel d'embedding (au minimum volume approximatif de caractères ou tokens à réindexer), santé des API, inventaire complet ou non.

Alerter au minimum : échec de deux runs consécutifs, 401/403, modification anormale du nombre de pages, erreur de désindexation, croissance des orphelins et indisponibilité AnythingLLM. V1 : logs et possibilité de notification email/webhook plus tard.

Sauvegarder le volume SQLite avant la mise à jour du conteneur et régulièrement. Le fichier SQLite n'est pas la source documentaire, mais il est nécessaire pour connaître les documents distants possédés par le connecteur. Tester la restauration.

## 12. Tests automatisés

Tests unitaires :
- pagination 1 page / N pages / pages vides / total incohérent;
- normalisation Markdown stable et hash déterministe;
- identifiant stable si titre/chapitre change;
- changement de métadonnées visible provoquant une actualisation;
- contenu inchangé ne provoquant pas d'appel d'embedding;
- retries 429/500, backoff, timeout, réponses incorrectes;
- panne source pendant l'inventaire n'entraîne aucune suppression;
- API 403 sur une page et inventaire incomplet;
- seuil de réduction massive 20 %;
- verrou concurrent et interruption à mi-parcours;
- conservation de l'ancien document si le nouvel upload/embed échoue;
- absence de suppression des imports manuels.

Tests d'intégration (sur workspace de test) :
1. Deux pages sont importées et apparaissent dans le workspace.
2. Une seconde synchronisation ne réimporte rien.
3. Une modification remplace les données sans version obsolète exploitable.
4. Un déplacement de chapitre actualise le contexte sans créer un second document logique.
5. Une page supprimée est détectée; le retrait ne s'effectue qu'après confirmation et selon la politique.
6. Une interruption après upload se rétablit sans doublon.
7. Une baisse massive de visibilité ne provoque aucune purge.
8. Un document ajouté manuellement à AnythingLLM reste inchangé.
9. Une réponse RAG cite le contenu attendu et, dans la mesure des capacités de la version, sa source.
10. Un retrait urgent ôte le document indexé et le supprime de la bibliothèque conformément à la politique.

## 13. Critères de réception

- 100 % des pages **exportables par le compte API** sont inventoriées, sauf anomalies identifiées et rapportées.
- Tous les documents valides sont présents et indexés dans le workspace de test.
- Deux synchronisations consécutives sur corpus immuable : **zéro réimportation / zéro réembedding**.
- Détection d'un changement à l'exécution suivante (objectif : au plus 60 minutes si service disponible).
- Un renommage ou déplacement ne crée pas de doublon logique.
- Les suppressions sont effectuées selon une politique explicite, sans perte liée à une panne, et ne touchent pas les documents manuels.
- Une interruption en cours de traitement est récupérable.
- L'intégration ne modifie pas l'image personnalisée AnythingLLM, ses services ni sa base.
- Aucun secret n'apparaît dans Git, logs et sorties de CLI.
- README, `.env.example`, commandes d'exploitation, tests, procédure rollback et `docs/compatibility.md` livrés.

## 14. Plan d'implémentation pour Cursor

### Lot 0 — Diagnostic de l'existant (bloquant)
**Livrables :** `docs/compatibility.md`, diagnostic réseau et APIs, tests d'appels de lecture, identification workspace. Ne rien modifier.

### Lot 1 — Socle du service
**Livrables :** arborescence Python, configuration validée, Dockerfile, Compose isolé, logging, SQLite et migrations, clients HTTP, tests de base.

### Lot 2 — Inventaire et transformation BookStack
**Livrables :** pagination complète, récupération hiérarchie, export Markdown, nettoyage, URL, hash, CLI `inventory` et tests.

### Lot 3 — Import dans AnythingLLM
**Livrables :** upload, association au workspace, stockage `location`, reprise après erreur, test réel avec un workspace de test.

### Lot 4 — Synchronisation incrémentale
**Livrables :** planificateur des changements, remplacements prudents, idempotence, mode dry-run et tests de reprise.

### Lot 5 — Suppressions et contrôle
**Livrables :** détection d'absence, confirmation, blocage sur baisse massive, retrait, purge sélective, CLI de retrait d'urgence et reconcile.

### Lot 6 — Exploitation VPS et recette
**Livrables :** scheduler horaire, réconciliation quotidienne, logs, healthcheck, sauvegarde/rollback, documentation, tests d'acceptation, rapport final.

Chaque lot doit faire l'objet d'un commit Git indépendant et de tests passants. La mise en production doit suivre une recette sur un workspace distinct; ne pas connecter directement le service à l'espace existant sans validation.

## 15. Consigne initiale à donner à Cursor

> Tu développes un connecteur autonome de synchronisation BookStack vers AnythingLLM pour XPERTEAM. Commence par lire intégralement `CDC_Connecteur_BookStack_AnythingLLM_XPERTEAM.md`. Exécute **uniquement le lot 0** : diagnostic de la configuration existante de Jarvis, vérification de la connectivité, versions, endpoints, schemas, permissions, workspace cible et de la stratégie de suppression. Produis `docs/compatibility.md` et une liste des points à valider. Ne modifie aucune image, aucun conteneur, aucune donnée, aucune variable sensible, aucun document et aucun workspace pendant ce lot. Ensuite, propose les changements du lot 1 sans les appliquer tant que le diagnostic n'a pas été relu. Implémente ensuite les lots 1 à 6 dans l'ordre, avec tests et commits, seulement après validation de la compatibilité. Les invariants de sécurité et d'absence de perte documentaire priment sur la vitesse d'exécution.

## 16. Références techniques

- BookStack, routes officielles : https://github.com/BookStackApp/BookStack/blob/development/routes/api.php
- BookStack, documentation API : https://www.bookstackapp.com/docs/admin/hacking-bookstack/
- BookStack, exports : https://www.bookstackapp.com/docs/user/export-import/
- BookStack, permissions : https://www.bookstackapp.com/docs/user/roles-and-permissions/
- AnythingLLM, API développeur : https://docs.anythingllm.com/features/api
- AnythingLLM, OpenAPI source : https://github.com/Mintplex-Labs/anything-llm/blob/master/server/swagger/openapi.json
- AnythingLLM, gestion de documents et effacement : https://docs.useanything.com/features/privacy-and-data-handling

**Note :** ces références décrivent des capacités généralement documentées et non la version précise de Jarvis. Le lot 0 doit valider les endpoints sur les installations réelles avant implémentation.
