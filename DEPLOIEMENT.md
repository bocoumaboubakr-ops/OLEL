# OLEL – Guide de Déploiement Production

## Prérequis

- VPS Ubuntu 22.04+ (min. 2 vCPU / 4 GB RAM / 40 GB SSD)
- Docker Engine 24+ et Docker Compose v2
- Domaine configuré (ex: `olel.sn`) avec enregistrements DNS
- Compte Meta Business (WhatsApp Cloud API)
- Compte Africa's Talking (SMS / USSD / IVR)

---

## 1. Installation initiale

```bash
git clone https://github.com/bocoumaboubakr-ops/OLEL.git /opt/olel
cd /opt/olel

# Générer des secrets forts
./scripts/generate-secrets.sh > /tmp/new-secrets.txt
cat /tmp/new-secrets.txt

# Copier et remplir le .env
cp .env.example .env
nano .env   # Remplir avec les secrets générés + tokens WhatsApp + Africa's Talking
```

## 2. Variables obligatoires à remplir dans `.env`

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Secret JWT ≥ 32 chars |
| `JWT_REFRESH_SECRET` | Secret refresh ≥ 32 chars |
| `TOTP_ENCRYPTION_KEY` | Clé TOTP ≥ 32 chars |
| `POSTGRES_PASSWORD` | Mot de passe BD fort |
| `BOT_API_KEY` | Clé interne bot ≥ 24 chars |
| `WHATSAPP_TOKEN` | Token Meta Cloud API |
| `WHATSAPP_PHONE_ID` | ID numéro WhatsApp Business |
| `WHATSAPP_APP_SECRET` | Secret Meta App (HMAC webhook) |
| `AFRICAS_TALKING_KEY` | Clé Africa's Talking (prod) |
| `AFRICAS_TALKING_USER` | Username Africa's Talking |

## 3. Démarrage des services

```bash
# Stack principale
docker compose up -d

# Vérifier la santé
./scripts/health-check.sh

# Voir les logs
docker compose logs -f backend
```

## 4. Démarrage avec monitoring

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile monitoring up -d

# Grafana : http://localhost:3003 (admin / OlelGrafana2024!)
# Prometheus : http://localhost:9090
```

## 5. Configuration du webhook WhatsApp

1. Dans Meta Developer Console → votre app → WhatsApp → Configuration
2. URL du webhook : `https://bot.olel.sn/webhook/whatsapp`
3. Token de vérification : valeur de `WHATSAPP_VERIFY_TOKEN` dans `.env`
4. S'abonner aux événements : `messages`

## 6. Configuration USSD (Africa's Talking)

1. Compte Africa's Talking → USSD → Créer un service
2. URL callback : `https://api.olel.sn/api/v1/ussd/session`
3. Code USSD : à obtenir auprès d'Africa's Talking (ex: `*384*4321#`)

## 7. Backup automatique

```bash
# Test manuel
./scripts/backup-db.sh

# Configurer le cron
crontab -e
# Ajouter : 0 2 * * * /opt/olel/scripts/backup-db.sh >> /var/log/olel-backup.log 2>&1
```

## 8. Reverse proxy Nginx

```bash
# Ajouter Nginx au stack prod
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d nginx

# Pour HTTPS (Let's Encrypt via Certbot) :
docker run --rm -v $(pwd)/nginx/certs:/etc/letsencrypt certbot/certbot certonly \
  --standalone -d olel.sn -d api.olel.sn -d mobile.olel.sn -d bot.olel.sn \
  --email admin@olel.sn --agree-tos
```

## 9. Mise à jour

```bash
cd /opt/olel
git pull origin main
docker compose down
docker compose up -d --build
./scripts/health-check.sh
```

## 10. URLs d'accès

| Service | URL locale | URL prod |
|---------|-----------|---------|
| Dashboard | http://localhost:3000 | https://dashboard.olel.sn |
| Mobile PWA | http://localhost:3001 | https://mobile.olel.sn |
| API | http://localhost:4000 | https://api.olel.sn |
| Swagger | http://localhost:4000/api-docs | https://api.olel.sn/api-docs |
| Bot webhook | http://localhost:3002 | https://bot.olel.sn |
| Grafana | http://localhost:3003 | (interne seulement) |
| Adminer | `docker compose --profile dev up adminer` | (dev seulement) |

## 11. Comptes par défaut (seed)

> ⚠️ Changer les mots de passe immédiatement après le premier déploiement !

| Rôle | Téléphone | Mot de passe par défaut |
|------|-----------|------------------------|
| Admin | +221700000001 | `OlelAdmin2024!` |
| Préfet Matam | +221700000002 | `Prefet2024!` |
| Sentinelle | +221700000003 | `Sent2024!` |

## 12. Types de risques gérés

| Code | Risque |
|------|--------|
| `INONDATION` | Crue, montée des eaux |
| `SECHERESSE` | Déficit hydrique prolongé |
| `INCENDIE` | Feu de brousse / forêt / habitation |
| `TEMPETE` | Vent violent, tempête de sable |
| `EPIDEMIE` | Maladie infectieuse, épidémie |
| `LOCUSTES` | Invasion de criquets / nuisibles agricoles |
| `ACCIDENT_INDUSTRIEL` | Explosion, fuite chimique |
| `MOUVEMENT_DE_TERRAIN` | Glissement, effondrement |
| `AUTRE` | Tout autre danger |
