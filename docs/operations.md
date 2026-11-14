# Opérations — BookStack Sync

**Périmètre :** déploiement, sauvegarde, secrets, Traefik, rollback, recette.  
**Règle :** aucune écriture volume `jarvis_storage` ; mutations AnythingLLM uniquement via API publique.

## 1. Artefacts critiques

| Élément | Emplacement typique |
|---|---|
| SQLite Sync | `data/bookstack-sync.db` (volume Docker `bookstack_sync_data`) |
| Secrets chiffrés | `data/secrets.enc` + `SECRETS_MASTER_KEY` (hors Git) |
| Config runtime | `.env` (jamais commitée) |
| Image | `bookstack-sync:0.1.0` via `Dockerfile` / `compose.yaml` |

## 2. Sauvegarde SQLite

Arrêt bref recommandé pour cohérence (ou copie à froid si WAL checkpoint).

```powershell
# Windows (dev)
.\scripts\backup-sqlite.ps1
```

```bash
# Linux / VPS
./scripts/backup-sqlite.sh
```

Conserver au moins 7 copies quotidiennes hors du volume applicatif. Restauration : stopper le service, remplacer `bookstack-sync.db` (+ `-wal`/`-shm` si présents), redémarrer.

## 3. Secrets & variables d’environnement clés

Ne jamais committer `.env`. Les valeurs ci-dessous ne doivent pas apparaître dans les logs ni les réponses API.

### `NODE_ENV`

| | |
|---|---|
| **Rôle** | Mode d’exécution de l’API |
| **Valeurs** | `development` \| `test` \| `production` |
| **Prod VPS** | `production` |
| **Effet** | Active `isProd` : Helmet renforcé, cookies de session marqués `Secure` même si `COOKIE_SECURE` est omis |

### `SESSION_SECRET`

| | |
|---|---|
| **Rôle** | Clé HMAC pour signer / vérifier le cookie de session console |
| **Contrainte** | **≥ 32 caractères** (sinon démarrage refusé) |
| **Prod** | Chaîne longue **aléatoire** ; unique par environnement ; ne jamais réutiliser un exemple |
| **Génération** | `openssl rand -base64 48` |
| **Rotation** | Changer la valeur **déconnecte tous les utilisateurs** (sessions invalides) |

### `ADMIN_PASSWORD` / `ADMIN_PASSWORD_HASH`

| | |
|---|---|
| **Rôle** | Mot de passe du compte console (`ADMIN_USERNAME`, défaut `administrator`) |
| **Priorité** | Si `ADMIN_PASSWORD_HASH` est défini, il **prime** ; sinon `ADMIN_PASSWORD` est hashé Argon2id **au démarrage** |
| **Dev** | `ADMIN_PASSWORD=…` acceptable |
| **Prod** | Préférer **`ADMIN_PASSWORD_HASH`** (Argon2id) et **retirer** `ADMIN_PASSWORD` du `.env` |
| **Note** | Le hash n’est pas persisté en SQLite aujourd’hui : il est recalculé / relu depuis l’env à chaque start. Un warning est loggé si le mot de passe est fourni en clair |

Pour produire un hash hors process (exemple Node une fois les deps installées) :

```bash
node -e "import('argon2').then(a=>a.hash('VOTRE_MOT_DE_PASSE')).then(console.log)"
```

### `COOKIE_SECURE`

| | |
|---|---|
| **Rôle** | Attribut `Secure` des cookies session / CSRF |
| **Valeurs** | `true` / `1` → Secure ; autre ou absent → non Secure **sauf** si `NODE_ENV=production` (forcé Secure) |
| **Prod HTTPS (Traefik)** | `COOKIE_SECURE=true` |
| **Dev HTTP local** | `COOKIE_SECURE=false` (sinon le navigateur n’envoie pas le cookie) |
| **Lié** | `COOKIE_SAME_SITE` : `lax` (défaut) ; `none` seulement si besoin cross-site **et** Secure |

### `SECRETS_MASTER_KEY`

| | |
|---|---|
| **Rôle** | Clé maître AES-256-GCM du coffre fichier (`SECRETS_FILE`, défaut `data/secrets.enc`) pour tokens saisis **via la console** |
| **Contrainte** | Si utilisée : **≥ 16 caractères** ; en pratique ≥ 32 aléatoires |
| **Prod** | Obligatoire si vous enregistrez BookStack / AnythingLLM depuis l’UI ; sinon fournir les secrets uniquement en variables d’env (`BOOKSTACK_TOKEN_*`, `ANYTHINGLLM_API_KEY`) |
| **Génération** | `openssl rand -base64 32` |
| **Critique** | Perte de la clé = **impossible de déchiffrer** `secrets.enc` → resaisir les tokens. La clé vit **hors** SQLite ; sauvegarder avec le même soin que les backups DB |

