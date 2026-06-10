#!/bin/bash
# OLEL – Vérification de santé de tous les services
# Usage : ./scripts/health-check.sh

set -euo pipefail

API_URL="${API_URL:-http://localhost:4000}"
DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:3000}"
MOBILE_URL="${MOBILE_URL:-http://localhost:3001}"

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
check "Backend Swagger"    "${API_URL}/api-docs"
check "Dashboard"          "${DASHBOARD_URL}"
check "Mobile PWA"         "${MOBILE_URL}"

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
