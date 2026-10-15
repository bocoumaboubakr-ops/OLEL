#!/usr/bin/env bash
# Validation d'un déploiement Compose représentatif (audit F28/F30/F31/F32/F33)
# — environnement de VALIDATION uniquement, données fictives, aucun
# fournisseur configuré (aucun message réel ne peut partir).
#
# Prérequis : pile démarrée avec
#   docker compose -p <projet> --env-file <env> -f docker-compose.yml [-f override] up -d postgres redis backend bot
# Usage : PROJECT=olelval ENV_FILE=… COMPOSE_EXTRA="-f override.yml" scripts/verify/deployment-check.sh
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
PROJECT="${PROJECT:?}"; ENV_FILE="${ENV_FILE:?}"
DC="docker compose -p $PROJECT --env-file $ENV_FILE -f docker-compose.yml ${COMPOSE_EXTRA:-}"
set -a; . "$ENV_FILE"; set +a
API=http://127.0.0.1:4000/api/v1
PASS=0; FAILN=0
ok() { echo "OK    $*"; PASS=$((PASS+1)); }
ko() { echo "ÉCHEC $*"; FAILN=$((FAILN+1)); }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
sql() { $DC exec -T postgres psql -U olel -d olel -At -c "$1" </dev/null; }
node_in() { $DC exec -T backend node -e "$1" </dev/null; }
wait_healthy() { for _ in $(seq 1 60); do [ "$(docker inspect -f '{{.State.Health.Status}}' olel-backend)" = healthy ] && return 0; sleep 3; done; return 1; }

wait_healthy && ok "backend démarré (migrations appliquées sur base neuve)" || { ko "backend non sain"; docker logs --tail 30 olel-backend; exit 1; }
[ "$(sql "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL")" -ge 10 ] && ok "migrations enregistrées : $(sql "SELECT count(*) FROM _prisma_migrations")" || ko "migrations"
docker logs olel-backend 2>&1 | grep -q "binaries.prisma.sh" && ko "téléchargement de moteur Prisma tenté au démarrage" || ok "aucun téléchargement au démarrage"

# Périmètre réseau (F32)
for p in 4000 5434 6380 3002; do
  addr=$(docker port olel-backend 4000 2>/dev/null; docker port olel-postgres 5432 2>/dev/null; docker port olel-redis 6379 2>/dev/null; docker port olel-bot 3002 2>/dev/null)
done
echo "$addr" | grep -v '^127\.0\.0\.1:' | grep -q . && ko "port publié hors 127.0.0.1 : $addr" || ok "services internes liés à 127.0.0.1 uniquement"
docker exec olel-redis redis-cli -a wrong --no-auth-warning ping 2>&1 | grep -q PONG && ko "Redis accepte un mauvais mot de passe" || ok "Redis exige son mot de passe"

# Santé et supervision (F33)
[ "$(code $API/health/ready)" = 200 ] && ok "santé ready (base + Redis)" || ko "santé ready"
d=$(curl -s $API/health/diffusion); echo "$d" | grep -q '"providers":{"status":"down"' && ok "diffusion déclarée dégradée sans fournisseur configuré (pas de faux « sain »)" || ko "santé diffusion : $d"
[ "$(code $API/metrics)" = 401 ] && ok "métriques refusées sans jeton" || ko "métriques sans jeton"
curl -s -H "Authorization: Bearer $METRICS_TOKEN" $API/metrics | grep -q '^olel_queue_jobs{state="redis_up"} 1' && ok "métriques avec jeton (file de diffusion visible)" || ko "métriques avec jeton"