### `ALLOWED_ANYTHINGLLM_HOSTS`

| | |
|---|---|
| **Rôle** | Allowlist **SSRF** : hôtes autorisés pour l’URL AnythingLLM (tests de connexion, sync, list workspaces) |
| **Format** | Hosts séparés par des virgules, **sans** schéma ni chemin : `jarvis.xperteam.net,anythingllm` |
| **Prod typique** | `jarvis.xperteam.net,anythingllm` |
| **Réseau Docker** | Ajouter le **hostname DNS Compose** du conteneur Jarvis si l’URL interne n’est pas déjà listée (ex. nom de service `anythingllm`, ou hostname réel du conteneur). Comparaison en minuscules |
| **HTTP interne** | L’hôte `anythingllm` (ou un hôte explicitement listé) peut être autorisé en HTTP sur le réseau `proxy` ; les autres hôtes restent en HTTPS sauf règle équivalente côté code |
| **Lié** | `ALLOWED_BOOKSTACK_HOSTS` (même logique pour BookStack, ex. `documentation.xperteam.net`) |

Exemple VPS (appel Jarvis en HTTPS public) :

```env
ALLOWED_ANYTHINGLLM_HOSTS=jarvis.xperteam.net,anythingllm
```

Si l’URL configurée dans la console est `http://anythingllm:3001` (réseau Docker), `anythingllm` **doit** figurer dans la liste.

### Récap génération rapide (Linux / VPS)

```bash
openssl rand -base64 48   # SESSION_SECRET
openssl rand -base64 32   # SECRETS_MASTER_KEY
```

Tokens BookStack / clé AnythingLLM : env Docker **ou** coffre UI (`SECRETS_MASTER_KEY`).  
Rotation tokens : Configuration → Secrets, puis test de connexion.

## 4. Déploiement Docker (hors prod Jarvis tant que non validé)

```bash
cp .env.example .env   # renseigner secrets
docker compose up --build -d
curl -fsS http://127.0.0.1:8080/health
```

Sur le VPS : joindre le réseau Traefik `proxy` et décommenter les labels dans `compose.yaml` **après** DNS/TLS prêts (`sync.xperteam.net` ou domaine choisi).

## 5. Traefik / DNS

1. DNS A/AAAA → IP publique du VPS Jarvis (ou reverse proxy).  
2. Labels Traefik : `Host(...)`, `websecure`, `letsencrypt`.  
3. Cookies : `COOKIE_SECURE=true`, `COOKIE_SAME_SITE=lax` (ou `none` si cross-site HTTPS).  
4. Ne pas exposer le port 8080 publiquement si Traefik termine le TLS.

## 6. Rollback

1. `docker compose down`  
2. Remettre l’image précédente taguée (`bookstack-sync:<tag>`)  
3. Restaurer le dernier backup SQLite si migration incompatible  
4. `docker compose up -d`  
5. Vérifier `/health`, login, dernier sync-run  

Les documents déjà indexés dans AnythingLLM **ne sont pas** annulés automatiquement par un rollback Sync.

## 7. Historique & reprise

- Rétention SyncRun/SyncEvent : **90 jours** (purge planifiée quotidienne).  
- Redémarrage mid-job : runs `RUNNING` orphelins → `FAILED` au démarrage ; pages `PROCESSING` → `OUTDATED`.  
- Fermeture navigateur : **ne stoppe pas** le job serveur.

## 8. Checklist recette (CDC §15) — à signer

| # | Contrôle | OK |
|---|---|---|
| 1 | Workspace **recette** distinct, pas de slug prod | ☐ |
| 2 | Tokens RO BookStack + clé API configurés, tests connexion verts | ☐ |
| 3 | Simulation (dry-run) : inventaire cohérent, 0 mutation Jarvis | ☐ |
| 4 | Sync document unique : 1 fichier `bookstack-sync/`, ownership CONNECTOR_OWNED | ☐ |
| 5 | Second run inchangé : 0 réindexation | ☐ |
| 6 | Édition page source → 1 seule page réindexée | ☐ |
| 7 | Panne inventaire / 5xx → 0 retrait proposé | ☐ |
| 8 | Page absente → `PENDING_REMOVAL`, approbation manuelle | ☐ |
| 9 | Restart API mid-run → reprise sans doublon destructif | ☐ |
| 10 | Aucun secret dans logs / réponses API / Git | ☐ |

**Prod :** uniquement après checklist signée + accord explicite XPERTEAM.

## 9. Migration imports manuels AnythingLLM

Ne pas supprimer les imports existants automatiquement. Inventaire → workspace recette → comparaison qualité → approbation humaine → retrait manuel des anciens docs hors `CONNECTOR_OWNED`.
