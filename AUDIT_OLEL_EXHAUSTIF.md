# OLEL — Audit exhaustif avant déploiement pilote Matam

**Date** : 2026-06-01 · **Auteurs** : équipe inter-experts (PM, CTO GovTech, Architecte, Cybersécurité, DevSecOps, UX Lead, SIG, Télécom, IA, Gestion des risques) · **Contexte** : passage du prototype fonctionnel à un déploiement opérationnel en zone Matam (Sénégal) / Gorgol (Mauritanie).

> **Posture de l'audit** : aucune hypothèse acquise. Le système doit fonctionner en situation réelle de catastrophe ; toute faiblesse non identifiée est inacceptable. Chaque manque est listé avec criticité (P0 bloquant, P1 majeur, P2 important, P3 souhaitable), impact concret en cas d'absence, et solution actionnable.

---

## Résumé exécutif

**État au 2026-06-01** : la stack technique est fonctionnellement complète (5 phases livrées, 38 correctifs d'audit appliqués, 5 builds rc=0). Le code est solide pour un MVP.

**Ce qui manque pour un déploiement pilote sûr** : 7 chantiers P0 (bloquants), 14 chantiers P1 (majeurs), une trentaine de P2/P3. Avec une équipe de 3-4 développeurs + 1 SRE + 1 SecOps, **le pilote Matam peut démarrer en 6 semaines** (cf. ROADMAP_OLEL.md).

**Risques principaux à neutraliser avant pilote** :
1. **Sécurité** : MFA non obligatoire pour rôles autorité, secrets dev en clair, pas de WAF, pas de SIEM.
2. **Résilience opérationnelle** : aucun backup automatique, aucun PRA, aucun monitoring, aucun runbook incident.
3. **RGPD / Loi 2008-12 sénégalaise** : aucun document de conformité, aucun consentement explicite, pas de DPO désigné.
4. **Télécoms** : USSD et IVR non implémentés (or critiques pour les téléphones non-smartphones, majoritaires en zone rurale Matam).
5. **Offline réel** : seule la file d'attente est offline ; les tuiles cartographiques et les formations ne sont pas pré-cachées.
6. **WhatsApp Business** : compte non validé, templates non approuvés.
7. **Mobile bas de gamme** : poids du bundle JS Next.js > 87 kB First Load — à challenger pour smartphones < 1 Go de RAM.

---

## 1. Produit

### 1.1 — Stratégie produit & métriques d'impact ⬜ **P0**
**Manque** : aucune définition de North Star Metric ni d'OKR. Comment saura-t-on que OLEL sauve des vies ?
**Impact si absent** : on ne peut ni mesurer l'efficacité du système, ni convaincre bailleurs/autorités de pérenniser le financement.
**Solution** : définir 3 KPIs principaux pour le pilote :
- **Délai médian signalement → diffusion** (cible : < 15 minutes)
- **% population zone touchée recevant l'alerte** (cible : > 80%)
- **Taux de fausses alertes / alertes confirmées** (cible : < 10%)
Ajouter une page `/dashboard/impact` qui les affiche en temps réel.

### 1.2 — Gestion du cycle de vie des alertes ⬜ **P1**
**Manque** : pas de statut `CLOSED` ou `RÉSOLU` exploité dans l'UI. Une alerte reste affichée indéfiniment.
**Impact** : carte saturée d'alertes anciennes, illisible.
**Solution** : ajout d'un job cron quotidien qui ferme automatiquement les alertes vérifiées > 48h sans nouvelle activité (champ `closedAt` déjà dans le schéma), bouton manuel de clôture pour Mairie+.

### 1.3 — Historique et post-mortem des événements ⬜ **P1**
**Manque** : aucune page "événements passés" pour analyser après-coup une crue ou un incendie.
**Impact** : pas d'apprentissage organisationnel ; impossible de répondre aux bailleurs sur l'efficacité.
**Solution** : page `/dashboard/events` avec timeline + filtres date/type/zone, export PDF par événement.

### 1.4 — Système de feedback citoyen ⬜ **P2**
**Manque** : un citoyen reçoit-il bien l'alerte ? L'a-t-il comprise ? Aucun moyen de le savoir.
**Impact** : on ne peut pas mesurer la pénétration réelle des messages.
**Solution** : ajouter un mini-survey post-alerte WhatsApp (3 questions : reçue ? comprise ? utile ?) avec analytics.

### 1.5 — Onboarding terrain des sentinelles ⬜ **P1**
**Manque** : comment recruter et former les sentinelles villageoises ? Aucun parcours défini.
**Impact** : zéro sentinelles actives = système inopérant.
**Solution** : créer un parcours d'onboarding :
- Inscription via WhatsApp (déjà possible) + entretien téléphonique
- Module formation OBLIGATOIRE avant activation (Secourisme + Spécifique au risque local)
- Désactivation auto si pas de ping en 30 jours

### 1.6 — Centre administration ⬜ **P0**
**Manque** : pas de page admin pour gérer rôles, permissions, zones, paramètres système.
**Impact** : toute modification = appel développeur. Inacceptable en prod.
**Solution** : ajouter routes `/dashboard/admin/*` (users, zones, settings système, audit log viewer, gestion des modules de formation, gestion des templates de broadcast).

---

## 2. UX/UI

### 2.1 — Mode "personne âgée / alphabétisation faible" ⬜ **P0**
**Manque** : interface très textuelle. Or 51% des adultes en zone Matam ne savent pas lire le français.
**Impact** : exclusion d'une grande partie de la cible.
**Solution** :
- Mode "icônes seules" toggleable
- Lecture audio des alertes (TTS multilingue, déjà prévu via VoiceMessage)
- Codes couleur universels (vert/jaune/orange/rouge déjà OK)
- Pictogrammes de risques systématiques

### 2.2 — Tutoriel intégré (onboarding) ⬜ **P1**
**Manque** : un nouvel utilisateur arrive sur l'app sans aide.
**Impact** : taux d'abandon élevé, signalements mal saisis.
**Solution** : overlay 3-écrans à la première ouverture (zone géolocalisée, comment signaler, comment recevoir).

### 2.3 — Audit a11y complet ⬜ **P1**
**Manque** : audit WCAG 2.1 AA partiel (focus trap fait, mais pas testé avec NVDA/JAWS).
**Impact** : non-conformité loi accessibilité 2020 (Sénégal s'inspirera).
**Solution** : passe Axe DevTools + tests manuels Lighthouse a11y = 100. Voir skill `design:accessibility-review`.

### 2.4 — UX en mode urgence (gros boutons, vibrations) ⬜ **P2**
**Manque** : en cas de crue imminente, l'UI doit être utilisable d'une main, en marchant.
**Impact** : mauvaise saisie de signalement critique.
**Solution** : mode "urgence" simplifié (1 écran, 3 boutons, vibration sur alerte rouge).

### 2.5 — Internationalisation (i18n) du dashboard ⬜ **P2**
**Manque** : dashboard 100% FR seulement. Mobile gère FR/PU/WO/SO ; pas le dashboard.
**Impact** : élus locaux non-francophones limités.
**Solution** : `next-intl` + extraction strings, traduction au minimum FR/Pulaar.

### 2.6 — Visuel cohérent avec identité régionale ⬜ **P3**
**Manque** : palette terra/sand bien choisie ; logo manque.
**Solution** : appel à candidature designer local pour logo OLEL.

---

## 3. Mobile

### 3.1 — Tuiles cartographiques offline ⬜ **P0**
**Manque** : Leaflet charge OSM tuiles en HTTP. En zone sans 4G, carte blanche.
**Impact** : sentinelle terrain sans carte = inutilisable.
**Solution** : pré-cacher (Service Worker) tuiles Matam aux 3 zooms 8/10/12 (~200 MB). Lib `leaflet-offline`.

### 3.2 — Image compression avant upload ⬜ **P1**
**Manque** : photo iPhone ~3 MB envoyée brute = consomme data + lent en 2G.
**Impact** : signalements abandonnés faute de patience.
**Solution** : compression côté client (canvas resize → 800px, 70% JPEG → ~80 KB).

### 3.3 — Service Worker complet (PWA installable) 🟧 **P1**
**Manque** : pas de manifest.webmanifest, pas d'icônes 192/512.
**Impact** : app non installable en home screen, perd intérêt PWA.
**Solution** : ajouter `apps/mobile/public/manifest.webmanifest` + 5 icônes PNG + balises `<link>` dans `layout.tsx`.

### 3.4 — Background Sync offline → backend ⬜ **P1**
**Manque** : la file IndexedDB rejoue à la reconnexion *seulement si l'onglet est ouvert*.
**Impact** : si l'utilisateur ferme l'app sans réseau, son signalement reste bloqué jusqu'à la prochaine ouverture.
**Solution** : Service Worker avec `BackgroundSync API` (Workbox `BackgroundSyncPlugin`).

### 3.5 — Optimisation batterie ⬜ **P2**
**Manque** : `watchPosition` GPS reste actif sur l'écran de vérif terrain (= drain batterie).
**Impact** : sentinelles plaignent autonomie.
**Solution** : timeout 5 min sur watchPosition + désactivation hors écran vérif.

### 3.6 — Smartphones Android < 2 Go RAM ⬜ **P1**
**Manque** : bundle First Load JS = 127 kB. Pas testé sur Tecno Spark / Itel A14.
**Impact** : crash possible sur smartphones bas de gamme (majorité en zone rurale).
**Solution** :
- Code splitting agressif (`next/dynamic` sur les vues lourdes : Leaflet, Recharts)
- Tester sur émulateur Android Studio avec profil "low-end device"

### 3.7 — Notifications push réelles ⬜ **P0** (pour V1)
**Manque** : Capacitor push plugin installé mais Firebase Cloud Messaging non configuré.
**Impact** : alerte push (le canal le plus rapide) non fonctionnel.
**Solution** : compte Firebase + `google-services.json` Android + `GoogleService-Info.plist` iOS + serveur FCM (lib `firebase-admin` côté backend).

### 3.8 — Mode SOS rapide ⬜ **P2**
**Manque** : bouton SOS appelle "3000" mais ce n'est pas le bon numéro selon contexte.
**Solution** : config par zone du numéro d'urgence local (Sapeurs-pompiers Matam, ANSDR, etc.).

---

## 4. Backend (NestJS)

### 4.1 — Endpoint OTP rate-limité ⬜ **P0**
**Manque** : `/auth/otp/request` sans throttler. Risque de SMS bombing (coût + DoS).
**Impact** : un attaquant peut facturer des milliers de SMS à Africa's Talking.
**Solution** : `@Throttle({ default: { limit: 3, ttl: 60_000 }})` sur le endpoint OTP request + max 1 OTP / numéro / 5 min.

### 4.2 — Validation entrée renforcée (DTOs) 🟧 **P1**
**Manque** : certains DTOs n'ont pas de `@IsString` / `@MaxLength`. Risque injection ou DoS sur champs longs.
**Impact** : exploit potentiel.
**Solution** : audit exhaustif des DTOs avec `class-validator`, `@MaxLength(N)` sur tout `string`.

### 4.3 — Soft delete users ⬜ **P1**
**Manque** : `DELETE /users/:id` hard delete. RGPD demande suppression mais audit demande conservation.
**Solution** : champ `deletedAt`, masquage UI, conservation 6 mois pour audit, vraie suppression après.

### 4.4 — Idempotence des POSTs critiques ⬜ **P1**
**Manque** : si une sentinelle valide la même alerte 2× (mobile lente), 2 validations créées.
**Impact** : compteurs faussés, audit dégradé.
**Solution** : header `Idempotency-Key` accepté sur POST `/alerts` et PATCH `/alerts/:id/validate` ; cache 24h Redis.

### 4.5 — Job scheduler central ⬜ **P1**
**Manque** : pas de Bull repeatable jobs pour clôture auto, nettoyage OTP expirés, rotation refresh tokens.
**Impact** : dette croît dans la DB.
**Solution** : `BullModule.registerQueue({ name: 'maintenance' })` + processors avec `@Cron`.

### 4.6 — Bot WhatsApp : gestion conversation longue ⬜ **P2**
**Manque** : sessions Redis 30 min sans nettoyage explicite. Conversations multi-jours non supportées.
**Solution** : ajouter `conversation_state` persisté en table dédiée.

### 4.7 — Voice / IVR module ⬜ **P0** (pour MVP télécom)
**Manque** : `VoiceModule` est un stub.
**Impact** : aucun support des téléphones non-smartphones (~40% en Matam rural).
**Solution** : intégration Africa's Talking IVR — script vocal multilingue, DTMF (1=inondation, 2=feu, etc.). Voir §12.

### 4.8 — Module USSD ⬜ **P0**
**Manque** : aucun. Or USSD = méthode #1 dans contexte rural sans data.
**Solution** : module `UssdModule` + endpoint `POST /ussd/callback` (Africa's Talking) avec menu 3 niveaux (zone → risque → confirmation).

---

## 5. Base de données

### 5.1 — Migration initiale versionnée ✅ Done (2026-05-31)
Fichier `backend/prisma/migrations/20260531000000_init/` créé. À committer.

### 5.2 — Index manquants 🟧 **P1**
**Manque** : pas d'index sur `(zoneId, createdAt)` pour `Alert` (requête feed la plus fréquente).
**Solution** : `@@index([zoneId, createdAt(desc)])` dans schema, regen migration.

### 5.3 — Pas de PostGIS exploité ⬜ **P1**
**Manque** : schéma déclare `extensions = [postgis]` mais aucun champ `Geography`. Lat/lng en Float.
**Impact** : queries spatiales (alertes dans rayon X km) inefficaces.
**Solution** : champ `geom Geography(Point, 4326)?` + index GiST. Voir §11.

### 5.4 — Politique de rétention ⬜ **P1**
**Manque** : aucune. Alertes 2024 toujours en DB.
**Solution** : partitionnement par mois (table `alerts_YYYY_MM`) + archivage S3 après 12 mois.

### 5.5 — Pool de connexions ⬜ **P2**
**Manque** : Prisma utilise pool par défaut (10). Sous charge, saturation possible.
**Solution** : pgBouncer en sidecar + `DATABASE_URL?pgbouncer=true`.

### 5.6 — Backup automatique ⬜ **P0**
**Manque** : aucune sauvegarde scheduled.
**Impact** : perte totale en cas de panne disque.
**Solution** : conteneur `prodrigestivill/postgres-backup-local` (cron daily, rétention 30j, dump chiffré).

### 5.7 — Backup vers S3 / object storage ⬜ **P0**
**Manque** : backups locaux seulement = vulnérables au feu, vol.
**Solution** : upload daily vers MinIO ou Wasabi (moins cher qu'AWS S3).

---

## 6. API

### 6.1 — Versioning explicite ✅ Done
URL `/api/v1/*` — OK.

### 6.2 — Documentation Swagger complète 🟧 **P1**
**Manque** : Swagger présent mais peu de `@ApiProperty` documentés ; pas d'exemples.
**Solution** : compléter décorateurs ; export `openapi.json` à committer pour clients externes.

### 6.3 — Limites de pagination ⬜ **P1**
**Manque** : `GET /alerts` sans limite renvoie potentiellement 10 000+ alertes.
**Solution** : `@Max(50)` sur `limit`, cursor-based pagination (champ `after=<id>`).

### 6.4 — Format de réponse uniforme ✅ Done
Enveloppe `{ data, meta }` cohérente.

### 6.5 — CORS production strict ⬜ **P0**
**Manque** : `WS_PUBLIC_ORIGIN=*` en dev. Pas de switch automatique en prod.
**Solution** : variable `ALLOWED_ORIGINS` (liste) + check explicite dans `main.ts`.

### 6.6 — Webhook signing (sortants) ⬜ **P2**
**Manque** : si OLEL veut notifier des partenaires externes par webhook, pas de système prêt.
**Solution** : module `WebhookOutboundModule` avec signature HMAC, retry exponentiel.

---

## 7. Infrastructure

### 7.1 — Infrastructure as Code ⬜ **P0**
**Manque** : déploiement manuel via `docker compose up`. Aucun Terraform / Pulumi / Ansible.
**Impact** : recréation = horreur ; environnement de staging impossible.
**Solution** : Ansible playbook pour VPS Hostinger (10 tâches : Docker, Nginx, Certbot, sécurité OS).

### 7.2 — Environnements multiples ⬜ **P1**
**Manque** : pas de séparation dev/staging/prod. Un seul `docker-compose.yml`.
**Solution** : `docker-compose.{dev,staging,prod}.yml` + variables d'env par env.

### 7.3 — Reverse proxy Nginx config ⬜ **P0**
**Manque** : config Nginx pas dans le repo.
**Solution** : `infra/nginx/sites-available/{api,app,m,bot}.olel.sn.conf` versionné.

### 7.4 — Certificats TLS auto-renouvelés ⬜ **P0**
**Manque** : Certbot pas configuré.
**Solution** : `certbot --nginx -d api.olel.sn -d app.olel.sn -d m.olel.sn -d bot.olel.sn` + cron de renouvellement.

### 7.5 — CDN devant les assets ⬜ **P1**
**Manque** : aucun. Tuiles, photos, JS bundles servis par le VPS = saturation 4G.
**Solution** : Cloudflare gratuit devant tout (DNS proxy + cache) ou Bunny CDN.

### 7.6 — Object storage (photos signalements) ⬜ **P1**
**Manque** : photos stockées sur disque VPS. Limite à quelques dizaines de Go.
**Solution** : MinIO en sidecar Docker OU Cloudflare R2 (10 Go gratuits).

### 7.7 — Multi-zone disponibilité ⬜ **P2** (pour V2)
**Manque** : VPS unique. Si Hostinger Dakar tombe, OLEL tombe.
**Solution** : V2 — second VPS Paris + Postgres réplication streaming + Cloudflare load balancing.

### 7.8 — Estimation coût mensuel ⬜ **P1**
**Manque** : aucun calcul.
**Solution** : tableau dans `INFRA_COST.md` (VPS 8GB ~25 €/mo, Cloudflare gratuit, MinIO 0, Sentry team 26 $/mo, FCM gratuit, Africa's Talking pay-per-use ~50 €/mo pour 10k SMS).
**Total estimé pilote** : ~100 €/mo.

---

## 8. DevOps

### 8.1 — CI/CD pipeline ⬜ **P0**
**Manque** : aucune. Tests passés à la main.
**Impact** : régressions silencieuses possibles.
**Solution** : GitHub Actions `.github/workflows/ci.yml` :
- `pnpm install` + cache
- `pnpm typecheck` (turbo)
- `pnpm test` (à créer)
- `pnpm build` (turbo)
- Sur tag `v*` : `docker build` + `docker push` registry.

### 8.2 — Container registry ⬜ **P1**
**Manque** : Dockerfiles présents mais images non publiées.
**Solution** : GitHub Container Registry (gratuit) ou Docker Hub.

### 8.3 — Stratégie de déploiement ⬜ **P1**
**Manque** : pas de blue/green ni canary. Risque downtime à chaque release.
**Solution** : Docker compose avec 2 backends derrière Nginx, switch via reload.

### 8.4 — Tests automatisés ⬜ **P0**
**Manque** : aucun test Jest.
**Impact** : impossible de refactor en confiance.
**Solution** : viser 60% couverture sur :
- `auth.service.ts` (login, refresh, OTP)
- `alerts.service.ts` (create, validate)
- `notifications` (fanout, retry)
+ tests E2E `supertest` sur 5 endpoints critiques.

### 8.5 — Tests E2E navigateur ⬜ **P1**
**Manque** : aucun Playwright/Cypress.
**Solution** : 3 scénarios E2E Playwright (login citoyen → signalement, login sentinelle → validation, dashboard live).

### 8.6 — Tests de charge ⬜ **P1**
**Manque** : aucun.
**Solution** : `k6 run scripts/load-test.js` simulant 500 utilisateurs simultanés (pic d'alerte).

### 8.7 — Smoke test post-déploiement ✅ Done
`scripts/smoke-test.ps1` créé.

### 8.8 — Feature flags ⬜ **P2**
**Manque** : pas de toggle pour désactiver un module en cas de bug prod.
**Solution** : `Unleash` self-hosted ou simple table `feature_flags` Postgres.

### 8.9 — Rollback procédure ⬜ **P0**
**Manque** : runbook absent.
**Solution** : script `infra/rollback.sh` qui redéploie l'image N-1, restaure DB backup.

---

## 9. Sécurité

### 9.1 — MFA obligatoire pour autorités ⬜ **P0**
**Manque** : TOTP existe mais désactivable. PRÉFECTURE et + doivent l'activer obligatoirement.
**Impact** : compte préfet compromis = broadcast frauduleux à 100 000 personnes.
**Solution** : flag `requireTwoFa` + middleware bloquant l'accès si rôle ≥ MAIRIE et `!totpEnabled`.

### 9.2 — Secrets en clair ⬜ **P0**
**Manque** : `.env` versionnable, secrets dev en clair.
**Solution** : Vault HashiCorp self-hosted OU Doppler OU SOPS chiffré dans le repo.

### 9.3 — Gestion des clés / rotation ⬜ **P1**
**Manque** : JWT_SECRET, TOTP_ENCRYPTION_KEY jamais rotables.
**Solution** : kid (key ID) dans JWT header + table `signing_keys` avec dates de validité.

### 9.4 — WAF (Web Application Firewall) ⬜ **P0**
**Manque** : aucun.
**Solution** : Cloudflare WAF gratuit (règles OWASP Top 10) en façade.

### 9.5 — Protection DDoS ⬜ **P0**
**Manque** : aucune.
**Solution** : Cloudflare (gratuit basique, payant si attaque sévère).

### 9.6 — SIEM / logs centralisés ⬜ **P1**
**Manque** : logs locaux uniquement.
**Solution** : Grafana Loki self-hosted + Promtail sur les conteneurs.

### 9.7 — SOC (Security Operations Center) ⬜ **P2** (pour V2)
**Manque** : pas de surveillance 24/7. Acceptable en pilote, pas en V2.
**Solution** : V2 — externalisation via prestataire africain (CSIRT.sn).

### 9.8 — Gestion des vulnérabilités ⬜ **P1**
**Manque** : pas de scan dépendances.
**Solution** : `pnpm audit` en CI, Snyk gratuit pour repo public, Dependabot.

### 9.9 — Audit trail complet ✅ Done (modèle) 🟧 (UI)
**Manque** : `AuditLog` modèle existe et service injecte, mais aucune UI pour consulter.
**Solution** : page `/dashboard/admin/audit` avec filtres.

### 9.10 — Politique de mots de passe ⬜ **P1**
**Manque** : pas de validation force (longueur 8 min, pas de check breach).
**Solution** : zxcvbn côté front + check HaveIBeenPwned API.

### 9.11 — Verrouillage compte après échecs ⬜ **P1**
**Manque** : pas de lockout après N tentatives login.
**Solution** : compteur Redis 10 tentatives en 15 min → blocage 1h.

### 9.12 — Sécurité headers ✅ Done (CSP strict, helmet)
Vérifier en prod : HSTS preload, Expect-CT.

### 9.13 — Chiffrement at-rest ⬜ **P1**
**Manque** : Postgres en clair sur disque VPS.
**Solution** : LUKS sur partition Postgres OU Postgres TDE (pas natif, payant).

### 9.14 — Chiffrement en transit ✅ Done (TLS)
À vérifier en prod : pas de ciphers obsolètes.

---

## 10. IA

### 10.1 — Classification automatique des signalements ⬜ **P2** (pour V2)
**Manque** : un citoyen écrit "kotsi diam" (eau qui monte en pulaar), aucun classifieur ne mappe vers `HYDRO`.
**Solution V2** : modèle NLP multilingue (`bert-multilingual`) fine-tuné sur 1000 messages annotés.

### 10.2 — Détection doublons d'alertes ⬜ **P1**
**Manque** : 10 citoyens signalent la même crue = 10 alertes en file. Sentinelle débordée.
**Solution** : embedding texte + clustering (DBSCAN) sur fenêtre 1h, mark `parentAlertId`.

### 10.3 — Prédiction de risque crue ⬜ **P3** (pour V3)
**Manque** : aucune corrélation niveau fleuve + historique pour anticiper.
**Solution V3** : modèle XGBoost sur données ANACIM + historique OLEL.

### 10.4 — Transcription vocale (STT) ⬜ **P1**
**Manque** : notes vocales sentinelle stockées audio brut.
**Impact** : impossible à indexer / chercher.
**Solution** : OpenAI Whisper API ou Google STT (FR + Pulaar pas terrible, Whisper meilleur).

### 10.5 — Synthèse vocale (TTS) pour alertes ⬜ **P0** (IVR)
**Manque** : indispensable pour IVR.
**Solution** : Africa's Talking TTS ou Google TTS multilingue.

---

## 11. Cartographie (SIG)

### 11.1 — PostGIS exploité ⬜ **P1**
Voir §5.3. Index spatial GiST pour "alertes dans rayon X de la sentinelle".

### 11.2 — Données géographiques de référence ⬜ **P1**
**Manque** : pas de couches référentielles (limites communes, cours d'eau, zones inondables historiques).
**Solution** : intégrer données OpenStreetMap + zonage ANSDR (Agence nationale de la statistique et de la démographie) + zones inondables historiques 2003/2009/2022.

### 11.3 — Tuiles offline ⬜ **P0**
Voir §3.1.

### 11.4 — Géocodage inverse ⬜ **P1**
**Manque** : "lat=15.66, lng=-13.25" affiché brut. Doit dire "Wuro-Mamadou, Matam".
**Solution** : Nominatim (OpenStreetMap) self-hosted ou Mapbox géocodage.

### 11.5 — Heat maps ⬜ **P2**
**Manque** : aucune visualisation densité d'alertes.
**Solution** : `leaflet.heat` plugin sur dashboard.

### 11.6 — Buffer zones autour des alertes ⬜ **P2**
**Manque** : aucune visualisation "zone touchée 5 km autour".
**Solution** : Turf.js côté front pour rendre cercles dynamiques.

---

## 12. Télécommunications

### 12.1 — SMS unidirectionnel ✅ Module présent
À vérifier : queue Bull avec retry, fallback opérateur.

### 12.2 — SMS bidirectionnel ⬜ **P1**
**Manque** : envoyer alerte SMS OK, mais citoyens ne peuvent pas SIGNALER par SMS.
**Solution** : numéro court Africa's Talking + parser "ALERT crue Wuro-Mamadou" → POST /alerts.

### 12.3 — USSD ⬜ **P0**
Voir §4.8. Bloquant pour la cible.

### 12.4 — IVR ⬜ **P0**
Voir §4.7 et §10.5.

### 12.5 — WhatsApp Business compte ⬜ **P0**
**Manque** : non créé.
**Solution** : démarche Meta Business + numéro dédié Sénégal + validation templates.

### 12.6 — Templates WhatsApp 4 langues ⬜ **P0**
**Manque** : code i18n présent (`i18n.ts` bot), mais templates Meta non créés / non approuvés.
**Solution** : créer 10 templates × 4 langues sur Meta Business Manager (validation 24-72h).

### 12.7 — Fallback channels ⬜ **P1**
**Manque** : si WhatsApp KO, automatique SMS ? Pas câblé.
**Solution** : politique `notificationStrategy` (FIRST_AVAILABLE / ALL_CHANNELS) configurable.

### 12.8 — Coût télécom par alerte ⬜ **P1**
**Manque** : pas de comptage. Budget peut exploser.
**Solution** : table `cost_log` (canal, montant) + dashboard.

---

## 13. Gouvernance

### 13.1 — Définition rôles & responsabilités ⬜ **P0**
**Manque** : qui décide d'un broadcast préfectoral ? Qui annule ? Aucune règle.
**Solution** : `GOVERNANCE.md` avec matrice RACI (Responsible, Accountable, Consulted, Informed).

### 13.2 — Comité de pilotage ⬜ **P0**
**Manque** : aucun.
**Solution** : 5 personnes (Préfet Matam, Représentant ANSDR, Représentant Protection Civile, OLEL CTO, OLEL Product Lead) — réunion mensuelle.

### 13.3 — Politique d'usage acceptable ⬜ **P1**
**Manque** : que peut-on signaler ? Insultes, fake news ?
**Solution** : règles claires, sanctions (suspension compte 30 j).

### 13.4 — Modération communautaire ⬜ **P1**
**Manque** : aucune.
**Solution** : flag "signaler ce signalement" + revue Mairie+.

### 13.5 — Politique d'escalade ⬜ **P0**
**Manque** : règles non écrites.
**Solution** : `ESCALATION_POLICY.md` : crue → sentinelle 30 min, sinon Mairie ; sinon Préfecture 1h ; sinon Gouvernorat.

---

## 14. Conformité

### 14.1 — Loi sénégalaise n° 2008-12 sur la protection des données personnelles ⬜ **P0**
**Manque** : non couvert. Cette loi exige déclaration CDP (Commission de protection des données).
**Solution** : déclaration en ligne sur `cdp.sn` ; mention dans CGU.

### 14.2 — RGPD (utile pour partenaires UE, ONU) ⬜ **P0**
**Manque** : aucun document.
**Solution** : `LEGAL/privacy-policy.md`, `LEGAL/terms-of-service.md`, `LEGAL/cookies-policy.md` + page dans le footer.

### 14.3 — Consent management ⬜ **P0**
**Manque** : aucune coche "j'accepte" lors de l'inscription.
**Solution** : modal au login OTP (CGU + Politique de confidentialité), modèle `Consent` Prisma.

### 14.4 — Droit à l'oubli / portabilité ⬜ **P1**
**Manque** : aucune procédure.
**Solution** : `GET /users/me/export` (JSON), `DELETE /users/me` (soft delete + purge 6 mois).

### 14.5 — DPO désigné ⬜ **P0**
**Manque** : personne nommée.
**Solution** : désigner un DPO (peut être externe, prestataire ~500 €/mo) — obligatoire si traitement données sensibles.

### 14.6 — Notification de violation de données ⬜ **P1**
**Manque** : aucune procédure.
**Solution** : runbook `INCIDENT_DATA_BREACH.md` (CDP notifiée < 72h).

### 14.7 — Mention licence ouverte / SDG ⬜ **P3**
**Manque** : pas de positionnement open source.
**Solution** : licence MIT ou AGPL selon choix pérennité.

---

## 15. Monitoring

### 15.1 — Health checks ⬜ **P0**
**Manque** : pas de `/health` endpoint.
**Solution** : `@nestjs/terminus` + endpoint `/health/live`, `/health/ready` (DB, Redis).

### 15.2 — Métriques Prometheus ⬜ **P0**
**Manque** : aucune métrique exportée.
**Solution** : `@willsoto/nestjs-prometheus` → `/metrics` (requests, latence, queue size).

### 15.3 — Dashboards Grafana ⬜ **P1**
**Manque** : aucun.
**Solution** : Grafana self-hosted + 5 dashboards (API, DB, Bull queues, WS connections, business KPIs).

### 15.4 — Alerting ⬜ **P0**
**Manque** : aucun.
**Solution** : Alertmanager → Telegram / WhatsApp groupe OPS (4 alertes : API down, DB connections > 80%, queue lag > 5 min, error rate > 1%).

### 15.5 — Error tracking (Sentry) ⬜ **P0**
**Manque** : aucun.
**Solution** : Sentry self-hosted ou cloud ($26/mo team).

### 15.6 — Uptime monitoring externe ⬜ **P0**
**Manque** : si VPS tombe, on apprend par appels téléphone.
**Solution** : UptimeRobot gratuit (5 min) ou Better Stack.

### 15.7 — Logs centralisés ⬜ **P1**
Voir §9.6 (Loki).

### 15.8 — Tracing distribué ⬜ **P2** (pour V2)
**Manque** : aucun.
**Solution V2** : OpenTelemetry + Tempo.

---

## 16. Analytics

### 16.1 — Product analytics (Mixpanel/PostHog) ⬜ **P1**
**Manque** : aucune mesure usage.
**Solution** : PostHog self-hosted gratuit. Events : `report_submitted`, `alert_validated`, `broadcast_sent`, `whatsapp_message_received`.

### 16.2 — Business intelligence ⬜ **P2**
**Manque** : pas de SQL exploratoire pour les bailleurs.
**Solution** : Metabase self-hosted (lecture seule sur réplica Postgres).

### 16.3 — Funnel analysis ⬜ **P2**
**Manque** : combien d'utilisateurs abandonnent l'OTP ?
**Solution** : PostHog funnels.

### 16.4 — Rapport mensuel automatique ⬜ **P1**
**Manque** : aucun.
**Solution** : cron mensuel `generate-monthly-report.ts` → PDF envoyé aux parties prenantes.

---

## 17. Maintenance

### 17.1 — Runbook incidents ⬜ **P0**
**Manque** : aucun.
**Solution** : `RUNBOOK.md` couvrant : DB down, Redis down, queue saturée, OTP en erreur, broadcast échec.

### 17.2 — PCA (Plan de Continuité d'Activité) ⬜ **P0**
**Manque** : aucun.
**Solution** : `PCA.md` (RTO 4h, RPO 1h) + procédures.

### 17.3 — PRA (Plan de Reprise après Activité) ⬜ **P0**
**Manque** : aucun.
**Solution** : `PRA.md` + test trimestriel.

### 17.4 — Versioning sémantique ⬜ **P1**
**Manque** : pas de tags Git.
**Solution** : `v0.1.0` MVP, `v0.2.0` V1 fonctionnel, etc. + `CHANGELOG.md`.

### 17.5 — Politique de mise à jour deps ⬜ **P1**
**Manque** : aucune.
**Solution** : Renovate ou Dependabot ; revue mensuelle.

### 17.6 — Documentation runtime ⬜ **P1**
**Manque** : difficile pour un nouveau dev de comprendre.
**Solution** : `CONTRIBUTING.md`, `ARCHITECTURE.md` (à mettre à jour), `docs/` exhaustif.

---

## 18. Documentation

### 18.1 — README de premier niveau 🟧 **P1**
**Manque** : pas de README à la racine.
**Solution** : `README.md` court (objectif, démarrage rapide, liens vers docs détaillées).

### 18.2 — Documentation utilisateur (citoyen) ⬜ **P0**
**Manque** : comment utiliser l'app pour un citoyen ?
**Solution** : `docs/user-guide-citoyen.pdf` + version simplifiée pictogrammes + version audio.

### 18.3 — Documentation sentinelle ⬜ **P0**
**Manque** : guide formation.
**Solution** : `docs/sentinelle-handbook.pdf` (rôle, procédures, exemples).

### 18.4 — Documentation administrateur ⬜ **P0**
**Manque** : aucune.
**Solution** : `docs/admin-manual.pdf`.

### 18.5 — Documentation technique API ✅ Done
Swagger OK ; compléter exemples (cf §6.2).

### 18.6 — Glossaire métier ⬜ **P2**
**Manque** : ANACIM ? ANSDR ? Préfecture vs Mairie ?
**Solution** : `docs/glossary.md`.

### 18.7 — Vidéos tutoriels ⬜ **P2**
**Manque** : aucune.
**Solution** : 5 vidéos YouTube 2 min (Pulaar + FR).

---

## Synthèse criticité

| Catégorie | P0 | P1 | P2 | P3 |
|---|---|---|---|---|
| Produit | 2 | 2 | 1 | 0 |
| UX/UI | 1 | 2 | 1 | 1 |
| Mobile | 2 | 4 | 2 | 0 |
| Backend | 3 | 3 | 1 | 0 |
| BDD | 2 | 3 | 1 | 0 |
| API | 1 | 2 | 1 | 0 |
| Infra | 4 | 3 | 1 | 0 |
| DevOps | 4 | 3 | 1 | 1 |
| Sécurité | 5 | 5 | 1 | 0 |
| IA | 1 | 2 | 1 | 1 |
| SIG | 1 | 3 | 2 | 0 |
| Télécom | 4 | 3 | 0 | 0 |
| Gouvernance | 3 | 2 | 0 | 0 |
| Conformité | 3 | 2 | 0 | 1 |
| Monitoring | 4 | 2 | 1 | 0 |
| Analytics | 0 | 2 | 2 | 0 |
| Maintenance | 3 | 3 | 0 | 0 |
| Documentation | 3 | 2 | 1 | 0 |
| **Total** | **46** | **48** | **17** | **4** |

**Tous les P0 doivent être fermés avant le pilote Matam.** Les P1 peuvent être livrés pendant le pilote mais doivent être planifiés. P2 = V1.5/V2. P3 = V2/V3.

Voir `ROADMAP_OLEL.md` pour la répartition par sprint et `SECURITY_BLUEPRINT_OLEL.md` pour le détail sécurité, `ARCHITECTURE_OLEL.md` pour les schémas.
