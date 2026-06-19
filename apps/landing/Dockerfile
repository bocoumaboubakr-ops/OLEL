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
ENV PORT=3004
ENV HOSTNAME=0.0.0.0

RUN addgroup -S olel && adduser -S olel -G olel

COPY --from=builder /app/public ./public 2>/dev/null || true
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

RUN chown -R olel:olel /app
USER olel

EXPOSE 3004

CMD ["node", "server.js"]
