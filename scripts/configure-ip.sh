#!/bin/bash
# Configure OLEL pour un accès direct par IP (sans domaine ni HTTPS)
# Usage : ./scripts/configure-ip.sh <IP_PUBLIQUE_DU_VPS>
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[OLEL]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERREUR]${NC} $1"; }

IP="$1"
if [ -z "$IP" ]; then
  # Détection auto de l'IP publique
  IP=$(curl -s https://api.ipify.org 2>/dev/null || echo "")
  if [ -z "$IP" ]; then
    err "Impossible de détecter l'IP. Usage : ./scripts/configure-ip.sh <IP>"
    exit 1
  fi
  warn "IP détectée automatiquement : $IP"
fi

if [ ! -f ".env" ]; then
  err ".env introuvable — lancez d'abord ./scripts/setup-prod.sh"
  exit 1
fi

log "Configuration pour accès par IP : $IP"

# Supprimer les anciennes définitions (toutes occurrences) puis réécrire proprement
strip() { sed -i "/^$1=/d" .env; }
strip NEXT_PUBLIC_API_URL
strip NEXT_PUBLIC_WS_URL
strip ALLOWED_ORIGINS
strip WS_PUBLIC_ORIGIN

cat >> .env << EOF

# ── Accès par IP (configuré par configure-ip.sh) ──────────────────────────────
NEXT_PUBLIC_API_URL=http://${IP}:4000/api/v1
NEXT_PUBLIC_WS_URL=ws://${IP}:4000
ALLOWED_ORIGINS=http://${IP}:3000,http://${IP}:3001,http://localhost:3000,http://localhost:3001
WS_PUBLIC_ORIGIN=ws://${IP}:4000
EOF

log ".env mis à jour ✓"
echo ""
log "Reconstruction des frontends (NEXT_PUBLIC_* baked au build)..."
docker compose build --no-cache dashboard mobile

log "Redémarrage de toute la stack..."
docker compose up -d

echo ""
log "Attente démarrage backend..."
sleep 8

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  OLEL accessible aux adresses :"
echo "  • Dashboard  → http://${IP}:3000"
echo "  • Mobile PWA → http://${IP}:3001"
echo "  • API        → http://${IP}:4000/api/v1"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
log "Test CORS depuis l'origine du dashboard..."
RESULT=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "http://${IP}:4000/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -H "Origin: http://${IP}:3000" \
  -d '{"phone":"+221700000001","password":"OlelAdmin2024!"}' 2>/dev/null || echo "000")

if [ "$RESULT" = "200" ] || [ "$RESULT" = "201" ]; then
  log "✅ CORS OK — login fonctionnel (HTTP $RESULT)"
  echo ""
  log "Connectez-vous sur http://${IP}:3000 avec :"
  echo "    Téléphone : +221700000001"
  echo "    Mot de passe : OlelAdmin2024!"
else
  warn "Réponse login : HTTP $RESULT — vérifiez les logs : docker compose logs backend"
fi
echo ""
