#!/bin/bash
# Active le stack de monitoring OLEL (Prometheus + Grafana)
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[OLEL]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║     OLEL — Démarrage Monitoring                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Prometheus + Grafana ────────────────────────────────────────────────────
log "Démarrage Prometheus + Grafana..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile monitoring up -d

log "Attente Grafana..."
ATTEMPTS=0
until curl -sf http://localhost:3003/api/health > /dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS+1))
  [ $ATTEMPTS -gt 30 ] && { warn "Grafana lent — vérifiez : docker compose logs grafana"; break; }
  sleep 2
done

log "Monitoring opérationnel ✓"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Monitoring (accès interne uniquement) :"
echo "  • Grafana    → http://localhost:3003"
echo "    Login : admin / OlelGrafana2024!"
echo "    ⚠️  Changez le mot de passe Grafana immédiatement !"
echo ""
echo "  • Prometheus → http://localhost:9090"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
warn "Pour accéder à Grafana depuis l'extérieur de façon sécurisée :"
echo "  ssh -L 3003:localhost:3003 olel@<IP_DU_VPS>"
echo "  Puis ouvrez http://localhost:3003 dans votre navigateur."
echo ""
log "Étape suivante : configurer les backups"
echo "  → ./scripts/setup-backup.sh"
echo ""
