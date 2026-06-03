# OLEL — Guide de déploiement complet (production)

Plateforme d'alerte précoce multi-risques — Matam / Gorgol.
Ce guide couvre **toutes les applications** de bout en bout : API backend, centre de commandement (dashboard), bot WhatsApp, et apps mobiles citoyen/sentinelle — jusqu'à la mise en production.

> Hébergement web ciblé : **VPS Hostinger** (Ubuntu) via Docker. Apps mobiles : **APK Android + iOS via Capacitor** (voir `apps/mobile/CAPACITOR.md`).

---

## 1. Architecture & composants

| Composant | Techno | Rôle | Port interne |
|-----------|--------|------|--------------|
| **backend** | NestJS + Prisma | API REST + WebSocket + files Bull | 4000 |
| **dashboard** | Next.js | Centre de commandement (admin/préfecture) | 3000 |
| **mobile** | Next.js (PWA) → Capacitor | App citoyen/sentinelle (web + APK/iOS) | 3001 |
| **bot** | NestJS | Webhook WhatsApp + diffusion | 3002 |
| **postgres** | PostgreSQL + PostGIS | Base de données géospatiale | 5432 |
| **redis** | Redis | Files Bull + sessions bot | 6379 |

Sous-domaines recommandés (à créer dans le DNS Hostinger) :
- `api.olel.sn` → backend (4000)
- `app.olel.sn` → dashboard (3000)
- `m.olel.sn` → app mobile version web (3001)
- `bot.olel.sn` → webhook WhatsApp (3002)

---

## 2. Prérequis

- Un VPS Hostinger (KVM 2 minimum : 2 vCPU / 8 Go RAM conseillé), Ubuntu 22.04.
- Un nom de domaine (ex. `olel.sn`) avec accès DNS Hostinger.
- Un compte **Meta WhatsApp Cloud API** (token, phone number id, app secret, verify token).
- (Optionnel) Un compte SMS **Africa's Talking** (ou Orange Sénégal) pour SMS/IVR/OTP réels.
- Pour le mobile : Android Studio (APK) et/ou macOS + Xcode (iOS).

---

## 3. Déploiement des applications WEB sur le VPS Hostinger

### 3.1. Préparer le VPS
Connexion SSH puis installation de Docker :
```bash
ssh root@VOTRE_IP_VPS
apt update && apt -y upgrade
curl -fsSL https://get.docker.com | sh
apt -y install docker-compose-plugin git
```

### 3.2. Récupérer le code
```bash
mkdir -p /opt/olel && cd /opt/olel
git clone <URL_DU_DEPOT> .       # ou transférer le dossier OLEL via scp
```

### 3.3. Configurer les secrets (.env)
```bash
cp .env.example .env
nano .env
```
À renseigner impérativement (valeurs fortes, ≥ 32 caractères pour les secrets) :
```
POSTGRES_PASSWORD=...                 # mot de passe DB
JWT_SECRET=...                        # 32+ caractères
JWT_REFRESH_SECRET=...                # 32+ caractères
TOTP_ENCRYPTION_KEY=...               # 64 hex OU passphrase 32+ (chiffrement 2FA)
WS_PUBLIC_ORIGIN=wss://api.olel.sn
BOT_API_KEY=...                       # clé interne backend <-> bot
WHATSAPP_TOKEN=...                    # Meta Cloud API
WHATSAPP_PHONE_ID=...
WHATSAPP_VERIFY_TOKEN=...             # choisi par vous (config webhook Meta)
WHATSAPP_APP_SECRET=...               # secret d'app Meta (vérif. HMAC)
AFRICAS_TALKING_KEY=...               # SMS/IVR (sinon 'sandbox')
AFRICAS_TALKING_USER=...
NODE_ENV=production
```

### 3.4. Adapter les URLs publiques (production)
Dans `docker-compose.yml`, remplacer les `localhost` par vos domaines (dashboard & mobile) :
```
dashboard.environment.NEXT_PUBLIC_API_URL = https://api.olel.sn
dashboard.environment.NEXT_PUBLIC_WS_URL  = wss://api.olel.sn
mobile.environment.NEXT_PUBLIC_API_URL    = https://api.olel.sn
mobile.environment.NEXT_PUBLIC_WS_URL     = wss://api.olel.sn
backend.environment.DASHBOARD_URL         = https://app.olel.sn
backend.environment.MOBILE_URL            = https://m.olel.sn
```

### 3.5. Démarrer la pile
```bash
docker compose up --build -d
docker compose logs -f backend      # vérifier le démarrage + migration + seed
```
Au premier démarrage le backend exécute `prisma db push` puis `db seed` (zones, comptes, formations, mission de démo).

> **Migrations production** : pour un suivi versionné, remplacer `prisma db push` par des migrations (`npx prisma migrate dev --name init` en local, committer le dossier `prisma/migrations`, puis `prisma migrate deploy` en prod).

