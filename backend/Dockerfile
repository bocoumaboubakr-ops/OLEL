FROM node:20-alpine AS builder

WORKDIR /app
RUN apk add --no-cache openssl
RUN npm install -g pnpm@9

COPY package.json ./
COPY pnpm-lock.yaml* ./
RUN pnpm install --prefer-frozen-lockfile

COPY . .
RUN pnpm prisma:generate
RUN pnpm build

# ── Production image ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app
RUN apk add --no-cache openssl
RUN npm install -g pnpm@9

COPY package.json ./
COPY pnpm-lock.yaml* ./
RUN pnpm install --prefer-frozen-lockfile --prod

# Copier le build compilé et le schéma Prisma
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma

# Générer le client Prisma dans l'image de prod
RUN pnpm prisma:generate

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/v1/health/live || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
