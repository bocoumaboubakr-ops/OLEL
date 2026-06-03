# OLEL — Roadmap Sprint 0 → 5 vers pilote Matam

**Équipe cible** : 3 devs full-stack + 1 SRE/DevSecOps + 1 PM/UX + 1 référent terrain Matam = **6 personnes**.
**Cadence** : 2 semaines / sprint = **12 semaines** au total (3 mois).
**Objectif Sprint 5** : pilote Matam en production, 50 utilisateurs, 5 sentinelles, 1 préfet, 1 mairie, 1 zone (Wuro-Mamadou).

> **Principe d'arbitrage** : tout ce qui n'est pas indispensable à *sauver une vie* sur le pilote est repoussé en V1.

---

## Vue d'ensemble

| Sprint | Durée | Thème principal | Objectif final |
|---|---|---|---|
| **0** | 2 sem | Préparation, gouvernance, secrets, infra | VPS prêt, pipeline CI, comité de pilotage tenu |
| **1** | 2 sem | Sécurité critique + télécoms USSD | MFA forcé, USSD MVP fonctionnel |
| **2** | 2 sem | Résilience offline + tests | Tuiles offline, smoke + E2E verts |
| **3** | 2 sem | Centre admin + audit + conformité | Page admin, logs RGPD, CGU acceptées |
| **4** | 2 sem | Monitoring + bots WhatsApp validés | Sentry, Grafana, templates Meta approuvés |
| **5** | 2 sem | Pilote terrain Wuro-Mamadou | Formation sentinelles, lancement live |

---

## SPRINT 0 — Préparation (semaines 1-2)

> **Objectif** : avant d'écrire la moindre ligne de code, mettre en place les fondations humaines et infra. Sans ça, les sprints suivants partiront en vrille.

### Livrables
- [ ] Comité de pilotage constitué (5 personnes) + 1ʳᵉ réunion tenue
- [ ] DPO désigné (interne ou prestataire)
- [ ] Déclaration CDP (Commission de protection des données Sénégal) déposée
- [ ] Compte Meta Business créé + numéro WhatsApp dédié réservé
- [ ] Compte Africa's Talking créé + crédits 100 € + USSD shortcode demandé
- [ ] VPS Hostinger 8 GB commandé + accès SSH partagé en équipe
- [ ] Domaine `olel.sn` acheté + DNS Cloudflare configuré (4 sous-domaines : api, app, m, bot)
- [ ] Certbot installé sur VPS, certificats émis pour 4 sous-domaines
- [ ] GitHub repo créé + branches `main`, `staging`, `develop` + protection branches
- [ ] GitHub Actions CI minimal (`pnpm typecheck` + `pnpm build`) actif
- [ ] Secrets prod générés (`openssl rand -hex 32` × 5) et stockés dans Vault dev OU SOPS chiffré
- [ ] Sentry compte créé + DSN par environnement

### Fonctionnalités (code)
- Aucune.

### Dépendances
- Validation préfecture Matam pour pilote.
- Accès aux contacts ANSDR.

### Risques
- **Validation Meta WhatsApp** : peut prendre 1-2 semaines. Démarrer dès le J1.
- **USSD shortcode Africa's Talking** : 5-15 jours pour attribution numéro court.

---

## SPRINT 1 — Sécurité critique + USSD MVP (semaines 3-4)

> **Objectif** : fermer les trous P0 sécurité et délivrer la fonctionnalité télécom #1 pour le rural.