### 3.6. Reverse proxy Nginx + HTTPS (Let's Encrypt)
Installer Nginx + Certbot sur l'hôte :
```bash
apt -y install nginx certbot python3-certbot-nginx
```
Exemple de bloc Nginx (`/etc/nginx/sites-available/olel.conf`) — un `server` par sous-domaine :
```nginx
server {
  server_name api.olel.sn;
  location / { proxy_pass http://127.0.0.1:4000; proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";
    proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
}
server { server_name app.olel.sn; location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; } }
server { server_name m.olel.sn;   location / { proxy_pass http://127.0.0.1:3001; proxy_set_header Host $host; } }
server { server_name bot.olel.sn; location / { proxy_pass http://127.0.0.1:3002; proxy_set_header Host $host; } }
```
Activer + TLS :
```bash
ln -s /etc/nginx/sites-available/olel.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d api.olel.sn -d app.olel.sn -d m.olel.sn -d bot.olel.sn
```
Le WebSocket (`/alerts`) passe par `api.olel.sn` grâce aux en-têtes Upgrade ci-dessus.

### 3.7. Configurer le webhook WhatsApp (Meta)
Dans Meta for Developers → WhatsApp → Configuration :
- URL de rappel : `https://bot.olel.sn/api/webhook`
- Token de vérification : la valeur de `WHATSAPP_VERIFY_TOKEN`
- S'abonner aux événements `messages`.
La signature HMAC (`X-Hub-Signature-256`) est vérifiée automatiquement (secret = `WHATSAPP_APP_SECRET`).

---

## 4. Application MOBILE (citoyen / sentinelle) — APK & iOS

Le code mobile est une PWA Next.js empaquetée en natif avec **Capacitor**. Procédure détaillée dans `apps/mobile/CAPACITOR.md`. En résumé :
```bash
pnpm install && pnpm --filter @olel/ui build
cd apps/mobile
export NEXT_PUBLIC_API_URL=https://api.olel.sn
pnpm build:static          # export statique -> out/
npx cap add android        # (et/ou) npx cap add ios
pnpm cap:android           # Android Studio -> APK / AAB signé (Play Store)
pnpm cap:ios               # Xcode -> Archive (App Store)
```
- **APK à partager** (hors store) : Android Studio → Build APK(s).
- **Play Store** : AAB signé + fiche `sn.olel.app`.
- **App Store** : Archive Xcode → App Store Connect.
- Le dashboard reste une **app web** (sous `app.olel.sn`), pas une app de store.

---

## 5. Sécurité de production (checklist)

- [x] Secrets forts dans `.env` (jamais committés — `.gitignore` en place).
- [x] HTTPS/WSS partout (Certbot) ; CSP stricte active côté backend.
- [x] HMAC du webhook WhatsApp vérifié (rejet si secret absent en prod).
- [x] Secret 2FA (TOTP) chiffré au repos (AES-256-GCM).
- [x] Auto-inscription limitée à CITOYEN/SENTINELLE ; rôles élevés via endpoint admin protégé.
- [x] Rate-limiting (login, refresh, OTP, service-token).
- [ ] Restreindre le port Postgres/Redis au réseau Docker (ne pas exposer 5432/6379 publiquement) — vérifier le firewall (`ufw allow 80,443`; bloquer le reste).
- [ ] Sauvegardes (voir §6) et tests d'intrusion avant mise en service (recommandé CNDP).

---

## 6. Exploitation : sauvegardes, monitoring, PRA/PCA

**Sauvegarde Postgres (quotidienne, cron)** :
```bash
docker compose exec -T postgres pg_dump -U olel olel | gzip > /opt/olel/backups/olel_$(date +%F).sql.gz
# cron : 0 2 * * *  (rotation 30 jours conseillée)
```
**Restauration** :
```bash
gunzip -c backup.sql.gz | docker compose exec -T postgres psql -U olel olel
```
**Monitoring** : logs via `docker compose logs`, les échecs de notifications sont persistés en base (`notification_failures`, Dead Letter Queue). Pour aller plus loin : Grafana/Loki ou Uptime Kuma sur le VPS.

**PRA/PCA** : sauvegardes off-site (stockage Hostinger ou S3), `docker compose` reproductible pour redéploiement rapide, sessions bot persistées dans Redis (survivent aux redémarrages).

---

## 7. Tests post-déploiement (recette)

1. `https://api.olel.sn/api/docs` (Swagger désactivé en prod — vérifier 404 = normal).
2. Dashboard `https://app.olel.sn` → connexion (compte préfet) → onglets carte / alertes / diffusion fonctionnels.
3. App mobile `https://m.olel.sn` → connexion OTP → signalement → apparaît dans le dashboard.
4. Sentinelle → formations (quiz + badge) + missions assignées.
5. WhatsApp : envoyer un message au numéro Meta → le bot répond (menu multilingue).

**Comptes de démo (après seed)** : voir `DEMARRAGE.md`. Super admin `+221700000000`, préfet `+221700000001`, sentinelle `+221700000010`, citoyen `+221700000020`. En production, changer les mots de passe (`SEED_*_PASSWORD`) ou désactiver le seed.

---

## 8. Récapitulatif des chemins de build vérifiés

| App | Commande | Statut |
|-----|----------|--------|
| backend | `tsc --noEmit` / `nest build` | ✅ |
| bot | `tsc -p tsconfig.json` | ✅ |
| @olel/ui | `tsup` | ✅ |
| dashboard | `next build` (13 pages) | ✅ |
| mobile (web) | `next build` | ✅ |
| mobile (Capacitor) | `CAPACITOR=1 next build` → `out/` | ✅ |
