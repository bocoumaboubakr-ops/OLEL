#!/bin/bash
# OLEL – Vérification de santé de tous les services
# Usage : ./scripts/health-check.sh

set -euo pipefail

API_URL="${API_URL:-http://localhost:4000}"
DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:3000}"
MOBILE_URL="${MOBILE_URL:-http://localhost:3001}"
BOT_URL="${BOT_URL:-http://localhost:3002}"

OK=0
FAIL=0

check() {
    local name="$1"
    local url="$2"
    local expected="${3:-200}"
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null || echo "000")
    if [ "$status" = "$expected" ]; then
        echo "✅ ${name}: OK (HTTP ${status})"
        OK=$((OK + 1))
    else
        echo "❌ ${name}: FAIL (HTTP ${status} attendu ${expected})"
        FAIL=$((FAIL + 1))
    fi
}

echo "🔍 OLEL – Health Check"
echo "   $(date)"
echo ""

check "Backend liveness"   "${API_URL}/api/v1/health/live"
check "Backend readiness"  "${API_URL}/api/v1/health/ready"
check "Bot WhatsApp"       "${BOT_URL}/health"
check "Dashboard"          "${DASHBOARD_URL}"
check "Mobile PWA"         "${MOBILE_URL}"
# Swagger est désactivé en production (404 attendu) — on ne le teste qu'en dev
if [ "${NODE_ENV:-production}" != "production" ]; then
    check "Backend Swagger" "${API_URL}/api-docs"
fi

# Vérifier les conteneurs Docker
echo ""
echo "🐳 Conteneurs Docker :"
for container in olel-postgres olel-redis olel-backend olel-dashboard olel-mobile olel-bot; do
    status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "absent")
    if [ "$status" = "running" ]; then
        echo "  ✅ ${container}: running"
    else
        echo "  ❌ ${container}: ${status}"
        FAIL=$((FAIL + 1))
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ OK: ${OK}  ❌ FAIL: ${FAIL}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exit ${FAIL}