# Données fictives : zone, mairie (MFA), citoyen consentant
ZONE=$(sql "INSERT INTO zones (id,name,code,region,\"isActive\",\"createdAt\") VALUES (gen_random_uuid(),'Commune Validation','VAL-1','Matam',true,now()) RETURNING id" | head -1)
read -r SECRET ENC <<<"$(node_in "const {authenticator}=require('otplib');const {encryptTotpSecret}=require('./dist/auth/totp-crypto');const s=authenticator.generateSecret();console.log(s, encryptTotpSecret(s, process.env.TOTP_ENCRYPTION_KEY))")"
HASH=$(node_in "console.log(require('bcrypt').hashSync('Validation-Mairie-2026',10))")
sql "INSERT INTO users (id,phone,name,role,status,\"isActive\",\"zoneId\",language,\"passwordHash\",\"totpSecret\",\"totpEnabled\",\"createdAt\",\"updatedAt\",\"tokenVersion\",\"loginFailures\",\"mfaFailures\") VALUES (gen_random_uuid(),'+221700099001','Mairie validation','MAIRIE','ACTIVE',true,'$ZONE','fr','$HASH','$ENC',true,now(),now(),0,0,0)" >/dev/null
CIT=$(sql "INSERT INTO users (id,phone,name,role,status,\"isActive\",\"zoneId\",language,\"createdAt\",\"updatedAt\",\"tokenVersion\",\"loginFailures\",\"mfaFailures\",\"lastWhatsappInboundAt\") VALUES (gen_random_uuid(),'+221700099002','Citoyen validation','CITOYEN','ACTIVE',true,'$ZONE','fr',now(),now(),0,0,0,now()) RETURNING id" | head -1)
sql "INSERT INTO consents (id,\"userId\",\"whatsappOptInAt\") VALUES (gen_random_uuid(),'$CIT',now())" >/dev/null
MFA=$(curl -s -X POST $API/auth/login -H 'content-type: application/json' -d '{"phone":"+221700099001","password":"Validation-Mairie-2026"}' | sed -n 's/.*"mfaToken":"\([^"]*\)".*/\1/p')
OTP=$(node_in "console.log(require('otplib').authenticator.generate('$SECRET'))")
TOKEN=$(curl -s -X POST $API/auth/totp/login -H 'content-type: application/json' -d "{\"mfaToken\":\"$MFA\",\"code\":\"$OTP\"}" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] && ok "connexion mairie avec MFA" || { ko "connexion MFA"; exit 1; }

# Médias persistants (F12/F30)
printf '\x89PNG\r\n\x1a\n%064d' 0 > /tmp/olel-val.png
URL=$(curl -s -H "Authorization: Bearer $TOKEN" -F "file=@/tmp/olel-val.png;type=image/png" $API/upload/photo | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')
LOCAL_URL="${URL/http:\/\/localhost:4000/http://127.0.0.1:4000}"
[ "$(code "$LOCAL_URL")" = 200 ] && ok "média déposé et lisible par URL signée" || ko "média : $URL"
$DC up -d --force-recreate --no-deps backend >/dev/null 2>&1; wait_healthy
[ "$(code "$LOCAL_URL")" = 200 ] && ok "média toujours présent après remplacement du conteneur (volume)" || ko "média perdu après recréation"

# Panne Redis au moment de la décision, puis reprise (F23) — sans fournisseur : échec VISIBLE, jamais de faux envoi (F22)
AUTEUR=$(sql "SELECT id FROM users WHERE phone='+221700099002'")
ALERT=$(sql "INSERT INTO alerts (id,title,description,type,\"alertLevel\",status,\"currentStep\",severity,\"zoneId\",\"createdById\",\"mediaUrls\",\"verifiedAt\",\"createdAt\",\"updatedAt\") VALUES (gen_random_uuid(),'Crue (exercice)','Données fictives','INONDATION','ORANGE','VALIDATED','MAIRIE',2,'$ZONE','$AUTEUR','{}',now(),now(),now()) RETURNING id" | head -1)
docker stop olel-redis >/dev/null
r=$(curl -s -o /tmp/olel-b.json -w '%{http_code}' -X POST $API/alerts/$ALERT/broadcast -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"message":"Consigne d’exercice","channels":["whatsapp","sms"]}')
BID=$(sed -n 's/.*"broadcast":{"id":"\([^"]*\)".*/\1/p' /tmp/olel-b.json)
[ "$r" = 201 ] && [ "$(sql "SELECT status FROM broadcasts WHERE id='$BID'")" = PENDING ] && ok "Redis arrêté : décision enregistrée, intention PENDING (rien de perdu)" || ko "décision pendant la panne Redis ($r)"
[ "$(code $API/health/diffusion)" = 503 ] && ok "santé diffusion 503 pendant la panne Redis" || ko "santé diffusion pendant la panne"
docker start olel-redis >/dev/null
for _ in $(seq 1 40); do st=$(sql "SELECT status FROM broadcasts WHERE id='$BID'"); case $st in DONE|PARTIAL|FAILED) break;; esac; sleep 3; done
err=$(sql "SELECT string_agg(DISTINCT error, ' | ') FROM broadcast_deliveries WHERE \"broadcastId\"='$BID'")
[ "$st" = FAILED ] && echo "$err" | grep -qi "configur" && ok "reprise après Redis : exécutée, échec visible « canal non configuré » (aucun faux envoi)" || ko "reprise : statut $st, $err"
[ "$(sql "SELECT count(*) FROM broadcast_deliveries WHERE \"broadcastId\"='$BID' AND status IN ('SENT','SIMULATED','DELIVERED')")" = 0 ] && ok "aucune remise comptée comme envoyée ou simulée en production" || ko "remise comptée à tort"

