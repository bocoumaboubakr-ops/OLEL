# OLEL — Checklist avant déploiement production

Référence : `GUIDE_DEPLOIEMENT.md` détaille les étapes opérationnelles (Hostinger VPS, Nginx, Certbot). Cette checklist liste les **prérequis fonctionnels et sécurité** à valider avant de lancer un déploiement.

Statut au **2026-05-31** : la stack est fonctionnellement complète (phases A→E vérifiées par compilation rc=0 sur backend, ui, dashboard, mobile, bot). Les points ci-dessous sont les gaps à fermer pour passer en production.

---

## 1. Code & build

| Item | Statut | Remarque |
|---|---|---|
| Audit 38 points corrigés | ✅ Done | Voir `olel_audit_fixes_tracker` |
| Phase A (8 onglets dashboard) | ✅ Done | |
| Phase B (formations + missions) | ✅ Done | |
| Phase C (auth mobile OTP + zone) | ✅ Done | |
| Phase D (sentinelle complète) | ✅ Done | Voir `olel_feature_completeness` |
| Phase E (scaffolding Capacitor) | ✅ Done | APK : `npx cap add android` côté dev machine |
| Compilations rc=0 | ✅ Done | backend tsc, ui tsup, dashboard build, mobile build, bot tsc |
| Tests unitaires | ⬜ TODO | Aucun test Jest présent. Recommandé : couvrir auth + validate alert. |
| Tests E2E | ⬜ TODO | `scripts/smoke-test.ps1` couvre l'API ; rien sur l'UI. |
| Lint / format | 🟧 Partiel | Prettier configuré, ESLint à étendre |

## 2. Base de données

| Item | Statut | Action |
|---|---|---|
| Schéma Prisma stable | ✅ Done | 19 modèles, indexes, contraintes uniques |
| Migration initiale versionnée | ⬜ **TODO bloquant** | `npx prisma migrate dev --name init` puis commit `backend/prisma/migrations/` |
| Politique de backup | ⬜ TODO | Cron daily `pg_dump`, rétention 30 j (voir GUIDE_DEPLOIEMENT §sauvegardes) |
| Réplique lecture (optionnel) | ⬜ Optionnel | Si > 10k alertes/jour |

> ⚠️ **Bloquant** : sans migration versionnée, `db push` peut écraser des données en prod. Générer la migration AVANT le 1er deploy.

## 3. Secrets & configuration

| Item | Statut | Action |
|---|---|---|
| `.env.example` complet | ✅ Done | Toutes les vars requises listées |
| `JWT_SECRET` ≥ 32 chars | ⬜ À générer | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` ≥ 32 chars | ⬜ À générer | Idem |
| `TOTP_ENCRYPTION_KEY` ≥ 32 chars | ⬜ À générer | Idem (sinon AES s'arrête au boot) |
| `WHATSAPP_APP_SECRET` Meta | ⬜ À récupérer | Dashboard Meta Business |
| `WHATSAPP_TOKEN` permanent | ⬜ À récupérer | Système Token Meta |
| `BOT_API_KEY` ≥ 32 chars | ⬜ À générer | |
| Secrets stockés hors repo | ⬜ À vérifier | `.env` dans `.gitignore` ✅, dans secret manager prod (Vault, Doppler, ou env Hostinger) |

## 4. Sécurité réseau

| Item | Statut | Action |
|---|---|---|
| HTTPS sur tous les sous-domaines | ⬜ TODO | Certbot via Nginx (voir GUIDE) |
| HSTS activé | ⬜ TODO | Helmet déjà installé, vérifier en prod |
| CSP strict | ✅ Done | S-05 |
| Rate limit auth | 🟧 Partiel | `/auth/refresh` 10/min ✅ ; `/auth/otp/request` à ajouter (anti-pumping SMS) |
| HMAC webhook WhatsApp | ✅ Done | S-02 |
| CORS restreint en prod | ⬜ À vérifier | Définir `WS_PUBLIC_ORIGIN=https://app.olel.sn` |
| Firewall VPS | ⬜ TODO | Ports 22/80/443 uniquement |

## 5. Résilience

