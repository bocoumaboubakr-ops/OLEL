FROM node:20-alpine AS builder

WORKDIR /app
RUN npm install -g pnpm@9

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prefer-frozen-lockfile

COPY . .
RUN pnpm build

# ── Production image ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S olel && adduser -S olel -G olel

RUN npm install -g pnpm@9

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prefer-frozen-lockfile --prod

COPY --from=builder /app/dist ./dist

RUN chown -R olel:olel /app
USER olel

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3002/health 2>/dev/null || exit 1

CMD ["node", "dist/main.js"]
