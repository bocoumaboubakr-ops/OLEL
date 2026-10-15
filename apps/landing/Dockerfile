# Contexte : racine du dépôt — docker build -f apps/landing/Dockerfile .
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
RUN --mount=type=secret,id=ca,required=false pnpm install --frozen-lockfile --filter @olel/landing...
COPY apps/landing apps/landing
# Variables publiques figées dans le bundle au build

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @olel/landing run build

FROM node:20-alpine AS runner
RUN addgroup -S olel && adduser -S olel -G olel
WORKDIR /app
ENV NODE_ENV=production PORT=3004 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=builder --chown=olel:olel /repo/apps/landing/.next/standalone ./
COPY --from=builder --chown=olel:olel /repo/apps/landing/.next/static ./apps/landing/.next/static
COPY --from=builder --chown=olel:olel /repo/apps/landing/public ./apps/landing/public
USER olel
EXPOSE 3004
CMD ["node", "apps/landing/server.js"]
