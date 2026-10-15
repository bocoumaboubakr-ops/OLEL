# Contexte : racine du dépôt — docker build -f apps/dashboard/Dockerfile .
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
RUN --mount=type=secret,id=ca,required=false pnpm install --frozen-lockfile --filter @olel/dashboard...
COPY apps/dashboard apps/dashboard
# Variables publiques figées dans le bundle au build
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
ARG NEXT_PUBLIC_WS_URL=ws://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @olel/dashboard run build

FROM node:20-alpine AS runner
RUN addgroup -S olel && adduser -S olel -G olel
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=builder --chown=olel:olel /repo/apps/dashboard/.next/standalone ./
COPY --from=builder --chown=olel:olel /repo/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=builder --chown=olel:olel /repo/apps/dashboard/public ./apps/dashboard/public
USER olel
EXPOSE 3000
CMD ["node", "apps/dashboard/server.js"]
