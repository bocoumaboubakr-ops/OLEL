#!/usr/bin/env bash
# OLEL — Répétition du déploiement sur une COPIE des données (étape 1)
#
# À lancer sur le serveur, depuis un clone SÉPARÉ de la branche à déployer
# (ex. /opt/olel-next), pendant que la production tourne normalement :
#   sudo scripts/rehearse-deploy.sh [--keep] [--pg-container olel-postgres]
#
# Garanties :
#  - la base de production n'est QUE lue (pg_dump) ; toute écriture vise une
#    base nommée olel_repetition (vérifié avant chaque commande) ;
#  - la nouvelle version tourne dans des conteneurs temporaires distincts,
#    avec son propre Redis, SANS aucun identifiant fournisseur et avec un
#    mode pilote fermé : aucun message ne peut partir ;
#  - les conteneurs de production ne sont ni arrêtés ni modifiés ;
#  - nettoyage complet à la fin (sauf --keep pour inspecter la copie).
#
# Produit un rapport rehearsal-<horodatage>.txt : comptages avant/après par
# table, invariants de migration, santé de la nouvelle version.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
PG=olel-postgres; KEEP=false
while [ $# -gt 0 ]; do
  case "$1" in --keep) KEEP=true; shift;; --pg-container) PG="$2"; shift 2;; *) echo "Option inconnue : $1"; exit 64;; esac
