#!/bin/bash
# Bootstrap HTTPS olel.app — Let's Encrypt + Nginx
# Idempotent : peut être relancé sans risque
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[OLEL]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERREUR]${NC} $1"; exit 1; }

DOMAIN="${DOMAIN:-olel.app}"
SUBS="api app m bot www"   # sous-domaines à certifier (en plus du root)
EMAIL="${LE_EMAIL:-}"

[ "$(id -u)" -eq 0 ] || err "À lancer en root (sudo)"
[ -d "/opt/olel" ] || err "/opt/olel introuvable"
cd /opt/olel

# ── 0. Pré-requis ─────────────────────────────────────────────────────────
log "Vérification des dépendances…"
command -v docker >/dev/null || err "Docker requis"
command -v certbot >/dev/null || { log "Installation Certbot…"; apt-get update -q && apt-get install -y -q certbot; }

# ── 1. Email Let's Encrypt ────────────────────────────────────────────────
if [ -z "$EMAIL" ]; then
  read -rp "Email pour Let's Encrypt (alertes expiration) : " EMAIL
  [ -z "$EMAIL" ] && err "Email obligatoire"
fi

# ── 2. Vérification DNS ───────────────────────────────────────────────────
SERVER_IP=$(curl -fsS https://api.ipify.org)
log "IP publique du VPS : $SERVER_IP"

DNS_OK=true
for SUB in "" $SUBS; do
  HOST="${SUB:+$SUB.}${DOMAIN}"
  RESOLVED=$(dig +short A "$HOST" @8.8.8.8 | tail -1)
  if [ "$RESOLVED" = "$SERVER_IP" ]; then
    echo "  ✅ $HOST → $RESOLVED"
  else
    echo "  ❌ $HOST → '${RESOLVED:-non résolu}' (attendu : $SERVER_IP)"
    DNS_OK=false
  fi
done

if [ "$DNS_OK" != "true" ]; then
  warn "Configurez d'abord ces enregistrements DNS chez BookMyName :"
  cat <<EOF

  Type   Nom            Valeur
  A      @              $SERVER_IP   ← olel.app
  A      api            $SERVER_IP
  A      app            $SERVER_IP
  A      m              $SERVER_IP
  A      bot            $SERVER_IP
  A      www            $SERVER_IP

  TTL    : 300 (laisser défaut)
  Propagation : 5 à 30 min en général

EOF
  read -rp "Réessayer la vérification DNS ? (o/N) : " RETRY
  [[ "$RETRY" =~ ^[oO]$ ]] && exec "$0" || exit 1
fi

# ── 3. Libération du port 80 (Nginx Docker doit céder pour Certbot standalone) ──
log "Arrêt temporaire du Nginx Docker (port 80)…"
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop nginx 2>/dev/null || true

# Si un Nginx hôte tourne, le stopper aussi
systemctl stop nginx 2>/dev/null || true

# ── 4. Obtenir / renouveler les certificats ──────────────────────────────
log "Demande de certificat Let's Encrypt (peut prendre 20 s)…"
DOMAIN_ARGS="-d $DOMAIN"
for SUB in $SUBS; do DOMAIN_ARGS="$DOMAIN_ARGS -d ${SUB}.${DOMAIN}"; done

certbot certonly --standalone --non-interactive --agree-tos \
  --email "$EMAIL" \
  --preferred-challenges http \
  $DOMAIN_ARGS

[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ] \
  || err "Le certificat n'a pas été créé. Vérifiez les logs Certbot."

log "Certificat OK : /etc/letsencrypt/live/${DOMAIN}/"

# ── 5. Reconfigurer le .env pour HTTPS ────────────────────────────────────
log "Mise à jour du .env (URLs HTTPS)…"
cp .env .env.bak.$(date +%s)
sed -i '/^NEXT_PUBLIC_API_URL=/d; /^NEXT_PUBLIC_WS_URL=/d; /^ALLOWED_ORIGINS=/d; /^WS_PUBLIC_ORIGIN=/d' .env
cat >> .env <<EOF

# ── HTTPS olel.app (généré par setup-https.sh) ────────────────────────────
NEXT_PUBLIC_API_URL=https://api.${DOMAIN}/api/v1
NEXT_PUBLIC_WS_URL=wss://api.${DOMAIN}
ALLOWED_ORIGINS=https://${DOMAIN},https://www.${DOMAIN},https://app.${DOMAIN},https://m.${DOMAIN}
WS_PUBLIC_ORIGIN=wss://api.${DOMAIN}
EOF

# ── 6. Rebuild les apps frontend (URL bakée dans le bundle Next.js) ──────
log "Rebuild dashboard + mobile avec les nouvelles URLs HTTPS…"
docker compose build dashboard mobile

# ── 7. Démarrer toute la stack HTTPS ──────────────────────────────────────
log "Démarrage de la stack complète…"
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
sleep 15

# ── 8. Vérification ───────────────────────────────────────────────────────
log "Tests de bout en bout…"
for HOST in "${DOMAIN}" "api.${DOMAIN}" "m.${DOMAIN}" "bot.${DOMAIN}"; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/" --max-time 8 || echo "000")
  if [[ "$CODE" =~ ^(200|301|302|404)$ ]]; then
    echo "  ✅ https://$HOST → HTTP $CODE"
  else
    echo "  ⚠️  https://$HOST → HTTP $CODE"
  fi
done

# ── 9. Pare-feu UFW (si présent) ─────────────────────────────────────────
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  log "Ouverture des ports 80/443 dans UFW…"
  ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null
fi

cat <<EOF

╔══════════════════════════════════════════════════════════════╗
║  ✅ HTTPS OLEL OPERATIONNEL                                    ║
╠══════════════════════════════════════════════════════════════╣
║  Dashboard autorités : https://${DOMAIN}
║  Mobile citoyen      : https://m.${DOMAIN}
║  API backend         : https://api.${DOMAIN}
║  Webhook WhatsApp    : https://bot.${DOMAIN}/webhook/whatsapp
║                                                                ║
║  → Mettez à jour le webhook Meta avec la nouvelle URL HTTPS    ║
║  → Renouvellement auto via le conteneur 'certbot' (toutes 12h)║
╚══════════════════════════════════════════════════════════════╝

EOF
