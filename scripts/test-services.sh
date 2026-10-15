#!/usr/bin/env bash
# Démarre une base PostgreSQL 16 et un Redis 7 jetables pour les tests
# d'intégration et e2e du backend (aucune donnée de production).
#
# Usage : scripts/test-services.sh start|stop|reset
#   start : démarre PG (port 55432) + Redis (port 56379), applique les migrations
#   reset : vide la base de test (DROP/CREATE + migrations)
#   stop  : arrête les deux services
#
# Variables exportables ensuite :
#   DATABASE_URL=postgresql://olel@127.0.0.1:55432/olel_test
#   REDIS_HOST=127.0.0.1 REDIS_PORT=56379
set -euo pipefail

PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA_DIR="${OLEL_TEST_PGDIR:-/var/tmp/olel-pgtest}"
PG_PORT="${OLEL_TEST_PGPORT:-55432}"
REDIS_PORT="${OLEL_TEST_REDISPORT:-56379}"
DB_URL="postgresql://olel@127.0.0.1:${PG_PORT}/olel_test"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# PostgreSQL refuse de tourner en root : on délègue à l'utilisateur postgres.
as_pg() { if [ "$(id -u)" = "0" ]; then su postgres -c "$*"; else bash -c "$*"; fi; }

migrate() {
  (cd "$ROOT/backend" && DATABASE_URL="$DB_URL" npx prisma migrate deploy >/dev/null)
  echo "migrations appliquées sur $DB_URL"
}

case "${1:-start}" in
  start)
    if [ ! -d "$DATA_DIR/data" ]; then
      mkdir -p "$DATA_DIR"; [ "$(id -u)" = "0" ] && chown postgres "$DATA_DIR"
      as_pg "$PG_BIN/initdb -D $DATA_DIR/data -U olel --auth=trust -E UTF8 >/dev/null"
    fi
    if ! as_pg "$PG_BIN/pg_ctl -D $DATA_DIR/data status" >/dev/null 2>&1; then
      as_pg "$PG_BIN/pg_ctl -D $DATA_DIR/data -o '-p $PG_PORT -k $DATA_DIR -c listen_addresses=127.0.0.1' -l $DATA_DIR/pg.log -w start" >/dev/null
    fi
    psql -h 127.0.0.1 -p "$PG_PORT" -U olel -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='olel_test'" | grep -q 1 \
      || psql -h 127.0.0.1 -p "$PG_PORT" -U olel -d postgres -qc "CREATE DATABASE olel_test"
    redis-cli -p "$REDIS_PORT" ping >/dev/null 2>&1 \
      || redis-server --port "$REDIS_PORT" --daemonize yes --save '' --appendonly no >/dev/null
    migrate
    echo "PostgreSQL :$PG_PORT et Redis :$REDIS_PORT prêts"
    ;;
  reset)
    psql -h 127.0.0.1 -p "$PG_PORT" -U olel -d postgres -qc "DROP DATABASE IF EXISTS olel_test WITH (FORCE)"
    psql -h 127.0.0.1 -p "$PG_PORT" -U olel -d postgres -qc "CREATE DATABASE olel_test"
    migrate
    ;;
  stop)
    redis-cli -p "$REDIS_PORT" shutdown nosave >/dev/null 2>&1 || true
    as_pg "$PG_BIN/pg_ctl -D $DATA_DIR/data stop" >/dev/null 2>&1 || true
    echo "services de test arrêtés"
    ;;
  *) echo "usage: $0 start|stop|reset"; exit 2 ;;
esac
