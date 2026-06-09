# OLEL — Plateforme d'alerte précoce multi-risques

> **Projet STOP INONDATION — Matam / Gorgol (Sénégal–Mauritanie)**
> Sauver des vies en zone rurale enclavée, même sans 4G, même sans smartphone.

[![Sprint](https://img.shields.io/badge/Sprint-0%20GO-red)]()
[![Status](https://img.shields.io/badge/status-pilote%20en%20pr%C3%A9paration-orange)]()
[![Node](https://img.shields.io/badge/node-%E2%89%A520-green)]()
[![pnpm](https://img.shields.io/badge/pnpm-%E2%89%A59-blue)]()
[![License](https://img.shields.io/badge/license-propri%C3%A9taire-lightgrey)]()

---

## Sommaire

1. [Vision & contexte](#vision--contexte)
2. [Dernières mises à jour](#dernières-mises-à-jour)
3. [Fonctionnalités clés](#fonctionnalités-clés)
4. [Architecture](#architecture)
5. [Stack technique](#stack-technique)
6. [Démarrage rapide](#démarrage-rapide)
7. [Comptes de démo](#comptes-de-démo)
8. [Variables d'environnement](#variables-denvironnement)
9. [Structure du dépôt](#structure-du-dépôt)
10. [Roadmap & Sprints](#roadmap--sprints)
11. [Sécurité & conformité](#sécurité--conformité)
12. [Documentation complète](#documentation-complète)
13. [Contribuer](#contribuer)
14. [Licence & contacts](#licence--contacts)

---

## Vision & contexte

OLEL est une plateforme d'**alerte précoce multi-risques** (inondations, feux, urgences sanitaires) conçue pour les communes rurales du fleuve Sénégal. Elle combine :

- une **app mobile PWA** pour citoyens et sentinelles,
- un **dashboard de commandement** pour préfets, mairies, services techniques,
- un **bot WhatsApp** et des canaux **SMS / USSD / IVR** pour atteindre les zones sans data,
- un **moteur d'alertes géo-ciblées** (PostGIS) avec validation à plusieurs niveaux.

**Zone pilote** : commune de **Wuro-Mamadou** (Matam), 50 utilisateurs, 5 sentinelles, 1 préfet, 1 mairie. 6 semaines de pilote terrain prévues.

---

## Dernières mises à jour

### 🚀 2026-06-03 — **Sprint 0 GO lancé** (`SPRINT_0_GO.md`)

Tableau de bord opérationnel J1 → J14 : préparation infra + comptes externes + cadrage légal.

| Phase | Items | Statut | ETA |
|---|---|---|---|
| 🔴 Externe P0 | Meta WhatsApp, Africa's Talking, VPS, DNS, Secrets | À démarrer URGENT | J1-J14 |
| 🔴 Dev P0 | Storage photos, MFA, USSD, rate-limit OTP | Dev active | J1-S2 |
| 🔴 Légal P0 | DPO, CDP, Privacy Policy, ToS | Avocat engagé | S1-S4 |
| 🟠 P1 | Tests E2E, admin, monitoring | Après déploiement | S2+ |

**Chemin critique** : validation Meta (2-3 sem) + USSD shortcode Africa's Talking (5-15 j) → tout démarre J1.

### 🛠️ 2026-05-23 — État de compilation vérifié

- `@olel/backend` : `tsc --noEmit` ✅
- `@olel/bot` : `tsc --noEmit` ✅
- `@olel/dashboard` : `next build` ✅
- `@olel/mobile` : `next build` ✅
- `@olel/ui` : `tsup` build ✅

### 🔐 Sécurité — correctifs récents

- **S-08** : mots de passe seed retirés des journaux ; surcharge via `SEED_*_PASSWORD`.
- **M-04** : `.env*` exclus du dépôt (sauf `.env.example`), `secrets/` ignoré.
- **MFA TOTP** : chiffrement AES avec `TOTP_ENCRYPTION_KEY` (≥ 32 chars).

---

## Fonctionnalités clés

### Pour les citoyens & sentinelles (mobile / WhatsApp / USSD)
- Signaler une **crue, un feu, une urgence sanitaire** en 3 taps (ou 3 touches USSD `*123#`).
- Recevoir des **alertes géo-ciblées** sur la zone d'habitation.
- Mode **offline-first** : signalement enregistré localement puis synchronisé.
- **IVR (vocal)** pour les utilisateurs analphabètes — message dans la langue locale.

### Pour les autorités (dashboard)
- **Carte temps réel** des signalements (Mapbox / OpenStreetMap).
- **Validation à 2 niveaux** : sentinelle terrain → mairie / préfecture.
- **Diffusion d'alertes** multicanal (push, SMS, WhatsApp, IVR) ciblées par zone PostGIS.
- **Suivi statistique** : signalements/jour, temps de réponse, zones critiques.
- **Module admin** : gestion zones, utilisateurs, rôles, audit log RGPD.

### Multi-risques (extensible)
Inondation • Feux de brousse • Urgences sanitaires • (à venir : ruptures de digues, attaques de troupeaux, conflits agro-pastoraux).

---

## Architecture

### Vue d'ensemble (cible V2)

```
                            ┌─────────────────────────┐
                            │  Cloudflare WAF + CDN   │
                            │  DNS · DDoS · TLS       │
                            └────────┬────────────────┘
                                     │ HTTPS / WSS
       ┌─────────────────────────────┼────────────────────────────┐
       ▼                             ▼                            ▼
┌──────────────┐            ┌──────────────┐           ┌────────────────────┐
│ app.olel.sn  │            │ m.olel.sn    │           │  api.olel.sn       │
│ Dashboard    │            │ Mobile PWA   │           │  NestJS (HA x4)    │
│ (autorités)  │            │ (citoyens)   │           │                    │
└──────────────┘            └──────────────┘           └─────────┬──────────┘
                                                                 │
                                ┌────────────────────────────────┤
                                ▼                                ▼
                       ┌──────────────────┐           ┌────────────────────┐
                       │ Postgres+PostGIS │           │  Redis (Bull/cache)│
                       │ replica + backup │           │  MinIO/R2 (médias) │
                       └──────────────────┘           └────────────────────┘

┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ bot.olel.sn  │  │ ussd.olel.sn │  │ ivr.olel.sn  │  ← Africa's Talking + Meta Cloud
└──────────────┘  └──────────────┘  └──────────────┘
```

### Architecture MVP (V0 — pilote 6 semaines)

Tout simplifié sur **1 VPS Hostinger 8 GB** : backend mono-instance, Postgres, Redis, MinIO, Nginx + Certbot. Détails dans [`ARCHITECTURE_OLEL.md`](./ARCHITECTURE_OLEL.md).

---

## Stack technique

| Couche | Technologie |
|---|---|
| **Monorepo** | pnpm workspaces + Turborepo |
| **Backend** | NestJS 10, Prisma, Postgres 16 + PostGIS 3.4, Redis 7, Bull |
| **Dashboard** | Next.js 14 (App Router), TanStack Query, Tailwind, Mapbox GL |
| **Mobile** | Next.js PWA + Capacitor (Android APK V1) |
| **Bot** | NestJS webhook WhatsApp Cloud API |
| **Design system** | `@olel/ui` (tsup, React, Tailwind) |
| **Canaux externes** | Meta WhatsApp Cloud, Africa's Talking (SMS/USSD/IVR), Firebase FCM |
| **Observabilité** | Sentry, UptimeRobot, Prometheus + Grafana, Loki |
| **Sécurité** | JWT + refresh tokens, TOTP MFA (AES), Helmet, CSP, rate-limit Redis |
| **Infra** | Docker Compose (dev) → VPS Hostinger + Cloudflare (prod) |
| **CI/CD** | GitHub Actions (`pnpm typecheck` + `pnpm build` à chaque PR) |

---

## Démarrage rapide

### Prérequis
- **Node ≥ 20**
- **pnpm ≥ 9** (`npm i -g pnpm`)
- **Docker** + **Docker Compose** (pour la pile complète)

### 1. Installation (une fois)

```bash
pnpm install
pnpm --filter @olel/ui build      # build du design system (requis par dashboard & mobile)
```

### 2. Tester les interfaces visuellement (sans backend)

Les deux apps s'affichent avec des données de démo.

```bash
pnpm --filter @olel/dashboard dev   # → http://localhost:3000
pnpm --filter @olel/mobile dev      # → http://localhost:3001
```

### 3. Pile complète (API + DB + bot) via Docker

```bash
cp .env.example .env                # renseigner les secrets
docker compose up --build
```

| Service | Port | URL |
|---|---|---|
| Postgres + PostGIS | 5434 | `postgresql://olel:***@localhost:5434/olel` |
| Redis | 6380 | `redis://localhost:6380` |
| Backend API | 4000 | http://localhost:4000 |
| Dashboard | 3000 | http://localhost:3000 |
| Mobile PWA | 3001 | http://localhost:3001 |
| Bot WhatsApp | 3002 | http://localhost:3002 |
| Adminer (profil `dev`) | 8080 | http://localhost:8080 |

### 4. Base de données (hors Docker)

```bash
cd backend
npx prisma generate
npx prisma migrate dev --name init   # ou: npx prisma db push
npm run db:seed                      # crée comptes & données de démo
```

### 5. Scripts utiles (racine)

```bash
pnpm dev               # turbo run dev (toutes les apps)
pnpm build             # build production
pnpm lint              # lint global
pnpm type-check        # tsc --noEmit partout
pnpm test              # tests unitaires
pnpm dev:dashboard     # dashboard seul
pnpm dev:mobile        # mobile seul
pnpm dev:backend       # backend seul
pnpm dev:bot           # bot seul
```

---

## Comptes de démo

Disponibles après `npm run db:seed`. Les mots de passe ne sont **plus journalisés** (correctif S-08) — surcharger via `SEED_*_PASSWORD` au besoin.

| Rôle        | Téléphone        |
|-------------|------------------|
| Super admin | +221700000000    |
| Préfecture  | +221700000001    |
| Mairie      | +221700000002    |
| Sentinelle  | +221700000010    |
| Citoyen     | +221700000020    |
| Bot système | +221700000099    |

---

## Variables d'environnement

Voir [`.env.example`](./.env.example) pour la liste exhaustive. Catégories principales :

| Bloc | Variables |
|---|---|
| **Base de données** | `DATABASE_URL`, `POSTGRES_PASSWORD` |
| **Redis** | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` |
| **Auth** | `JWT_SECRET`, `JWT_REFRESH_SECRET` (≥ 32 chars) |
| **MFA TOTP** | `TOTP_ENCRYPTION_KEY` (≥ 32 chars en prod, sinon AES s'arrête) |
| **Backend** | `PORT`, `NODE_ENV`, `WS_PUBLIC_ORIGIN` |
| **WhatsApp Cloud** | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` |
| **Africa's Talking** | `AFRICAS_TALKING_KEY`, `AFRICAS_TALKING_USER` |
| **Cartographie** | `MAPBOX_TOKEN` (optionnel) |
| **Bot interne** | `BOT_API_KEY` |
| **Seed (optionnel)** | `SEED_ADMIN_PASSWORD`, `SEED_PREFET_PASSWORD`, `SEED_SENTINELLE_PASSWORD`, `SEED_CITOYEN_PASSWORD` |

> ⚠️ **Sécurité** : `.env*` est exclu du dépôt. Ne jamais committer de secrets. Générer en prod avec `openssl rand -hex 32`.

---

## Structure du dépôt

```
OLEL/
├── apps/
│   ├── dashboard/        # Next.js — centre de commandement (autorités)
│   ├── mobile/           # Next.js PWA — citoyens & sentinelles
│   └── bot/              # NestJS — webhook WhatsApp Cloud
├── backend/              # NestJS API + Prisma + workers Bull
├── packages/
│   └── ui/               # Design system @olel/ui (React + Tailwind + tsup)
├── docker-compose.yml        # Stack complète (prod-like)
├── docker-compose.dev.yml    # Dev local (DB + Redis seulement)
├── pnpm-workspace.yaml
├── turbo.json
└── docs/ (à la racine)
    ├── ARCHITECTURE_OLEL.md
    ├── AUDIT_OLEL_EXHAUSTIF.md
    ├── AUDIT_PREDEPLOIEMENT_V2.md
    ├── ROADMAP_OLEL.md
    ├── SECURITY_BLUEPRINT_OLEL.md
    ├── SPRINT_0_GO.md           ← tableau de bord live
    ├── CHECKLIST_DEPLOIEMENT.md
    ├── GUIDE_DEPLOIEMENT.md
    ├── UX_UI_AUDIT.md
    ├── WORKFLOWS_SCENARIOS_OLEL.md
    ├── CURSUS_ALERTE.md
    ├── TEST_PLAN.md
    └── TEST_LAN.md
```

---

## Roadmap & Sprints

12 semaines, 6 personnes, objectif **pilote Matam en production**.

| Sprint | Durée | Thème | Livrable clé |
|---|---|---|---|
| **0** ⏳ | S 1-2 | Préparation, gouvernance, infra | VPS prêt · CI active · comité de pilotage tenu |
| **1** | S 3-4 | Sécurité critique + USSD MVP | MFA obligatoire · menu `*123#` opérationnel |
| **2** | S 5-6 | Résilience offline + tests | Tuiles offline · smoke + E2E verts |
| **3** | S 7-8 | Admin + audit + conformité | Page admin · logs RGPD · CGU acceptées |
| **4** | S 9-10 | Monitoring + bots validés | Sentry · Grafana · templates Meta approuvés |
| **5** | S 11-12 | Pilote terrain Wuro-Mamadou | Formation sentinelles · lancement live |

Détails complets : [`ROADMAP_OLEL.md`](./ROADMAP_OLEL.md) — suivi quotidien : [`SPRINT_0_GO.md`](./SPRINT_0_GO.md).

---

## Sécurité & conformité

- **JWT** access + refresh tokens, rotation côté serveur.
- **MFA TOTP** obligatoire pour rôles MAIRIE et au-dessus (clés chiffrées AES).
- **Rate-limit OTP** : 3/numéro/min, 5/numéro/jour ; verrouillage après 10 échecs.
- **Headers durcis** : HSTS preload, CSP avec `report-uri`, X-Frame-Options, etc.
- **CORS strict** en prod via `ALLOWED_ORIGINS`.
- **Validation DTO** exhaustive (`class-validator`).
- **Idempotency-Key** sur `POST /alerts` et `PATCH /validate`.
- **Backups Postgres** chiffrés vers Wasabi, restore testé.
- **RGPD / loi sénégalaise 2008-12** : déclaration CDP, DPO désigné, Privacy Policy + ToS rédigés par avocat.
- **Audit log** complet (qui valide quelle alerte, quand, depuis quelle IP).

Plan détaillé : [`SECURITY_BLUEPRINT_OLEL.md`](./SECURITY_BLUEPRINT_OLEL.md).

---

## Documentation complète

| Document | Objet |
|---|---|
| [`DEMARRAGE.md`](./DEMARRAGE.md) | Démarrage rapide condensé |
| [`ARCHITECTURE_OLEL.md`](./ARCHITECTURE_OLEL.md) | Architecture MVP → V2 |
| [`ROADMAP_OLEL.md`](./ROADMAP_OLEL.md) | Roadmap Sprints 0 à 5 |
| [`SPRINT_0_GO.md`](./SPRINT_0_GO.md) | Tableau de bord opérationnel J1-J14 |
| [`AUDIT_OLEL_EXHAUSTIF.md`](./AUDIT_OLEL_EXHAUSTIF.md) | Audit code & sécurité complet |
| [`AUDIT_PREDEPLOIEMENT_V2.md`](./AUDIT_PREDEPLOIEMENT_V2.md) | Checklist pré-déploiement V2 |
| [`AUDIT_README.md`](./AUDIT_README.md) | Synthèse audits |
| [`SECURITY_BLUEPRINT_OLEL.md`](./SECURITY_BLUEPRINT_OLEL.md) | Modèle de menace & contrôles |
| [`CHECKLIST_DEPLOIEMENT.md`](./CHECKLIST_DEPLOIEMENT.md) | Checklist mise en prod |
| [`GUIDE_DEPLOIEMENT.md`](./GUIDE_DEPLOIEMENT.md) | Guide pas-à-pas VPS / Docker / Certbot |
| [`UX_UI_AUDIT.md`](./UX_UI_AUDIT.md) | Audit UX/UI |
| [`WORKFLOWS_SCENARIOS_OLEL.md`](./WORKFLOWS_SCENARIOS_OLEL.md) | Scénarios usage métier |
| [`CURSUS_ALERTE.md`](./CURSUS_ALERTE.md) | Cursus de formation sentinelles |
| [`TEST_PLAN.md`](./TEST_PLAN.md) · [`TEST_LAN.md`](./TEST_LAN.md) | Plans de test |
| [`deep-research-report.md`](./deep-research-report.md) | Recherche terrain & benchmarks |

---

## Contribuer

1. **Branches** : `main` (prod) · `staging` · `develop` · feature branches `claude/*` ou `feat/*`.
2. **Protection** : PR review obligatoire avant merge sur `main` / `staging`.
3. **CI** : `pnpm type-check` + `pnpm build` doivent passer.
4. **Commits** : style conventionnel recommandé (`feat:`, `fix:`, `chore:`, `docs:`).
5. **Issues** : labels `P0`, `P1`, `blocked`, `urgent`.

Standup daily 9h UTC pendant les Sprints 0-1.

---

## Licence & contacts

- **Licence** : propriétaire — usage restreint au projet STOP INONDATION (Matam / Gorgol).
- **Porteur** : projet STOP INONDATION.
- **Contact technique** : voir comité de pilotage interne.
- **Sécurité** : remontée des vulnérabilités via canal privé (pas d'issue publique).

---

*Dernière mise à jour du README : 2026-06-09 — Sprint 0 en cours.*
