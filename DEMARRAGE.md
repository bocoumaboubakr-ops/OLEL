# OLEL — Guide de démarrage rapide

Prérequis : **Node 20+** et **pnpm 9** (`npm i -g pnpm`).

## 1. Installer (une fois, à la racine du monorepo)
```bash
pnpm install
pnpm --filter @olel/ui build      # build du design system (requis par dashboard & mobile)
```

## 2. Tester les interfaces VISUELLEMENT (sans backend)
Les deux apps s'affichent avec des données de démonstration.

```bash
pnpm --filter @olel/dashboard dev   # → http://localhost:3000  (centre de commandement)
pnpm --filter @olel/mobile dev      # → http://localhost:3001  (app citoyen/sentinelle)
```

## 3. Pile complète (avec API + base + bot) via Docker
```bash
cp .env.example .env                # puis renseigner les secrets
docker compose up --build
```
Services : Postgres+PostGIS (5432), Redis (6379), API (4000), bot (3002), dashboard (3000), mobile (3001).

### Base de données (hors Docker)
```bash
cd backend
npx prisma generate
npx prisma migrate dev --name init  # ou: npx prisma db push
npm run db:seed                     # comptes & données de démo
```

## Comptes de démo (après seed)
| Rôle        | Téléphone        |
|-------------|------------------|
| Super admin | +221700000000    |
| Préfecture  | +221700000001    |
| Mairie      | +221700000002    |
| Sentinelle  | +221700000010    |
| Citoyen     | +221700000020    |
| Bot système | +221700000099    |

Les mots de passe ne sont plus journalisés (S-08). Valeurs par défaut surchargeables via les variables d'env `SEED_ADMIN_PASSWORD`, etc.

## État de compilation vérifié (2026-05-23)
- `@olel/backend` : `tsc --noEmit` ✅
- `@olel/bot` : `tsc --noEmit` ✅
- `@olel/dashboard` : `next build` ✅
- `@olel/mobile` : `next build` ✅
- `@olel/ui` : `tsup` build ✅
