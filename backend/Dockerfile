# Contexte : racine du dépôt — docker build -f backend/Dockerfile .
# Installation strictement conforme au lockfile du monorepo (audit F28).
FROM node:20-alpine AS builder
# libssl/libcrypto 3 sont présents dans node:20-alpine mais sous /usr/lib, alors
# que Prisma 5 les cherche dans /lib sur musl : lien pour détecter OpenSSL 3 et
# récupérer les bons moteurs (sinon ceux d'OpenSSL 1.1, inutilisables).
RUN ln -sf /usr/lib/libssl.so.3 /lib/libssl.so.3 && ln -sf /usr/lib/libcrypto.so.3 /lib/libcrypto.so.3
# Certificat d'un proxy TLS d'entreprise (facultatif) : --secret id=ca,src=ca.pem
ARG NODE_EXTRA_CA_CERTS=/run/secrets/ca
RUN --mount=type=secret,id=ca,required=false npm install -g pnpm@9.1.0
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY backend/package.json backend/
COPY apps/bot/package.json apps/bot/
COPY apps/dashboard/package.json apps/dashboard/
COPY apps/landing/package.json apps/landing/
COPY apps/mobile/package.json apps/mobile/
RUN --mount=type=secret,id=ca,required=false pnpm install --frozen-lockfile --filter @olel/backend...
COPY backend backend
RUN --mount=type=secret,id=ca,required=false pnpm --filter @olel/backend run prisma:generate && pnpm --filter @olel/backend run build
# Dépendances de production seules, isolées du reste du monorepo
RUN --mount=type=secret,id=ca,required=false pnpm --filter @olel/backend deploy --prod /out \
 && cp -r backend/dist /out/dist && cp -r backend/prisma /out/prisma \
 && cd /out && npx prisma generate \
 # Moteurs du CLI Prisma (migrations) récupérés à la construction : jamais au démarrage
 && npx prisma -v >/dev/null \
 && ls node_modules/.pnpm/@prisma+engines@*/node_modules/@prisma/engines/ | grep -q 'schema-engine-linux-musl-openssl-3.0.x'

# ── Image d'exécution ────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
# Même lien à l'exécution (détection de plateforme par le client et le CLI Prisma)
RUN ln -sf /usr/lib/libssl.so.3 /lib/libssl.so.3 && ln -sf /usr/lib/libcrypto.so.3 /lib/libcrypto.so.3 \
 && addgroup -S olel && adduser -S olel -G olel
WORKDIR /app
COPY --from=builder --chown=olel:olel /out ./
# Médias : volume persistant monté sur /app/uploads (audit F30)
RUN mkdir -p /app/uploads && chown olel:olel /app/uploads
ENV NODE_ENV=production PORT=4000 UPLOAD_DIR=/app/uploads
USER olel
EXPOSE 4000
HEALTHCHECK --interval=20s --timeout=10s --start-period=60s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:4000/api/v1/health/live',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
# Les migrations (additives) sont appliquées au démarrage : sauvegarder AVANT
# tout déploiement (docs/AUDIT_REMEDIATION.md, procédure de déploiement).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