done
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"; REPORT="$ROOT/rehearsal-$STAMP.txt"
DB=olel_repetition; IMG=olel-backend:repetition; RREDIS=olel-repetition-redis; RAPP=olel-repetition-backend
WORK="$(mktemp -d)"; chmod 700 "$WORK"
PASS=0; FAILN=0
say() { echo "$*" | tee -a "$REPORT"; }
ok() { say "OK    $*"; PASS=$((PASS+1)); }
ko() { say "ÉCHEC $*"; FAILN=$((FAILN+1)); }
cleanup() {
  docker rm -f "$RAPP" "$RREDIS" >/dev/null 2>&1 || true
  if ! $KEEP; then docker exec "$PG" psql -U olel -d postgres -q -c "DROP DATABASE IF EXISTS $DB" >/dev/null 2>&1 || true; fi
  shred -u "$WORK"/* 2>/dev/null || rm -f "$WORK"/*; rmdir "$WORK" 2>/dev/null || true
}
trap cleanup EXIT
q() {  # requête sur une base ; refuse toute écriture hors de la copie
  local db="$1" sql="$2"
  if [ "$db" != "$DB" ] && echo "$sql" | grep -qiE '^\s*(insert|update|delete|alter|drop|create|truncate)'; then
    echo "REFUS : écriture interdite sur $db" >&2; exit 70
  fi
  docker exec "$PG" psql -U olel -d "$db" -At -c "$sql" </dev/null
}

say "Répétition du déploiement OLEL — $STAMP"
say "Version testée : $(git rev-parse --short HEAD) ($(git rev-parse --abbrev-ref HEAD))"
docker inspect -f '{{.State.Running}}' "$PG" 2>/dev/null | grep -q true || { ko "conteneur $PG introuvable ou arrêté"; exit 1; }
NET=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$PG" | awk '{print $1}')
PGPW=$(docker exec "$PG" printenv POSTGRES_PASSWORD)

# 0. Espace disque : la copie ne doit pas mettre la production en danger
DBSIZE=$(q olel "SELECT pg_database_size('olel')")
FREE=$(docker exec "$PG" df -Pk /var/lib/postgresql/data | awk 'NR==2 {print $4*1024}')
[ "$FREE" -gt $((DBSIZE * 3)) ] && ok "espace disque suffisant ($((FREE/1048576)) Mo libres, base $((DBSIZE/1048576)) Mo)" \
  || { ko "espace disque insuffisant pour une copie sûre"; exit 1; }

# 1. Copie (lecture seule sur la production)
docker exec "$PG" pg_dump -U olel -d olel -Fc > "$WORK/prod.dump"
q postgres "SELECT 1" >/dev/null
docker exec "$PG" psql -U olel -d postgres -q -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" </dev/null
docker exec -i "$PG" pg_restore -U olel -d "$DB" --no-owner --exit-on-error < "$WORK/prod.dump"
ok "copie restaurée dans $DB ($(du -h "$WORK/prod.dump" | cut -f1) compressé)"

TABLES_SQL="SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> '_prisma_migrations' ORDER BY 1"
q "$DB" "$TABLES_SQL" | while read -r t; do printf '%s\t%s\n' "$t" "$(q "$DB" "SELECT count(*) FROM \"$t\"")"; done > "$WORK/before.tsv"
col() { q "$DB" "SELECT count(*) FROM information_schema.columns WHERE table_name='$1' AND column_name='$2'"; }
INACTIVE_BEFORE=$(q "$DB" "SELECT count(*) FROM users WHERE \"isActive\" = false")
BROADCASTS_BEFORE=$(q "$DB" "SELECT count(*) FROM broadcasts")
DELIVERED_SUM_BEFORE=$(q "$DB" "SELECT coalesce(sum(\"deliveredCount\"),0) FROM broadcasts")
OTP_OPEN_BEFORE=$(q "$DB" "SELECT count(*) FROM otp_requests WHERE used = false")
MIG_BEFORE=$(q "$DB" "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL")
say "Avant : $(wc -l < "$WORK/before.tsv") tables, $MIG_BEFORE migrations, $INACTIVE_BEFORE comptes inactifs, $BROADCASTS_BEFORE diffusions, $OTP_OPEN_BEFORE OTP en cours"

# 2. Nouvelle image (sans toucher aux images de production)
# REHEARSAL_BUILD_ARGS : options de construction facultatives (proxy d'entreprise, ex.
# "--network host --secret id=ca,src=/etc/ssl/proxy-ca.pem")
if docker build -q ${REHEARSAL_BUILD_ARGS:-} -f backend/Dockerfile -t "$IMG" . > "$WORK/build.log" 2>&1; then ok "image $IMG construite"; else ko "construction de l'image"; tail -20 "$WORK/build.log" | tee -a "$REPORT"; exit 1; fi

# 3. Migrations sur la copie
URL="postgresql://olel:${PGPW}@${PG}:5432/${DB}"
if docker run --rm --network "$NET" -e DATABASE_URL="$URL" --entrypoint sh "$IMG" -c 'npx prisma migrate deploy' > "$WORK/migrate.log" 2>&1; then
  ok "migrations appliquées sur la copie : $(grep -c 'Applying migration' "$WORK/migrate.log" || true) nouvelle(s)"
else ko "migrations en échec"; tail -30 "$WORK/migrate.log" | tee -a "$REPORT"; exit 1; fi
docker run --rm --network "$NET" -e DATABASE_URL="$URL" --entrypoint sh "$IMG" -c 'npx prisma migrate status' > "$WORK/status.log" 2>&1 \
  && ok "schéma à jour (prisma migrate status)" || { ko "statut des migrations"; tail -10 "$WORK/status.log" | tee -a "$REPORT"; }

# 4. Invariants : aucune ligne perdue, transformations attendues
LOST=0
while IFS=$'\t' read -r t n; do
  after=$(q "$DB" "SELECT count(*) FROM \"$t\"")
  [ "$after" = "$n" ] || { say "      table $t : $n → $after"; LOST=1; }
done < "$WORK/before.tsv"
[ $LOST -eq 0 ] && ok "aucune ligne perdue ni ajoutée dans les $(wc -l < "$WORK/before.tsv") tables existantes" || ko "écarts de comptage (voir ci-dessus)"
[ "$(q "$DB" "SELECT count(*) FROM users WHERE status = 'SUSPENDED'")" = "$INACTIVE_BEFORE" ] && ok "comptes inactifs → SUSPENDED ($INACTIVE_BEFORE)" || ko "correspondance des comptes suspendus"
[ "$(q "$DB" "SELECT count(*) FROM users WHERE status IS NULL")" = 0 ] && ok "tous les comptes ont un statut" || ko "comptes sans statut"
[ "$(q "$DB" "SELECT count(*) FROM broadcasts WHERE status <> 'DONE'")" = 0 ] && ok "diffusions historiques marquées DONE (aucune ne sera rejouée)" || ko "diffusions historiques non terminées"
[ "$(q "$DB" "SELECT coalesce(sum(\"sentCount\"),0) FROM broadcasts")" = "$DELIVERED_SUM_BEFORE" ] && ok "compteurs historiques requalifiés : « livré » → « envoyé » ($DELIVERED_SUM_BEFORE)" || ko "requalification des compteurs"
[ "$(q "$DB" "SELECT count(*) FROM otp_requests WHERE used = false")" = 0 ] && ok "codes OTP en cours invalidés ($OTP_OPEN_BEFORE)" || ko "OTP non invalidés"
[ "$(q "$DB" "SELECT count(*) FROM pg_indexes WHERE indexname = 'validations_alertId_validatorId_key'")" = 0 ] && ok "index résiduel validations supprimé" || ko "index validations toujours présent"
[ "$(q "$DB" "SELECT count(*) FROM users WHERE name = 'BOT OLEL' AND role = 'ADMIN'")" = 0 ] && ok "compte technique BOT OLEL sans rôle ADMIN" || ko "compte BOT OLEL encore ADMIN"
say "Info : $(q "$DB" "SELECT count(*) FROM users WHERE role = 'CITOYEN'") citoyens, dont $(q "$DB" "SELECT count(*) FROM consents WHERE \"whatsappOptInAt\" IS NOT NULL") avec consentement WhatsApp (attendu : 0 avant recueil, décision D7)"

# 5. Nouvelle version sur la copie : aucun fournisseur, mode pilote fermé, Redis dédié
RPW=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')
docker run -d --rm --name "$RREDIS" --network "$NET" redis:7-alpine redis-server --requirepass "$RPW" >/dev/null
docker run -d --rm --name "$RAPP" --network "$NET" -p 127.0.0.1:4900:4000 \
  -e NODE_ENV=production -e DATABASE_URL="$URL" -e REDIS_HOST="$RREDIS" -e REDIS_PORT=6379 -e REDIS_PASSWORD="$RPW" \
  -e JWT_SECRET="$(head -c 48 /dev/urandom | base64)" -e JWT_REFRESH_SECRET="$(head -c 48 /dev/urandom | base64)" \
  -e TOTP_ENCRYPTION_KEY="$(head -c 48 /dev/urandom | base64)" -e BOT_API_KEY="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')" \
  -e PILOT_RECIPIENT_ALLOWLIST=+0000000000 -e WHATSAPP_TOKEN= -e AFRICAS_TALKING_KEY=sandbox -e AT_CALLBACK_SECRET=repetition \
  --entrypoint sh "$IMG" -c 'node dist/main.js' >/dev/null
for _ in $(seq 1 60); do curl -fs http://127.0.0.1:4900/api/v1/health/ready >/dev/null 2>&1 && break; sleep 2; done
curl -fs http://127.0.0.1:4900/api/v1/health/ready >/dev/null && ok "nouvelle version démarrée sur la copie (base + Redis)" || { ko "nouvelle version non démarrée"; docker logs --tail 30 "$RAPP" 2>&1 | tee -a "$REPORT"; }
docker logs "$RAPP" 2>&1 | grep -q "binaries.prisma.sh" && ko "téléchargement de moteur Prisma au démarrage" || ok "aucun téléchargement au démarrage"
DIFF=$(curl -s http://127.0.0.1:4900/api/v1/health/diffusion || true)
echo "$DIFF" | grep -q '"pilotMode":true' && ok "mode pilote fermé confirmé par la santé « diffusion »" || ko "mode pilote non confirmé : $DIFF"
sleep 40  # laisser passer un balayage de la file
[ "$(q "$DB" "SELECT count(*) FROM broadcast_deliveries WHERE status IN ('SENT','DELIVERED','READ','SIMULATED')")" = 0 ] && ok "aucun message envoyé pendant la répétition" || ko "des remises ont été enregistrées"
say "Info : $(q "$DB" "SELECT count(*) FROM alerts WHERE status IN ('BROADCAST','BROADCASTING','ACTIVE')") alerte(s) publique(s) en vigueur après migration"

say ""; say "$PASS vérification(s) réussie(s), $FAILN échec(s) — rapport : $REPORT"
$KEEP && say "Copie conservée : base $DB (à supprimer : docker exec $PG psql -U olel -d postgres -c 'DROP DATABASE $DB')"
[ $FAILN -eq 0 ]
