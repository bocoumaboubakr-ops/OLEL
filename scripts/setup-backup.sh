#!/usr/bin/env bash
# OLEL — Mise en place des sauvegardes sur l'HÔTE (audit F31)
#
# 1. Crée /etc/olel/backup.env (droits 600) si absent, à compléter :
#      BACKUP_PASSPHRASE_FILE=/etc/olel/backup.pass   (phrase conservée AUSSI hors serveur)
#      RCLONE_REMOTE=<distant>:olel-backups            (copie hors serveur, recommandé)
#      BACKUP_ALERT_CMD="mail -s 'OLEL backup' astreinte@example.org"
#      BACKUP_DIR=/opt/olel/backups  RETENTION_DAYS=14
# 2. Installe la crontab : sauvegarde toutes les 6 h (RPO proposé, décision D9).
# 3. Lance une sauvegarde de contrôle puis vérifie le lot produit (--verify-only).
# Aucune sauvegarde ne passe par un conteneur monté sur le socket Docker.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=/etc/olel/backup.env

if [ ! -f "$ENV_FILE" ]; then
  install -d -m 700 /etc/olel
  umask 077
  head -c 48 /dev/urandom | base64 > /etc/olel/backup.pass
  cat > "$ENV_FILE" <<CONF
BACKUP_PASSPHRASE_FILE=/etc/olel/backup.pass
BACKUP_DIR=/opt/olel/backups
RETENTION_DAYS=14
# RCLONE_REMOTE=s3-olel:olel-backups
# BACKUP_ALERT_CMD="mail -s 'Sauvegarde OLEL en échec' astreinte@example.org"
CONF
  echo "Créé : $ENV_FILE et /etc/olel/backup.pass"
  echo ">>> COPIEZ /etc/olel/backup.pass HORS DU SERVEUR (coffre-fort) : sans elle, aucune restauration possible."
fi

CRON="0 */6 * * * cd $(pwd) && set -a && . $ENV_FILE && set +a && ./scripts/backup.sh >> /var/log/olel-backup.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'scripts/backup' ; echo "$CRON" ) | crontab -
echo "Crontab installée (toutes les 6 h)."

set -a; . "$ENV_FILE"; set +a
set +e; ./scripts/backup.sh; rc=$?; set -e
LOT=$(ls -t "${BACKUP_DIR:-/opt/olel/backups}"/olel-*.tar.enc | head -1)
./scripts/restore.sh "$LOT" --verify-only
[ $rc -eq 2 ] && echo "ATTENTION : pas de copie hors serveur (RCLONE_REMOTE)." || true
echo "Pensez à l'exercice de restauration trimestriel (docs/AUDIT_REMEDIATION.md)."
