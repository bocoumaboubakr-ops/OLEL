#!/bin/bash
# OLEL – Script de setup initial
set -e

echo "🚨 OLEL – Plateforme d'Alerte Précoce Multi-Risques"
echo "     Région de Matam (Sénégal)"
echo ""

# Vérifier les dépendances
command -v docker >/dev/null 2>&1 || { echo "❌ Docker requis. Installez-le d'abord."; exit 1; }
command -v docker compose >/dev/null 2>&1 || { echo "❌ Docker Compose requis."; exit 1; }

# Copier .env si absent
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✅ .env créé depuis .env.example"
  echo "⚠️  IMPORTANT : Modifiez les secrets dans .env avant le déploiement !"
  echo "   JWT_SECRET, JWT_REFRESH_SECRET, TOTP_ENCRYPTION_KEY, BOT_API_KEY"
  echo ""
fi

# Vérifier les secrets critiques
if grep -q "change_me\|change_refresh\|change_me_64" .env; then
  echo "⚠️  AVERTISSEMENT : Des secrets par défaut sont détectés dans .env."
  echo "   En production, remplacez-les par des valeurs sécurisées."
  echo ""
fi

echo "🐳 Démarrage des services Docker..."
docker compose pull

echo ""
echo "✅ Setup terminé. Démarrez avec :"
echo "   docker compose up -d"
echo ""
echo "📊 Dashboard : http://localhost:3000"
echo "📱 Mobile    : http://localhost:3001"
echo "🤖 Bot       : http://localhost:3002"
echo "🔧 API Docs  : http://localhost:4000/api-docs"
echo "🗄️  Adminer   : docker compose --profile dev up adminer → http://localhost:8080"
