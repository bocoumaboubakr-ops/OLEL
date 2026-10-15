#!/usr/bin/env bash
# OLEL — Restauration d'un lot de sauvegarde (audit F31)
#
# Par défaut, restaure dans une base NEUVE et un dossier NEUF : jamais
# d'écrasement de la production sans demande explicite.
#
# Usage :
#   scripts/restore.sh <lot.tar.enc> --db-url <postgresql://…/base_cible> --media-dir <dossier_cible>
# Options :
#   --verify-only   déchiffre et contrôle les sommes, sans rien restaurer
#   --allow-nonempty  autorise une base cible non vide (dangereux)
# Variables : BACKUP_PASSPHRASE_FILE (obligatoire)
#
# Contrôles : somme SHA-256 du lot, sommes du manifeste, puis comptages par
# table et liste des médias comparés à ceux enregistrés à la sauvegarde.
set -Eeuo pipefail

LOT="${1:?lot .tar.enc requis}"; shift || true
DB_URL=""; MEDIA_DIR=""; VERIFY_ONLY=false; ALLOW_NONEMPTY=false
while [ $# -gt 0 ]; do
  case "$1" in
    --db-url) DB_URL="$2"; shift 2;;
    --media-dir) MEDIA_DIR="$2"; shift 2;;
    --verify-only) VERIFY_ONLY=true; shift;;
    --allow-nonempty) ALLOW_NONEMPTY=true; shift;;
    *) echo "Option inconnue : $1"; exit 64;;
  esac
done
log() { echo "[$(date -u +%FT%TZ)] $*"; }
die() { log "ÉCHEC : $*"; exit 1; }

[ -s "${BACKUP_PASSPHRASE_FILE:-}" ] || die "BACKUP_PASSPHRASE_FILE requis"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

# 1. Intégrité du lot transporté
if [ -f "${LOT}.sha256" ]; then
  ( cd "$(dirname "$LOT")" && sha256sum -c "$(basename "$LOT").sha256" --quiet ) || die "somme du lot invalide"
  log "Somme du lot vérifiée"
fi

# 2. Déchiffrement + sommes internes
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:${BACKUP_PASSPHRASE_FILE}" -in "$LOT" | tar -C "$WORK" -xf - \
  || die "déchiffrement impossible (phrase incorrecte ou lot corrompu)"
( cd "$WORK" && sha256sum -c SHA256SUMS --quiet ) || die "sommes internes invalides"
log "Lot déchiffré, sommes internes vérifiées : $(cat "$WORK/manifest.json")"
$VERIFY_ONLY && { log "Vérification seule : OK"; exit 0; }

[ -n "$DB_URL" ] || die "--db-url requis"
[ -n "$MEDIA_DIR" ] || die "--media-dir requis"

# 3. Base cible : vide sauf demande explicite
TABLES=$(psql "$DB_URL" -At -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
if [ "$TABLES" != "0" ] && ! $ALLOW_NONEMPTY; then
  die "la base cible contient déjà ${TABLES} table(s) — restauration refusée (--allow-nonempty pour forcer)"
fi
pg_restore --no-owner --no-privileges --exit-on-error -d "$DB_URL" "$WORK/db.dump"
log "Base restaurée"

# 4. Médias
mkdir -p "$MEDIA_DIR"
if [ -n "$(ls -A "$MEDIA_DIR" 2>/dev/null)" ] && ! $ALLOW_NONEMPTY; then die "dossier médias cible non vide"; fi
tar -C "$MEDIA_DIR" -xf "$WORK/media.tar"
log "Médias restaurés dans $MEDIA_DIR"

# 5. Contrôle : comptages par table et liste des médias identiques à la sauvegarde
ERR=0
while IFS=$'\t' read -r t n; do
  got=$(psql "$DB_URL" -At -c "SELECT count(*) FROM \"$t\"")
  if [ "$got" != "$n" ]; then log "ÉCART table $t : attendu $n, restauré $got"; ERR=1; fi
done < "$WORK/rowcounts.tsv"
( cd "$MEDIA_DIR" && find . -type f | sort ) > "$WORK/restored.list"
if ! diff -q "$WORK/media.list" "$WORK/restored.list" >/dev/null; then log "ÉCART dans la liste des médias"; ERR=1; fi
[ $ERR -eq 0 ] || die "contrôles après restauration en échec"
log "Restauration vérifiée : $(wc -l < "$WORK/rowcounts.tsv") tables, $(wc -l < "$WORK/restored.list") médias, comptages identiques"
