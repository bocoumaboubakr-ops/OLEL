#!/bin/bash
# OLEL – Backup automatique PostgreSQL
# Usage : ./scripts/backup-db.sh
# Cron  : 0 2 * * * /opt/olel/scripts/backup-db.sh >> /var/log/olel-backup.log 2>&1

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/olel/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
CONTAINER="olel-postgres"
DB_NAME="olel"
DB_USER="olel"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/olel_${TIMESTAMP}.sql.gz"

echo "[$(date)] Démarrage du backup OLEL..."

# Créer le dossier si absent
mkdir -p "${BACKUP_DIR}"

# Vérifier que le conteneur tourne
if ! docker inspect --format='{{.State.Running}}' "${CONTAINER}" 2>/dev/null | grep -q true; then
    echo "[$(date)] ERREUR : Le conteneur ${CONTAINER} n'est pas en cours d'exécution."
    exit 1
fi

# Dump compressé
docker exec "${CONTAINER}" \
    pg_dump -U "${DB_USER}" "${DB_NAME}" \
    | gzip > "${BACKUP_FILE}"

SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
echo "[$(date)] Backup créé : ${BACKUP_FILE} (${SIZE})"

# Purge des anciens backups
DELETED=$(find "${BACKUP_DIR}" -name "olel_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
if [ "${DELETED}" -gt 0 ]; then
    echo "[$(date)] ${DELETED} ancien(s) backup(s) supprimé(s) (> ${RETENTION_DAYS} jours)"
fi

# Upload vers S3/MinIO (optionnel — décommenter en prod)
# if [ -n "${S3_BUCKET:-}" ]; then
#     aws s3 cp "${BACKUP_FILE}" "s3://${S3_BUCKET}/backups/$(basename ${BACKUP_FILE})"
#     echo "[$(date)] Uploadé vers s3://${S3_BUCKET}"
# fi

echo "[$(date)] Backup terminé avec succès."
