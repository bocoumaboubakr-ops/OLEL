#!/bin/bash
# Script de configuration guidée OLEL — Production
# Usage : ./scripts/setup-prod.sh
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[OLEL]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERREUR]${NC} $1"; }

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║     OLEL — Configuration Production                  ║"
echo "║     Plateforme d'alerte précoce — Région Matam       ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Vérifications préalables ────────────────────────────────────────────────
log "Vérification des prérequis..."

if ! command -v docker &>/dev/null; then
  err "Docker non installé. Installez-le avec : curl -fsSL https://get.docker.com | sh"
  exit 1
fi

if ! docker compose version &>/dev/null; then
  err "Docker Compose v2 non disponible. Installez-le avec : apt install docker-compose-plugin"
  exit 1
fi

if ! command -v openssl &>/dev/null; then
  err "openssl requis. Installez-le avec : apt install openssl"
  exit 1
fi

log "Prérequis OK ✓"
echo ""

# ── Génération des secrets ──────────────────────────────────────────────────
if [ -f ".env" ]; then
  warn ".env existe déjà. Voulez-vous le régénérer ? (o/N)"
  read -r REGEN
  if [[ "$REGEN" != "o" && "$REGEN" != "O" ]]; then
    log "Conservation du .env existant."
    SKIP_ENV=true
  fi
fi

if [ "$SKIP_ENV" != "true" ]; then
  log "Génération des secrets cryptographiques..."

  JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
  JWT_REFRESH_SECRET=$(openssl rand -base64 48 | tr -d '\n')
  TOTP_KEY=$(openssl rand -hex 32)
  POSTGRES_PWD=$(openssl rand -base64 24 | tr -d '\n/+=' | head -c 24)
  BOT_KEY=$(openssl rand -base64 32 | tr -d '\n' | tr -dc 'a-zA-Z0-9' | head -c 40)

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Entrez les informations de votre déploiement :"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  read -rp "Domaine principal (ex: olel.sn) : " DOMAIN
  DOMAIN=${DOMAIN:-olel.sn}

  read -rp "Token WhatsApp Meta Cloud API (laisser vide pour dev) : " WA_TOKEN
  read -rp "Phone ID WhatsApp Business : " WA_PHONE_ID
  read -rp "App Secret WhatsApp (HMAC) : " WA_APP_SECRET
  read -rp "Token de vérification webhook WhatsApp (ex: olel_prod_2024) : " WA_VERIFY

  read -rp "Clé Africa's Talking (sandbox ou clé prod) : " AT_KEY
  AT_KEY=${AT_KEY:-sandbox}
  read -rp "Username Africa's Talking : " AT_USER
  AT_USER=${AT_USER:-sandbox}

  read -rp "DSN Sentry backend (laisser vide pour désactiver) : " SENTRY_DSN_BACKEND
  read -rp "DSN Sentry frontend (laisser vide pour désactiver) : " SENTRY_DSN_FRONTEND

  read -rp "Token Mapbox (optionnel) : " MAPBOX_TOKEN

  cat > .env << ENVEOF
# ── OLEL Production — généré le $(date) ─────────────────────────────────────

# Base de données
DATABASE_URL=postgresql://olel:${POSTGRES_PWD}@postgres:5432/olel
POSTGRES_PASSWORD=${POSTGRES_PWD}

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# JWT
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}

# TOTP
TOTP_ENCRYPTION_KEY=${TOTP_KEY}

# Backend
PORT=4000
NODE_ENV=production
ALLOWED_ORIGINS=https://${DOMAIN},https://dashboard.${DOMAIN},https://mobile.${DOMAIN}
WS_PUBLIC_ORIGIN=wss://api.${DOMAIN}

# WhatsApp
WHATSAPP_TOKEN=${WA_TOKEN}
WHATSAPP_PHONE_ID=${WA_PHONE_ID}
WHATSAPP_APP_SECRET=${WA_APP_SECRET}
WHATSAPP_VERIFY_TOKEN=${WA_VERIFY:-olel_webhook_$(openssl rand -hex 8)}

# Africa's Talking
AFRICAS_TALKING_KEY=${AT_KEY}
AFRICAS_TALKING_USER=${AT_USER}

# Bot
BOT_API_KEY=${BOT_KEY}
BOT_PORT=3002

# URLs Next.js (côté navigateur)
NEXT_PUBLIC_API_URL=https://api.${DOMAIN}/api/v1
NEXT_PUBLIC_WS_URL=wss://api.${DOMAIN}

# Sentry (optionnel)
SENTRY_DSN=${SENTRY_DSN_BACKEND}
NEXT_PUBLIC_SENTRY_DSN=${SENTRY_DSN_FRONTEND}

# Mapbox (optionnel)
MAPBOX_TOKEN=${MAPBOX_TOKEN}

# Version
APP_VERSION=1.0.0
NEXT_PUBLIC_APP_VERSION=1.0.0
ENVEOF

  log ".env créé ✓"
  echo ""
  warn "⚠️  CONSERVEZ CES SECRETS EN LIEU SÛR — ils ne seront pas régénérés automatiquement."
  echo ""
fi

# ── Démarrage des services ──────────────────────────────────────────────────
log "Démarrage de la stack Docker..."
docker compose pull postgres redis
docker compose up -d postgres redis

log "Attente démarrage PostgreSQL..."
until docker compose exec postgres pg_isready -U olel -q; do
  sleep 2
done
log "PostgreSQL prêt ✓"

log "Démarrage des services applicatifs..."
docker compose up -d --build

log "Attente démarrage backend (peut prendre 2-3 minutes)..."
ATTEMPTS=0
until curl -sf http://localhost:4000/api/v1/health/live > /dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS+1))
  if [ $ATTEMPTS -gt 40 ]; then
    err "Backend non disponible après 80s. Consultez les logs : docker compose logs backend"
    exit 1
  fi
  sleep 2
done

log "Stack OLEL démarrée ✓"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Services disponibles :"
echo "  • API         → http://localhost:4000/api/v1"
echo "  • Swagger     → http://localhost:4000/api-docs"
echo "  • Dashboard   → http://localhost:3000"
echo "  • Mobile PWA  → http://localhost:3001"
echo "  • Bot webhook → http://localhost:3002"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
log "Étape suivante : configurer Nginx et HTTPS"
echo "  → ./scripts/setup-nginx.sh"
echo ""
