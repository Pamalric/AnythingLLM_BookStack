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

## 3. Secrets

- `SESSION_SECRET` ≥ 32 caractères aléatoires  
- `ADMIN_PASSWORD_HASH` (Argon2id) en prod — éviter `ADMIN_PASSWORD` en clair  
- Tokens BookStack / clé AnythingLLM : env Docker secrets **ou** coffre AES-GCM (`SECRETS_MASTER_KEY`)  
- Ne jamais logger ni exposer via API  

Rotation : mettre à jour via Configuration → Secrets, puis `POST /connections/test`.

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
