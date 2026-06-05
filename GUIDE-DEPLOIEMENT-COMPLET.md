# OLEL — Guide de Déploiement Complet Étape par Étape

> Plateforme d'alerte précoce multi-risques — Région de Matam, Sénégal

---

## Prérequis avant de commencer

| Requis | Détail |
|--------|--------|
| VPS Ubuntu 22.04+ | Min. 2 vCPU / 4 GB RAM / 40 GB SSD |
| Nom de domaine | Ex: `olel.sn` configuré chez votre registrar |
| Compte Meta Business | Pour WhatsApp Cloud API |
| Compte Africa's Talking | Pour SMS, USSD, IVR |
| Compte Sentry (optionnel) | Pour le suivi d'erreurs |

---

## ÉTAPE 1 — Préparer le VPS

```bash
# Se connecter au VPS
ssh root@<IP_DU_VPS>

# Installer Docker
curl -fsSL https://get.docker.com | sh
apt install docker-compose-plugin -y
systemctl enable docker

# Créer un utilisateur dédié
adduser olel
usermod -aG docker olel
su - olel

# Cloner le projet
git clone https://github.com/bocoumaboubakr-ops/OLEL.git /opt/olel
cd /opt/olel
git checkout claude/gracious-ritchie-ZLtdg
```

---

## ÉTAPE 2 — Configurer les DNS

Dans le panneau de votre registrar de domaine, ajoutez ces enregistrements **A** :

| Type | Nom | Valeur |
|------|-----|--------|
| A | `olel.sn` | IP de votre VPS |
| A | `api.olel.sn` | IP de votre VPS |
| A | `dashboard.olel.sn` | IP de votre VPS |
| A | `mobile.olel.sn` | IP de votre VPS |
| A | `bot.olel.sn` | IP de votre VPS |

> ⏱ La propagation DNS prend 5 à 30 minutes. Vérifiez avec : `host api.olel.sn`

---

## ÉTAPE 3 — Lancer la configuration guidée

```bash
cd /opt/olel
./scripts/setup-prod.sh
```

Ce script va :
1. Vérifier Docker et les prérequis
2. Générer des secrets cryptographiques forts
3. Vous demander les credentials WhatsApp et Africa's Talking
4. Créer le fichier `.env`
5. Démarrer toute la stack Docker

---

## ÉTAPE 4 — Activer HTTPS

```bash
./scripts/setup-nginx.sh
```

Ce script va :
1. Vérifier que les DNS pointent vers le serveur
2. Obtenir les certificats Let's Encrypt pour tous les sous-domaines
3. Démarrer Nginx avec HTTPS
4. Configurer le renouvellement automatique (cron)

---

## ÉTAPE 5 — Activer le monitoring

```bash
./scripts/setup-monitoring.sh
```

- **Grafana** : `http://localhost:3003` (login: `admin` / `OlelGrafana2024!`)
  - **⚠️ Changez le mot de passe immédiatement !**
  - Accès sécurisé depuis l'extérieur : `ssh -L 3003:localhost:3003 olel@<IP_DU_VPS>`
- **Prometheus** : `http://localhost:9090`

---

## ÉTAPE 6 — Configurer les backups

```bash
./scripts/setup-backup.sh
```

- Backup PostgreSQL quotidien à 2h00
- Rétention 7 jours localement
- Option upload S3/compatible (OVH Object Storage, AWS S3, etc.)

---

## ÉTAPE 7 — Configurer WhatsApp Cloud API

