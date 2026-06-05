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

RUN addgroup -S olel && adduser -S olel -G olel

WORKDIR /app
RUN apk add --no-cache openssl curl
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

RUN chown -R olel:olel /app
USER olel

EXPOSE 4000

HEALTHCHECK --interval=20s --timeout=10s --start-period=60s --retries=5 \
  CMD curl -fs http://127.0.0.1:4000/api/v1/health/live || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
