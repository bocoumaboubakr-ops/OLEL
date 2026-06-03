#!/bin/bash
# Génère des secrets cryptographiquement forts pour la production
echo "# Secrets générés le $(date)"
echo "JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
echo "TOTP_ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo "BOT_API_KEY=$(openssl rand -base64 32 | tr -d '\n' | tr -dc 'a-zA-Z0-9' | head -c 40)"
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '\n/+=' | head -c 24)"