# Bot
[ "$(code http://127.0.0.1:3002/health)" = 200 ] && ok "bot en service" || ko "bot"
[ "$(curl -s "http://127.0.0.1:3002/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=$WHATSAPP_VERIFY_TOKEN&hub.challenge=42")" = 42 ] && ok "vérification webhook avec le bon jeton" || ko "vérification webhook"
[ "$(code "http://127.0.0.1:3002/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=olel_webhook_secret&hub.challenge=1")" = 403 ] && ok "ancien jeton par défaut refusé" || ko "jeton par défaut"
[ "$(code -X POST http://127.0.0.1:3002/webhook/whatsapp -H 'content-type: application/json' -d '{"object":"whatsapp_business_account","entry":[]}')" = 403 ] && ok "webhook sans signature refusé" || ko "webhook sans signature"

# Sauvegarde Compose + restauration dans une base neuve (F31)
TMP=$(mktemp -d); head -c 48 /dev/urandom | base64 > "$TMP/pass"
set +e
BACKUP_MODE=compose COMPOSE_FILES="-p $PROJECT --env-file $ENV_FILE -f docker-compose.yml ${COMPOSE_EXTRA:-}" BACKUP_DIR="$TMP/b" BACKUP_PASSPHRASE_FILE="$TMP/pass" bash scripts/backup.sh > "$TMP/backup.log" 2>&1; rc=$?
set -e
LOT=$(ls "$TMP"/b/olel-*.tar.enc 2>/dev/null | head -1)
[ $rc -eq 2 ] && [ -n "$LOT" ] && ok "sauvegarde Compose chiffrée (base + médias)" || { ko "sauvegarde Compose ($rc)"; tail -5 "$TMP/backup.log"; }
sql "CREATE DATABASE olel_restore_check" >/dev/null
DBURL="postgresql://olel:${POSTGRES_PASSWORD}@127.0.0.1:5434/olel_restore_check"
BACKUP_PASSPHRASE_FILE="$TMP/pass" bash scripts/restore.sh "$LOT" --db-url "$DBURL" --media-dir "$TMP/media" > "$TMP/restore.log" 2>&1 \
  && ok "restauration vérifiée : $(tail -1 "$TMP/restore.log" | sed 's/^\[[^]]*\] //')" || { ko "restauration"; tail -5 "$TMP/restore.log"; }
NT=$(sql "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
grep -q "Restauration vérifiée : $NT tables" "$TMP/restore.log" && ok "les $NT tables ont été contrôlées" || ko "contrôle partiel des tables ($(tail -1 "$TMP/restore.log"))"
sql "DROP DATABASE olel_restore_check" >/dev/null; rm -rf "$TMP"

echo; echo "$PASS vérification(s) réussie(s), $FAILN échec(s)"
[ $FAILN -eq 0 ]
