#!/usr/bin/env bash
# Exercice de sauvegarde / restauration (audit F31) sur l'environnement de
# TEST local (scripts/test-services.sh) — données fictives uniquement.
#   1. base de démonstration (schéma réel via migrations) + médias
#   2. sauvegarde chiffrée (scripts/backup.sh, mode direct)
#   3. restauration dans une base NEUVE et un dossier NEUF, contrôles
#   4. cas d'échec attendus : mauvaise phrase, lot corrompu, cible non vide
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBASE="${PGBASE:-postgresql://olel@127.0.0.1:55432}"
SRC_DB=olel_drill_src; DST_DB=olel_drill_restore
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
PASS=0; FAILN=0
ok()  { echo "OK    $*"; PASS=$((PASS+1)); }
ko()  { echo "ÉCHEC $*"; FAILN=$((FAILN+1)); }

for db in $SRC_DB $DST_DB; do psql "$PGBASE/olel_test" -q -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db"; done
( cd "$ROOT/backend" && DATABASE_URL="$PGBASE/$SRC_DB" npx prisma migrate deploy >/dev/null )

# Données fictives représentatives
psql "$PGBASE/$SRC_DB" -q <<'SQL'
INSERT INTO zones (id, name, code, region, "isActive", "createdAt") VALUES
  ('00000000-0000-4000-8000-000000000001','Matam','MAT','Matam',true,now()),
  ('00000000-0000-4000-8000-000000000002','Commune A','KAN-A','Matam',true,now());
UPDATE zones SET "parentId"='00000000-0000-4000-8000-000000000001' WHERE code='KAN-A';
INSERT INTO users (id, phone, name, role, status, "isActive", "zoneId", language, "createdAt", "updatedAt", "tokenVersion", "loginFailures", "mfaFailures")
SELECT gen_random_uuid(), '+2217700' || lpad(g::text,5,'0'), 'Citoyen fictif ' || g, 'CITOYEN', 'ACTIVE', true,
       '00000000-0000-4000-8000-000000000002', 'fr', now(), now(), 0, 0, 0 FROM generate_series(1,250) g;
INSERT INTO signalements (id, "userId", type, text, "mediaUrls", status, channel, "createdAt")
SELECT gen_random_uuid(), id, 'INONDATION', 'Eau dans la rue (exercice)', ARRAY['/uploads/11111111-1111-4111-8111-111111111111.jpg'], 'PENDING', 'whatsapp', now() FROM users LIMIT 40;
SQL
MEDIA_SRC="$TMP/media-src"; mkdir -p "$MEDIA_SRC"
for i in $(seq 1 12); do head -c $((2048 + i * 37)) /dev/urandom > "$MEDIA_SRC/$(cat /proc/sys/kernel/random/uuid).jpg"; done
echo "phrase-exercice-$(date +%s)-$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')" > "$TMP/pass"; chmod 600 "$TMP/pass"

# Sauvegarde
set +e
BACKUP_MODE=direct DATABASE_URL="$PGBASE/$SRC_DB" UPLOADS_DIR="$MEDIA_SRC" BACKUP_DIR="$TMP/backups" \
  BACKUP_PASSPHRASE_FILE="$TMP/pass" bash "$ROOT/scripts/backup.sh" > "$TMP/backup.log" 2>&1
rc=$?; set -e
LOT="$(ls "$TMP"/backups/olel-*.tar.enc 2>/dev/null | head -1)"
[ $rc -eq 2 ] && [ -n "$LOT" ] && ok "sauvegarde chiffrée produite (code 2 : pas de copie hors serveur configurée, signalé)" || { ko "sauvegarde (code $rc)"; cat "$TMP/backup.log"; }
grep -q '"ok":true' "$TMP/backups/last-status.json" && ok "état de la dernière sauvegarde enregistré" || ko "état de sauvegarde"
if strings "$LOT" | grep -q "Citoyen fictif"; then ko "lot lisible en clair"; else ok "lot chiffré (aucune donnée lisible en clair)"; fi

# Restauration complète
if BACKUP_PASSPHRASE_FILE="$TMP/pass" bash "$ROOT/scripts/restore.sh" "$LOT" --db-url "$PGBASE/$DST_DB" --media-dir "$TMP/media-dst" > "$TMP/restore.log" 2>&1; then
  ok "restauration dans une base neuve : $(tail -1 "$TMP/restore.log" | sed 's/^\[[^]]*\] //')"
else ko "restauration"; cat "$TMP/restore.log"; fi
[ "$(psql "$PGBASE/$DST_DB" -At -c 'SELECT count(*) FROM users')" = 250 ] && ok "250 comptes restaurés" || ko "comptes restaurés"
( cd "$MEDIA_SRC" && find . -type f -exec sha256sum {} + | sort ) > "$TMP/a"; ( cd "$TMP/media-dst" && find . -type f -exec sha256sum {} + | sort ) > "$TMP/b"
diff -q "$TMP/a" "$TMP/b" >/dev/null && ok "médias restaurés identiques octet pour octet" || ko "médias restaurés différents"
( cd "$ROOT/backend" && DATABASE_URL="$PGBASE/$DST_DB" npx prisma migrate status >/dev/null 2>&1 ) && ok "schéma restauré à jour des migrations" || ko "statut des migrations après restauration"

# Cas d'échec attendus
echo "mauvaise-phrase" > "$TMP/wrong"
BACKUP_PASSPHRASE_FILE="$TMP/wrong" bash "$ROOT/scripts/restore.sh" "$LOT" --verify-only >/dev/null 2>&1 && ko "mauvaise phrase acceptée" || ok "mauvaise phrase refusée"
cp "$LOT" "$TMP/corrupt.tar.enc"; printf '\xff\xff\xff\xff' | dd of="$TMP/corrupt.tar.enc" bs=1 seek=4096 conv=notrunc status=none
BACKUP_PASSPHRASE_FILE="$TMP/pass" bash "$ROOT/scripts/restore.sh" "$TMP/corrupt.tar.enc" --verify-only >/dev/null 2>&1 && ko "lot corrompu accepté" || ok "lot corrompu détecté"
BACKUP_PASSPHRASE_FILE="$TMP/pass" bash "$ROOT/scripts/restore.sh" "$LOT" --db-url "$PGBASE/$DST_DB" --media-dir "$TMP/media-x" >/dev/null 2>&1 && ko "écrasement d'une base non vide accepté" || ok "restauration dans une base non vide refusée"

for db in $SRC_DB $DST_DB; do psql "$PGBASE/olel_test" -q -c "DROP DATABASE IF EXISTS $db"; done
echo; echo "$PASS vérification(s) réussie(s), $FAILN échec(s)"
[ $FAILN -eq 0 ]
