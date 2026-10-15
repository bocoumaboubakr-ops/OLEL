# Contexte : racine du dépôt — docker build -f apps/bot/Dockerfile .
FROM node:20-alpine AS builder
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
RUN --mount=type=secret,id=ca,required=false pnpm install --frozen-lockfile --filter @olel/bot...
COPY apps/bot apps/bot
RUN --mount=type=secret,id=ca,required=false pnpm --filter @olel/bot run build \
 && pnpm --filter @olel/bot deploy --prod /out && cp -r apps/bot/dist /out/dist

FROM node:20-alpine AS runner
RUN addgroup -S olel && adduser -S olel -G olel
WORKDIR /app
COPY --from=builder --chown=olel:olel /out ./
ENV NODE_ENV=production BOT_PORT=3002
USER olel
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "dist/main.js"]
