#!/usr/bin/env bash
# OLEL — Sauvegarde cohérente base + médias (audit F30/F31)
#
# Produit un lot horodaté : base (pg_dump format custom), médias (tar),
# manifeste (comptages par table, sommes SHA-256), le tout chiffré
# (AES-256, clé hors serveur) puis copié hors du serveur si configuré.
#
# Modes :
#   BACKUP_MODE=compose (défaut, serveur) : via `docker compose exec`,
#       aucun socket Docker monté dans un conteneur.
#   BACKUP_MODE=direct : DATABASE_URL + UPLOADS_DIR (essais, exercice de restauration).
#
# Variables :
#   BACKUP_DIR            dossier local des lots (défaut /opt/olel/backups)
#   BACKUP_PASSPHRASE_FILE fichier contenant la phrase de chiffrement (OBLIGATOIRE,
#                          à conserver aussi HORS du serveur, sinon les lots sont inutilisables)
#   RETENTION_DAYS        rétention locale (défaut 14)
#   RCLONE_REMOTE         destination hors serveur rclone (ex. s3:olel-backups) — recommandé
#   BACKUP_ALERT_CMD      commande lancée en cas d'échec (ex. envoi de courriel/SMS)
#   COMPOSE_FILES         ex. "-f docker-compose.yml -f docker-compose.prod.yml"
#
# Sortie : 0 succès complet ; 1 échec ; 2 succès local SANS copie hors serveur.
set -Eeuo pipefail

BACKUP_MODE="${BACKUP_MODE:-compose}"
BACKUP_DIR="${BACKUP_DIR:-/opt/olel/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
COMPOSE_FILES="${COMPOSE_FILES:--f docker-compose.yml -f docker-compose.prod.yml}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="${BACKUP_DIR}/.work-${STAMP}"
OUT="${BACKUP_DIR}/olel-${STAMP}.tar.enc"
STATUS="${BACKUP_DIR}/last-status.json"

log() { echo "[$(date -u +%FT%TZ)] $*"; }
fail() {
  log "ÉCHEC : $*"
  printf '{"ok":false,"at":"%s","error":%s}\n' "$(date -u +%FT%TZ)" "\"${*//\"/\'}\"" > "$STATUS" || true
  [ -n "${BACKUP_ALERT_CMD:-}" ] && bash -c "$BACKUP_ALERT_CMD" <<<"Sauvegarde OLEL en échec : $*" || true
  rm -rf "$WORK"
  exit 1
}
trap 'fail "erreur ligne $LINENO"' ERR

[ -n "${BACKUP_PASSPHRASE_FILE:-}" ] && [ -s "$BACKUP_PASSPHRASE_FILE" ] || fail "BACKUP_PASSPHRASE_FILE absent ou vide"
command -v openssl >/dev/null || fail "openssl requis"
mkdir -p "$WORK" && chmod 700 "$BACKUP_DIR" "$WORK"

psql_q() {  # requête SQL → sortie brute
  if [ "$BACKUP_MODE" = compose ]; then
    # </dev/null : sinon `exec` consomme l'entrée de la boucle de comptage
    docker compose $COMPOSE_FILES exec -T postgres psql -U olel -d olel -At -c "$1" </dev/null
  else
    psql "$DATABASE_URL" -At -c "$1" </dev/null
  fi
}

log "Sauvegarde OLEL ${STAMP} (mode ${BACKUP_MODE})"

# 1. Base de données (instantané cohérent : une transaction pg_dump)
if [ "$BACKUP_MODE" = compose ]; then
  docker compose $COMPOSE_FILES exec -T postgres pg_dump -U olel -d olel -Fc -Z 6 > "$WORK/db.dump"
else
  pg_dump "$DATABASE_URL" -Fc -Z 6 -f "$WORK/db.dump"
fi
[ -s "$WORK/db.dump" ] || fail "dump vide"

# 2. Comptages par table (vérification après restauration)
psql_q "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1" \
  | while read -r t; do printf '%s\t%s\n' "$t" "$(psql_q "SELECT count(*) FROM \"$t\"")"; done > "$WORK/rowcounts.tsv"

# 3. Médias (volume persistant)
if [ "$BACKUP_MODE" = compose ]; then
  docker compose $COMPOSE_FILES exec -T backend tar -C /app/uploads -cf - . > "$WORK/media.tar"
else
  tar -C "${UPLOADS_DIR:?UPLOADS_DIR requis en mode direct}" -cf "$WORK/media.tar" .
fi
tar -tf "$WORK/media.tar" | grep -v '/$' | sort > "$WORK/media.list" || true

# 4. Manifeste + sommes de contrôle
( cd "$WORK" && sha256sum db.dump media.tar rowcounts.tsv media.list > SHA256SUMS )
cat > "$WORK/manifest.json" <<EOF
{"stamp":"${STAMP}","mode":"${BACKUP_MODE}","mediaFiles":$(wc -l < "$WORK/media.list"),"tables":$(wc -l < "$WORK/rowcounts.tsv"),"dbBytes":$(stat -c %s "$WORK/db.dump")}
EOF

# 5. Chiffrement (AES-256-CBC, PBKDF2) — un seul fichier à transporter
tar -C "$WORK" -cf - . | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:${BACKUP_PASSPHRASE_FILE}" -out "$OUT"
chmod 600 "$OUT"
sha256sum "$OUT" > "${OUT}.sha256"
rm -rf "$WORK"
log "Lot chiffré : $OUT ($(du -h "$OUT" | cut -f1))"

# 6. Copie hors serveur
OFFSITE=false
if [ -n "${RCLONE_REMOTE:-}" ]; then
  rclone copy "$OUT" "$RCLONE_REMOTE/" && rclone copy "${OUT}.sha256" "$RCLONE_REMOTE/" && OFFSITE=true \
    || fail "copie hors serveur impossible vers ${RCLONE_REMOTE}"
  log "Copie hors serveur : ${RCLONE_REMOTE}"
else
  log "ATTENTION : aucune copie hors serveur (RCLONE_REMOTE non défini) — perte totale possible avec le serveur"
fi

# 7. Rétention locale
find "$BACKUP_DIR" -maxdepth 1 -name 'olel-*.tar.enc*' -mtime +"$RETENTION_DAYS" -delete

printf '{"ok":true,"at":"%s","file":"%s","offsite":%s}\n' "$(date -u +%FT%TZ)" "$(basename "$OUT")" "$OFFSITE" > "$STATUS"
trap - ERR
[ "$OFFSITE" = true ] || exit 2
log "Sauvegarde terminée."