| Item | Statut | Remarque |
|---|---|---|
| Notifications DLQ | ✅ Done | R-02 (échec final persisté en table) |
| Redis fail-fast (circuit breaker) | ✅ Done | R-05 |
| Reconnect WS dashboard | ✅ Done | R-04 (backoff exponentiel) |
| File offline mobile | ✅ Done | R-06 (IndexedDB + rejeu online) |
| Health check API | ✅ Done | Swagger UI accessible, conteneur Docker healthcheck |
| Service Worker Background Sync | ⬜ Optionnel | Amélioration future |

## 6. Monitoring & observabilité

| Item | Statut | Action |
|---|---|---|
| Logs structurés | ✅ Done | Nest Logger JSON activable |
| Centralisation logs | ⬜ TODO | Loki, Sentry ou Better Stack |
| Métriques Prometheus | ⬜ TODO | `@nestjs/terminus` à câbler |
| Alerting SRE | ⬜ TODO | Uptime monitor sur `/api/v1/zones` |
| Bull Board (file Redis) | ⬜ Optionnel | `bull-board` pour visualiser la file |

## 7. Documentation & runbook

| Item | Statut |
|---|---|
| `DEMARRAGE.md` | ✅ Done |
| `GUIDE_DEPLOIEMENT.md` (VPS Hostinger) | ✅ Done |
| `TEST_LAN.md` (test téléphone + ordi) | ✅ Done |
| `TEST_PLAN.md` (recette manuelle) | ✅ Done |
| `apps/mobile/CAPACITOR.md` | ✅ Done |
| Runbook incident | ⬜ TODO | Procédures rollback, restore DB, rotation secrets |
| API publique documentée | ✅ Done | Swagger `/api/docs` |

## 8. Packaging mobile

| Item | Statut | Action |
|---|---|---|
| Scaffolding Capacitor | ✅ Done | `apps/mobile/capacitor.config.ts` |
| `npx cap add android` | ⬜ TODO | À faire sur poste avec Android Studio |
| `npx cap add ios` | ⬜ TODO | À faire sur Mac avec Xcode |
| Build APK signé | ⬜ TODO | Keystore + Gradle signing config |
| Icônes / splash | ⬜ TODO | Générer via `capacitor-assets` |
| Publication Play Store | ⬜ TODO | Compte Google Play Developer |
| Publication App Store | ⬜ Optionnel | Compte Apple Developer |

## 9. WhatsApp Business

| Item | Statut |
|---|---|
| Compte Meta Business actif | ⬜ TODO |
| Numéro WhatsApp Business validé | ⬜ TODO |
| Templates de messages approuvés (4 langues) | ⬜ TODO |
| Webhook prod configuré (`/webhook`) | ⬜ TODO |
| Permissions API : `messages` + `messaging` | ⬜ TODO |

## 10. Légal & RGPD

| Item | Statut |
|---|---|
| Politique de confidentialité | ⬜ TODO |
| Conditions générales d'utilisation | ⬜ TODO |
| Mentions légales | ⬜ TODO |
| Registre des traitements (RGPD) | ⬜ TODO |
| DPA avec sous-traitants (Meta, Africa's Talking) | ⬜ TODO |

---

## Synthèse : ce qui bloque vraiment le déploiement

Les items **bloquants techniques** restants :

1. **Migration Prisma initiale** — sans ça, pas de schéma versionné en prod.
2. **Secrets prod générés** — JWT, TOTP, BOT_API_KEY.
3. **WhatsApp Business validé** — sinon le bot ne reçoit aucun message réel.
4. **Domaine + DNS + HTTPS** — Hostinger : `api.olel.sn`, `app.olel.sn`, `m.olel.sn`, `bot.olel.sn` + Certbot.
5. **Backup automatisé** — sans backup, on ne peut pas opérer la prod.

Tout le reste est soit fait (✅), soit optionnel pour un MVP terrain.

---

## Premier déploiement — séquence recommandée

1. Générer secrets : `openssl rand -hex 32 > secrets.txt` (× 4 lignes)
2. Acheter / configurer VPS Hostinger + domaine `olel.sn`
3. Suivre `GUIDE_DEPLOIEMENT.md` (Docker + Nginx + Certbot)
4. Migration initiale Prisma + seed prod (sans comptes démo)
5. Configurer monitoring (Sentry minimum)
6. Tests d'acceptation selon `TEST_PLAN.md` (sections 1, 2, 3)
7. Activer webhook WhatsApp pointant sur `https://bot.olel.sn/webhook`
8. Mise en service progressive (zone pilote : Wuro-Mamadou)