1. Aller sur [developers.facebook.com](https://developers.facebook.com)
2. Créer une app → Type : **Business**
3. Ajouter le produit **WhatsApp**
4. Dans **WhatsApp → Configuration** :
   - **URL du webhook** : `https://bot.olel.sn/webhook/whatsapp`
   - **Token de vérification** : valeur de `WHATSAPP_VERIFY_TOKEN` dans votre `.env`
   - Cliquer **Vérifier et enregistrer**
5. S'abonner à l'événement : `messages`
6. Copier dans `.env` :
   - `WHATSAPP_TOKEN` → Token d'accès permanent (dans API Setup)
   - `WHATSAPP_PHONE_ID` → Phone number ID
   - `WHATSAPP_APP_SECRET` → App Secret (dans Paramètres → Basic)

```bash
# Après avoir mis à jour .env, redémarrer le bot
docker compose restart bot
```

---

## ÉTAPE 8 — Configurer Africa's Talking (SMS + USSD + IVR)

### SMS
1. Compte Africa's Talking → **SMS** → Activer l'expéditeur
2. Mettre dans `.env` :
   - `AFRICAS_TALKING_KEY` → votre clé API prod
   - `AFRICAS_TALKING_USER` → votre username

### USSD
1. Africa's Talking → **USSD** → Créer un service
2. **URL callback** : `https://api.olel.sn/api/v1/ussd/session`
3. Demander un code USSD (ex: `*384*4321#`)

### IVR (appels vocaux)
1. Africa's Talking → **Voice** → Créer une app
2. **Callback URL** : `https://api.olel.sn/api/v1/ivr/callback`

```bash
# Redémarrer le backend après modification des credentials
docker compose restart backend
```

---

## ÉTAPE 9 — Configurer Sentry (optionnel mais recommandé)

1. Créer un compte sur [sentry.io](https://sentry.io)
2. Créer **3 projets** : `olel-backend` (Node.js), `olel-dashboard` (Next.js), `olel-mobile` (Next.js)
3. Copier les DSN dans `.env` :
   ```
   SENTRY_DSN=https://xxxx@oXXXX.ingest.sentry.io/YYYY
   NEXT_PUBLIC_SENTRY_DSN=https://xxxx@oXXXX.ingest.sentry.io/ZZZZ
   ```
4. Redémarrer :
   ```bash
   docker compose restart
   ```

---

## ÉTAPE 10 — Changer les mots de passe par défaut

> ⚠️ **OBLIGATOIRE** avant d'exposer le système à des utilisateurs réels

Se connecter via l'API et changer les mots de passe :

```bash
# 1. Login admin
curl -s -X POST https://api.olel.sn/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+221700000001","password":"OlelAdmin2024!"}' | jq .

# 2. Copier l'accessToken, puis changer le mot de passe via le dashboard
# https://dashboard.olel.sn → Paramètres → Changer mot de passe
```

Comptes à changer :
| Rôle | Téléphone | Mot de passe défaut |
|------|-----------|---------------------|
| Admin | +221700000001 | `OlelAdmin2024!` |
| Préfet Matam | +221700000002 | `Prefet2024!` |
| Sentinelle | +221700000003 | `Sent2024!` |

---

## ÉTAPE 11 — Vérification finale

```bash
./scripts/health-check.sh
```

Résultat attendu : tous les services `✓ OK`

---

## Commandes de maintenance

```bash
# Voir les logs en direct
docker compose logs -f backend

# Redémarrer un service
docker compose restart backend

# Mise à jour du code
git pull origin claude/gracious-ritchie-ZLtdg
docker compose down
docker compose up -d --build
./scripts/health-check.sh

# Backup manuel immédiat
./scripts/backup-db.sh

# Restaurer un backup
gunzip -c /opt/olel-backups/olel-YYYY-MM-DD.sql.gz | \
  docker compose exec -T postgres psql -U olel olel
```

---

## Cloudflare WAF (recommandé)

1. Ajouter le domaine `olel.sn` dans Cloudflare
2. Changer les nameservers chez votre registrar
3. Dans Cloudflare → **SSL/TLS** → **Full (strict)**
4. Dans **Security** → **WAF** → Activer les règles OWASP
5. Dans **Rules** → Créer une règle pour bloquer les pays non-cibles si souhaité

---

## URLs de production

| Service | URL |
|---------|-----|
| Dashboard admin | https://dashboard.olel.sn |
| App mobile citoyens | https://mobile.olel.sn |
| API REST | https://api.olel.sn/api/v1 |
| Documentation API | https://api.olel.sn/api-docs |
| Webhook WhatsApp | https://bot.olel.sn/webhook/whatsapp |