### Livrables
- [ ] **MFA obligatoire** pour rôles MAIRIE+ (middleware bloquant, écran d'enrôlement TOTP au 1ᵉʳ login)
- [ ] **Rate limit OTP** (3/numéro/min, max 5/numéro/jour) + verrouillage compte après 10 échecs login (Redis counter)
- [ ] **Validation DTOs exhaustive** (`@MaxLength`, `@Matches` sur phones)
- [ ] **CORS strict prod** (`ALLOWED_ORIGINS` env var, refus si origin absent)
- [ ] **Headers sécurité prod** vérifiés (HSTS preload, CSP testé via report-uri)
- [ ] **Idempotency-Key** sur POST `/alerts` et PATCH `/validate`
- [ ] **Politique mot de passe** : zxcvbn front + HIBP check + min 10 chars autorités
- [ ] **Backups automatiques quotidiens** Postgres → Wasabi chiffré (cron + script de test restore)
- [ ] **Module USSD** : `POST /ussd/callback` (Africa's Talking), menu 3 niveaux (zone → risque → confirmation), création `Alert` avec `source=USSD`
- [ ] Tests Jest sur `auth.service` + `alerts.service` (objectif 50% coverage)

### Fonctionnalités utilisateur visibles
- Menu USSD `*123#` fonctionnel pour signaler une crue/feu/santé sans data.
- Préfet refuse de se connecter sans MFA actif (UX onboarding TOTP).

### Dépendances Sprint 0
- Africa's Talking USSD shortcode (sinon code = endpoint dev mock).
- Secrets Vault accessibles.

### Risques
- **Africa's Talking USSD sandbox** très limitée (1 zone test). Risque de découvrir des bugs en prod.

---

## SPRINT 2 — Résilience offline + tests (semaines 5-6)

> **Objectif** : garantir que l'app marche dans le bus, dans un village 2G, et qu'un développeur peut refactorer sans casser.

### Livrables
- [ ] **Service Worker** complet avec Workbox : précache assets + `BackgroundSyncPlugin` pour POST /alerts
- [ ] **Tuiles cartographiques offline** (Leaflet-offline) zones Matam aux zooms 8/10/12 (~200 MB)
- [ ] **Manifest PWA installable** (`apps/mobile/public/manifest.webmanifest`, icônes 192/512/maskable)
- [ ] **Image compression** côté client (canvas resize, JPEG 70%, max 800 px)
- [ ] **Pagination cursor-based** sur `/alerts` (max 50 par page)
- [ ] **Tests E2E Playwright** : 3 scénarios (login citoyen, signalement, validation sentinelle)
- [ ] **Test de charge k6** : 500 utilisateurs simultanés, < 200 ms p95
- [ ] **Smoke test** intégré au pipeline CI (sur staging)
- [ ] **Geo-référentiel** : intégrer limites communes Matam (geojson) + cours d'eau Sénégal

### Fonctionnalités utilisateur visibles
- App utilisable hors-ligne pendant 24h, synchronisation auto au retour réseau.
- Photo signalement instantanée même en 2G.

### Dépendances
- Sprint 1 (auth stable pour les tests E2E).

### Risques
- **Service Worker + Next 14** : configuration délicate, prévoir 3-4 j sur ce point seul.

---

## SPRINT 3 — Centre admin + conformité RGPD/CDP (semaines 7-8)

> **Objectif** : tout ce qui n'a pas été développé côté admin + tout ce qui est légalement obligatoire.

### Livrables
- [ ] **Page `/dashboard/admin/users`** : CRUD utilisateurs avec rôles
- [ ] **Page `/dashboard/admin/zones`** : CRUD zones géographiques
- [ ] **Page `/dashboard/admin/settings`** : config système (templates broadcast, numéros d'urgence par zone)
- [ ] **Page `/dashboard/admin/audit`** : viewer du modèle `AuditLog` avec filtres (acteur, type, date, action)
- [ ] **Page `/dashboard/admin/trainings`** : gestion des modules de formation
- [ ] **Soft delete** utilisateurs + endpoints `GET /users/me/export` (JSON) et `DELETE /users/me`
- [ ] **Consent management** : modal login (CGU + Politique de confidentialité), modèle `Consent` Prisma (versions + dates)
- [ ] **Documents légaux** : `LEGAL/privacy-policy.md`, `LEGAL/terms-of-service.md`, `LEGAL/cookies-policy.md`
- [ ] **Politique d'usage acceptable** : `GOVERNANCE.md` + `ESCALATION_POLICY.md`
- [ ] **Runbook breach** : `INCIDENT_DATA_BREACH.md` (CDP notifiée < 72h)

### Fonctionnalités utilisateur visibles
- Super admin peut créer/modifier utilisateurs sans appeler dev.
- Footer mobile et dashboard linke vers CGU et confidentialité.
- Login bloque tant que CGU non acceptées.

### Dépendances
- Sprint 0 (DPO désigné pour valider docs légaux).

### Risques
- **Validation juridique** : faire relire par avocat sénégalais (Cabinet Sarr & Associés par ex). Compter 2-3 j de back-and-forth.

---

## SPRINT 4 — Observabilité + WhatsApp prod (semaines 9-10)

> **Objectif** : on doit pouvoir voir si OLEL tombe et comprendre pourquoi. Et WhatsApp doit envoyer pour de vrai.

### Livrables
- [ ] **Sentry intégré** (backend + dashboard + mobile + bot) avec source maps
- [ ] **Health checks** `@nestjs/terminus` : `/health/live`, `/health/ready` (DB, Redis, MinIO)
- [ ] **Métriques Prometheus** `/metrics` (requests, latence p50/p95/p99, queue size Bull)
- [ ] **Grafana** + 5 dashboards (API, DB, Bull, WS, business KPIs)
- [ ] **Alertmanager** vers Telegram groupe OPS (4 règles : API 5xx > 1%, DB conn > 80%, queue lag > 5 min, instance down)
- [ ] **Loki + Promtail** pour logs centralisés (rétention 30 j)
- [ ] **UptimeRobot** sur `/health/live` toutes 5 min, fallback notif Telegram
- [ ] **PostHog** self-hosted pour analytics produit (events : `report_submitted`, `alert_validated`, `broadcast_sent`)
- [ ] **Templates WhatsApp validés** : 10 templates × 4 langues approuvés sur Meta Business
- [ ] **Webhook prod** WhatsApp Business pointant sur `https://bot.olel.sn/webhook` (HMAC actif)
- [ ] **Fallback channels** : si WhatsApp KO → SMS auto (politique `notificationStrategy`)
- [ ] **Cost log** : table `cost_log` + dashboard "coût par alerte par canal"

### Fonctionnalités utilisateur visibles
- Préfet voit des dashboards Grafana avec stats régionales.
- WhatsApp Business officiel reçoit signalements citoyens, répond multilingue.

### Dépendances
- Sprint 0 (compte Meta).
- Sprint 1 (USSD opérationnel pour ne pas dépendre 100% de WhatsApp).

### Risques
- **Validation Meta des templates** : 24-72h par template. Démarrer dès Sprint 0.
- **Découverte bugs en charge** : Grafana peut révéler des points chauds. Prévoir 2 j de buffer.

---

## SPRINT 5 — Pilote terrain Wuro-Mamadou (semaines 11-12)

> **Objectif** : du fonctionnel propre, à du fonctionnel **utilisé**.

### Pre-launch (semaine 11)
- [ ] **Formation sentinelles** : 5 personnes Wuro-Mamadou, 2 demi-journées présentiel
  - 1 module Secourisme (Croix-Rouge sénégalaise)
  - 1 module Spécifique inondation (sécurité berge + signes annonciateurs)
  - Test pratique : signaler + vérifier 3 alertes simulées
- [ ] **Formation préfet et mairie** : 1 demi-journée dashboard + procédures escalade
- [ ] **Pré-population zone** : utilisateurs, sentinelles, mairie, préfecture créés
- [ ] **Briefing communautaire** : annonce via radio locale + mosquée + affiches (Pulaar / Soninké)
- [ ] **Test d'évacuation simulé** avec sentinelles : 1 alerte test crue (orange) → broadcast → mesure du délai

### Launch (semaine 12)
- [ ] **Lancement live** lundi semaine 12
- [ ] **Hotline support dédiée** (1 dev OLEL + 1 référent terrain) WhatsApp + tél, 7j/7 8h-20h pendant 2 semaines
- [ ] **Debrief journalier** premiers 5 jours (équipe + référent terrain)
- [ ] **Métriques d'impact** suivies daily :
  - Signalements reçus / vérifiés / diffusés
  - Délai médian signalement → diffusion (cible < 15 min)
  - Couverture estimée broadcast (sondage WhatsApp)
- [ ] **Rapport semaine 1** envoyé au comité de pilotage + bailleurs

### Risques
- **Adoption faible** : si < 20 signalements semaine 1, ré-évaluer marketing local.
- **Faux signalements** : prévoir politique de modération (sentinelles peuvent reject + commentaire).
- **Saturation 4G** : prévoir un fallback SMS / USSD pour les diffusions.

---

## Backlog différé en V1 (M+4 à M+6)

| Item | Justif différé |
|---|---|
| IVR multilingue | Africa's Talking + TTS = développement + coût avant retour terrain |
| Push FCM Android | Pilote utilise PWA + WhatsApp comme push de fait |
| APK signé Play Store | PWA suffit pour 50 utilisateurs |
| Détection doublons IA | Pas indispensable à 50 utilisateurs |
| Heat maps dashboard | Confort, pas critique |
| Geocodage inverse | Affichage `lat/lng` brut OK pour MVP |
| Tests de charge automatisés | Compléments Sprint 2 |
| Multi-langues dashboard | Préfet francophone |
| Bot WhatsApp avancé (NLU) | Réponses scriptées suffisent au pilote |

---

## Backlog V2 (M+6 à M+12)

| Item | Justif |
|---|---|
| Multi-zone HA (2ᵉ VPS Paris) | Si pilote concluant et extension 5 communes |
| iOS App Store | Si demande utilisateurs Apple |
| Modèle IA prédiction crue | Besoin de 6+ mois d'historique pour entraîner |
| Classification NLP multilingue | Idem |
| Transcription Whisper | Coût + besoin réel à valider |
| SIEM externalisé | Quand volume justifie coût ~500 €/mo |
| Metabase BI | Quand bailleurs demandent rapports custom |

---

## Arbitrages clés assumés

| Décision | Pourquoi | Conséquence |
|---|---|---|
| Pas de React Native | Time-to-market | Capacitor moins performant que natif pur, OK pour MVP |
| Pas de microservices | Complexité injustifiée | Modular monolith NestJS, refactor possible plus tard |
| Pas de Kubernetes | Surcoût opérationnel | Docker compose + Nginx, scale vertical possible |
| Pas d'IA en MVP | Pas de données pour entraîner | Heuristiques simples, IA en V2 |
| Pas de Twilio | Africa's Talking moins cher pour Afrique | Single point of failure à mitiger V2 |
| Pas de PostgreSQL managé (AWS RDS) | Coût | SRE gère backup/restore manuellement |
| Hostinger Dakar | Latence + coût | Si Dakar tombe, OLEL tombe. V2 = 2ᵉ VPS Paris |

---

## Risques transverses

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Validation Meta WhatsApp retardée | Moyenne | Élevé | Démarrer J1 + fallback SMS |
| Adoption sentinelles faible | Moyenne | Critique | Onboarding terrain intensif Sprint 5 |
| Coût Africa's Talking dépasse budget | Faible | Moyen | Plafond mensuel + alertes |
| Bug critique en prod sans monitoring (Sprint 4 pas fini) | Élevée si zone pilote avant Sprint 4 | Critique | Respecter ordre des sprints, surtout 4 avant 5 |
| Catastrophe réelle pendant pilote | Plausible (saison pluies) | OPPORTUNITÉ + risque | Préparer hotline 24/7, presse |
| Compte Meta suspendu (signalement abusif) | Faible | Critique | Templates conformes, monitoring proactif Meta Business |
| Bailleur retire financement à mi-pilote | Moyenne | Critique | Plusieurs bailleurs, jalons mensuels visibles |

---

## Indicateurs de succès du pilote (à 3 mois)

| Métrique | Cible MVP | Cible V1 |
|---|---|---|
| Signalements / semaine | 20+ | 100+ |
| Délai médian signalement → diffusion | < 30 min | < 15 min |
| Taux signalements vérifiés | 70%+ | 85%+ |
| Faux positifs (rejetés) | < 15% | < 10% |
| Sentinelles actives (ping 7j) | 5/5 | 25/30 |
| Préfecture connectée hebdo | 1/1 | 1/1 |
| % alertes diffusées en < 30 min | 80% | 95% |
| NPS (sentinelles) | > 7/10 | > 8/10 |
| Couverture WhatsApp (estimation) | 50% | 75% |
| Coût télécom par alerte broadcast | < 5 € | < 2 € |

---

## Annexes

### Sprint 0 — Tableau RACI

| Tâche | Resp. | Account. | Cons. | Informé |
|---|---|---|---|---|
| Décl. CDP | DPO | CTO | Avocat | PM |
| Compte Meta WhatsApp | PM | CTO | — | équipe |
| VPS + DNS + TLS | SRE | CTO | — | équipe |
| Comité pilotage | PM | Préfet | OLEL | équipe |
| Africa's Talking | SRE | CTO | — | équipe |
| GitHub + CI | Dev lead | CTO | — | équipe |

### Convention de nommage versions
- `v0.x.y` : MVP en cours / pilote
- `v1.0.0` : Sortie V1 (mois +4)
- `v1.x.y` : Patchs / améliorations
- `v2.0.0` : V2 multi-zone (mois +6)

### Workflow Git
- `main` : production
- `staging` : pré-prod (auto-deploy via CI)
- `develop` : dev (auto-deploy sur staging)
- Branches feature : `feat/<sprint>-<short-desc>`
- Hotfix : `hotfix/<short-desc>` → merge sur `main` + `develop`

---

## Conclusion

Cette roadmap est ambitieuse mais réalisable. La clé est de **ne pas dévier** : tout ce qui n'est pas dans Sprint 0-5 est repoussé. Les "petites améliorations" ajoutées en cours de sprint sont l'ennemi #1 du time-to-market.

À J0 : déclencher Sprint 0. À J+84 : pilote Matam vivant.

Voir `SECURITY_BLUEPRINT_OLEL.md` pour le détail de la stratégie sécurité (à appliquer transversalement à tous les sprints).
