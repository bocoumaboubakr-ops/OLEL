#!/bin/bash
# Configure Nginx + Let's Encrypt (Certbot) pour OLEL
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[OLEL]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERREUR]${NC} $1"; }

if [ ! -f ".env" ]; then
  err ".env introuvable — lancez d'abord ./scripts/setup-prod.sh"
  exit 1
fi

# Charger les variables du .env
source .env 2>/dev/null || true

echo ""
read -rp "Domaine principal (ex: olel.sn) : " DOMAIN
read -rp "Email Let's Encrypt : " LE_EMAIL

echo ""
log "Vérification DNS pour api.${DOMAIN}..."
if ! host "api.${DOMAIN}" > /dev/null 2>&1; then
  warn "DNS api.${DOMAIN} non résolu. Assurez-vous que les enregistrements DNS pointent vers ce serveur :"
  echo ""
  SERVER_IP=$(curl -s https://api.ipify.org 2>/dev/null || echo "IP_DU_VPS")
  echo "  Type   Nom                     Valeur"
  echo "  A      ${DOMAIN}               ${SERVER_IP}"
  echo "  A      api.${DOMAIN}           ${SERVER_IP}"
  echo "  A      dashboard.${DOMAIN}     ${SERVER_IP}"
  echo "  A      mobile.${DOMAIN}        ${SERVER_IP}"
  echo "  A      bot.${DOMAIN}           ${SERVER_IP}"
  echo ""
  read -rp "Continuer quand même ? (o/N) : " CONTINUE
  [[ "$CONTINUE" != "o" && "$CONTINUE" != "O" ]] && exit 0
fi

# ── Créer les répertoires SSL ────────────────────────────────────────────────
mkdir -p nginx/certs nginx/logs

# ── Obtenir les certificats Let's Encrypt ──────────────────────────────────
log "Obtention des certificats TLS via Certbot..."

# Arrêt temporaire de Nginx si actif (port 80 doit être libre)
docker compose stop nginx 2>/dev/null || true

docker run --rm \
  -v "$(pwd)/nginx/certs:/etc/letsencrypt" \
  -p 80:80 \
  certbot/certbot certonly \
  --standalone \
  --non-interactive \
  --agree-tos \
  --email "${LE_EMAIL}" \
  -d "${DOMAIN}" \
  -d "api.${DOMAIN}" \
  -d "dashboard.${DOMAIN}" \
  -d "mobile.${DOMAIN}" \
  -d "bot.${DOMAIN}"

log "Certificats obtenus ✓"

# ── Mettre à jour nginx.conf avec le vrai domaine ──────────────────────────
log "Mise à jour de nginx/nginx.conf avec le domaine ${DOMAIN}..."

sed -i "s/olel\.sn/${DOMAIN}/g" nginx/nginx.conf

# ── Démarrer Nginx ────────────────────────────────────────────────────────
log "Démarrage Nginx avec HTTPS..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d nginx

sleep 3

if curl -sf "https://api.${DOMAIN}/api/v1/health/live" > /dev/null 2>&1; then
  log "HTTPS opérationnel ✓"
else
  warn "Nginx démarré mais HTTPS non confirmé. Vérifiez : docker compose logs nginx"
fi

# ── Renouvellement automatique ────────────────────────────────────────────
log "Configuration du renouvellement automatique..."
CRON_CMD="0 3 * * * cd $(pwd) && docker run --rm -v $(pwd)/nginx/certs:/etc/letsencrypt certbot/certbot renew --quiet && docker compose exec nginx nginx -s reload"

(crontab -l 2>/dev/null | grep -v "certbot/certbot renew"; echo "$CRON_CMD") | crontab -

log "Renouvellement automatique configuré (cron 3h du matin) ✓"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  URLs de production :"
echo "  • API         → https://api.${DOMAIN}/api/v1"
echo "  • Swagger     → https://api.${DOMAIN}/api-docs"
echo "  • Dashboard   → https://dashboard.${DOMAIN}"
echo "  • Mobile PWA  → https://mobile.${DOMAIN}"
echo "  • Bot webhook → https://bot.${DOMAIN}/webhook/whatsapp"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
log "Étape suivante : configurer le webhook WhatsApp"
echo "  1. Meta Developer Console → votre app → WhatsApp → Configuration"
echo "  2. URL webhook : https://bot.${DOMAIN}/webhook/whatsapp"
echo "  3. Token de vérification : valeur de WHATSAPP_VERIFY_TOKEN dans .env"
echo ""
log "Étape suivante : activer le monitoring"
echo "  → ./scripts/setup-monitoring.sh"
echo ""
