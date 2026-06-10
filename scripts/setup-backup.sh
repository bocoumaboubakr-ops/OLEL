#!/bin/bash
# Configure les sauvegardes automatiques OLEL
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[OLEL]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║     OLEL — Configuration Backups                     ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

BACKUP_DIR="${BACKUP_DIR:-/opt/olel/backups}"
mkdir -p "$BACKUP_DIR"

# ── Test de backup immédiat ─────────────────────────────────────────────────
log "Test de backup base de données..."
./scripts/backup-db.sh

if ls "${BACKUP_DIR}"/olel_*.sql.gz &>/dev/null; then
  LATEST=$(ls -t "${BACKUP_DIR}"/olel_*.sql.gz | head -1)
  SIZE=$(du -sh "$LATEST" | cut -f1)
  log "Backup OK ✓ — ${LATEST} (${SIZE})"
else
  warn "Aucun fichier backup trouvé dans ${BACKUP_DIR}"
fi

# ── Cron quotidien 2h du matin ──────────────────────────────────────────────
CRON_CMD="0 2 * * * cd $(pwd) && ./scripts/backup-db.sh >> /var/log/olel-backup.log 2>&1"
(crontab -l 2>/dev/null | grep -v "backup-db.sh"; echo "$CRON_CMD") | crontab -

log "Cron backup configuré (tous les jours à 2h00) ✓"

# ── Option S3 ────────────────────────────────────────────────────────────────
echo ""
read -rp "Avez-vous un bucket S3/compatible pour l'archivage distant ? (o/N) : " USE_S3
if [[ "$USE_S3" == "o" || "$USE_S3" == "O" ]]; then
  read -rp "Endpoint S3 (ex: s3.amazonaws.com ou minio.example.com) : " S3_ENDPOINT
  read -rp "Bucket name : " S3_BUCKET
  read -rp "Access Key : " S3_KEY
  read -rp "Secret Key : " S3_SECRET

  # Ajouter les variables S3 au .env si pas déjà présentes
  if ! grep -q "S3_BUCKET" .env 2>/dev/null; then
    cat >> .env << S3EOF

# Backup S3
S3_ENDPOINT=${S3_ENDPOINT}
S3_BUCKET=${S3_BUCKET}
AWS_ACCESS_KEY_ID=${S3_KEY}
AWS_SECRET_ACCESS_KEY=${S3_SECRET}
S3EOF
    log "Variables S3 ajoutées au .env ✓"
  fi

  # Vérifier que awscli est disponible
  if ! command -v aws &>/dev/null; then
    log "Installation awscli..."
    apt-get install -y awscli -q
  fi

  log "Test upload S3..."
  LATEST=$(ls -t "${BACKUP_DIR}"/olel_*.sql.gz 2>/dev/null | head -1)
  if [ -n "$LATEST" ]; then
    AWS_ACCESS_KEY_ID="${S3_KEY}" AWS_SECRET_ACCESS_KEY="${S3_SECRET}" \
      aws s3 cp "$LATEST" "s3://${S3_BUCKET}/backups/" \
      --endpoint-url "https://${S3_ENDPOINT}" 2>/dev/null \
      && log "Upload S3 OK ✓" \
      || warn "Upload S3 échoué — vérifiez les credentials"
  fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Backups configurés :"
echo "  • Répertoire local : ${BACKUP_DIR}"
echo "  • Rétention        : 7 jours"
echo "  • Cron             : quotidien à 2h00"
echo "  • Logs             : /var/log/olel-backup.log"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
log "Vérification finale de la stack..."
./scripts/health-check.sh
echo ""
log "✅ OLEL est prêt pour la production !"
echo ""
echo "Étapes restantes (manuelles) :"
echo "  1. Configurer le webhook WhatsApp dans Meta Developer Console"
echo "  2. Configurer le code USSD chez Africa's Talking"
echo "  3. Changer les mots de passe par défaut (voir DEPLOIEMENT.md §11)"
echo "  4. Activer Cloudflare WAF devant le domaine (recommandé)"
echo ""
