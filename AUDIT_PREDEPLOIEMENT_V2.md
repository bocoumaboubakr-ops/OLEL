# OLEL — Audit pré-déploiement v2

**Date** : 2026-06-02
**Contexte** : test bout-à-bout réussi en local. Citoyen, sentinelle, mairie, préfet traversent le cursus complet. Préparation à la mise en ligne.

---

## 1. État réel — Ce qui FONCTIONNE déjà

### Backend (NestJS + Prisma + Postgres+PostGIS + Redis Bull)
- ✅ Auth OTP citoyens (phone + code SMS) — 3 req/min max, anti SMS bombing
- ✅ Auth password autorités + refresh tokens rotatifs
- ✅ MFA TOTP chiffré AES-256-GCM (mise en place backend ; flux enrôlement à finir côté UI)
- ✅ RBAC complet (7 rôles, matrice rôles × ressources)
- ✅ MFA OBLIGATOIRE pour BroadcastController (RequireTwoFaGuard)
- ✅ Idempotency-Key Redis 24h sur endpoints critiques
- ✅ CORS strict ALLOWED_ORIGINS configurable
- ✅ Audit log (modèle + service + controller + viewer dashboard)
- ✅ RGPD : export /users/me/export + soft delete DELETE /users/me
- ✅ Module USSD avec menu 3 niveaux
- ✅ Health endpoints (`/health/live`, `/health/ready`)
- ✅ Prometheus metrics (5 compteurs business)
- ✅ Module Team (canal sentinelle + messages)
- ✅ Module Formations + Missions + scoring
- ✅ Module Broadcast (avec MFA gate)
- ✅ WebSocket Gateway temps réel (room `alerts:critical`)
- ✅ Queue Bull notifications avec DLQ
- ✅ Circuit breaker bot, refresh rotation, 38 audits fixes

### Cursus alerte
- ✅ 6 étapes documentées (CURSUS_ALERTE.md)
- ✅ SIGNALEMENT → SENTINELLE → MAIRIE → PREFECTURE → BROADCAST → CLOSED
- ✅ Filtrage automatique par rôle (CITOYEN/SENTINELLE/MAIRIE voient leur zone ; PREFECTURE+ voient tout)
- ✅ Permissions de validation enforcing (chaque étape ne peut être validée que par les rôles supérieurs)
- ✅ Audit log automatique sur chaque action

### Schéma Prisma
- ✅ 24 modèles (User, Zone, Alert, Validation, Broadcast, Notification, SentinelReport, VoiceMessage, RiverLevel, AuditLog, WhatsAppSession, NotificationFailure, TrainingModule, TrainingLesson, TrainingProgress, Mission, MissionAssignment, TeamMessage, Consent, OtpAttempt, CostLog, et autres)
- ✅ 18 enums (UserRole, AlertLevel, RiskType, RiskSubType 19 sous-types, AlertStatus, ValidationStep, Language 4 langues, Channel, ValidationAction, ConsentType, etc.)
- ✅ Migration initiale versionnée (651 lignes SQL)
- ✅ Index optimisés (level+status, zoneId+createdAt desc, levelRank desc, parent clustering)
- ✅ Champs workflows : Alert.subType / requiresMedicalReview / requiresConsent / refugePoints / parentAlertId, Zone.refugePoints / emergencyContacts

### Mobile (Next PWA + Capacitor)
- ✅ ConsentModal CGU v1.0 (RGPD + loi 2008-12)
- ✅ Login OTP 3 étapes (phone → code → zone)
- ✅ OnboardingOverlay 3 écrans premier lancement
- ✅ HomeScreen refondu (statut zone géant + CTA SIGNALER hero + alertes récentes)
- ✅ EmergencyFAB rouge persistant top-right (SOS 1-tap)
- ✅ EmergencyReportScreen 3-taps (icônes risques → Ici → Envoyer)
- ✅ ReportScreen formulaire complet
- ✅ AlertsScreen liste filtrée + filtres En cours / Diffusées / Clôturées
- ✅ AlertDetailScreen avec ChainStep cursus en temps réel + instructions par risque + partage Web Share API
- ✅ MapScreen Leaflet avec données réelles
- ✅ SentinelScreen + quick-access 4 boutons (File / Équipe / Formations / Missions)
- ✅ VerificationQueueScreen (file tri urgence + proximité)
- ✅ VerifyScreen (GPS + photo + audio + gravité + commentaire)
- ✅ TeamScreen (coéquipiers + canal messages poll 15s)
- ✅ FormationsScreen + MissionsScreen
- ✅ AccessibilitySettingsScreen (contraste élevé, texte grand, boutons larges, langue)
- ✅ BottomNav universel 5 onglets + bouton logout
- ✅ LanguageSwitcher 4 langues (FR/Pulaar/Wolof/Soninké) avec hook useT()
- ✅ InstallPromptBanner PWA + dismiss 30j
- ✅ PWA manifest.webmanifest
- ✅ Image compression client (canvas 800px JPEG 70%)
- ✅ Offline queue IndexedDB + rejeu online

### Dashboard (Next + Tailwind)
- ✅ Layout sidebar 11 entrées + TopBar + ProfileMenu (logout + paramètres)
- ✅ AlertTable responsive (cartes mobile, tableau desktop)
- ✅ Filtre "Pour décision" intelligent (alertes attendant ce rôle)
- ✅ Badge "VOTRE TOUR" sur lignes actionnables
- ✅ Page détail alerte complète avec vérification sentinelle (photo, GPS, gravité, commentaire), historique validations, historique broadcasts
- ✅ Pages /dashboard/map, /alerts, /sentinel, /broadcast, /weather, /analytics, /users, /settings
- ✅ Pages admin /dashboard/admin/audit + /dashboard/admin/zones
- ✅ WebSocket live (indicateur LIVE/Hors ligne)
- ✅ Couleurs Tailwind cohérentes + bordure gauche colorée par niveau

### Outillage DevOps
- ✅ docker-compose.yml + docker-compose.dev.yml
- ✅ Dockerfiles backend + dashboard + mobile + bot (prod + .dev)
- ✅ Script start-all-dev.ps1 (auto port détection, env injection, prisma generate+push+seed, lance 3 fenêtres)
- ✅ Script smoke-test.ps1 (18 tests automatisés bout-à-bout)
- ✅ Documentation : DEMARRAGE.md, TEST_LAN.md, TEST_PLAN.md, GUIDE_DEPLOIEMENT.md, CHECKLIST_DEPLOIEMENT.md, AUDIT_OLEL_EXHAUSTIF.md, ARCHITECTURE_OLEL.md, SECURITY_BLUEPRINT_OLEL.md, WORKFLOWS_SCENARIOS_OLEL.md, ROADMAP_OLEL.md, UX_UI_AUDIT.md, CURSUS_ALERTE.md, CAPACITOR.md

### Tests
- ✅ Smoke test API 18/18 PASS (bouT-à-bout du cursus)
- ✅ Compilations toutes vertes (backend tsc, bot tsc, ui tsup, dashboard build, mobile build)

---

## 2. BLOQUANTS critiques avant déploiement (P0)

Ces items DOIVENT être faits avant la mise en ligne pilote. Aucun raccourci.

### 2.1 — Comptes externes
| Item | Délai | Action |
|---|---|---|
| **VPS Hostinger** 8 GB Dakar | 1 jour | Commander + accès SSH + WireGuard |
| **Domaine `olel.sn`** | 1-3 jours | Acheter + 4 sous-domaines DNS (api, app, m, bot) + DNSSEC + CAA |
| **Cloudflare** | 30 min | Compte gratuit + WAF + DDoS + CDN devant tout |
| **Certificats Let's Encrypt** | 1h | Certbot Nginx pour les 4 sous-domaines |
| **Meta WhatsApp Business** | **1-2 semaines** | Compte vérifié + numéro dédié + templates approuvés × 4 langues × 10 templates |
| **Africa's Talking** | 5-15 jours | Compte production + crédits 100 € + numéro court USSD |
| **Sentry** | 30 min | Compte + DSN (free tier suffit MVP) |
| **UptimeRobot** | 15 min | Monitor `/api/health/live` toutes 5 min, notif Telegram |
| **Wasabi backup S3** | 30 min | Compte + bucket chiffré (~5 €/mo) |
| **Firebase Cloud Messaging** (V1) | 1h | Configuration FCM pour push Android |

### 2.2 — Secrets de production
À générer **avant** le premier déploiement avec `openssl rand -hex 32` :
- `JWT_SECRET` (production)
- `JWT_REFRESH_SECRET` (production)
- `TOTP_ENCRYPTION_KEY` (production)
- `BOT_API_KEY` (production)
- `WHATSAPP_APP_SECRET` (depuis Meta Business)
- `POSTGRES_PASSWORD` (production)
- Backup GPG passphrase

Stockage : SOPS chiffré + age dans le repo, OU HashiCorp Vault sur VPS dédié.

### 2.3 — Légal & Conformité Sénégal
| Item | Bloquant | Action |
|---|---|---|
| **DPO désigné** | Loi 2008-12 | Interne ou prestataire (~500 €/mois) |
| **Déclaration CDP** | Obligatoire | Dépôt en ligne sur cdp.sn |
| **Privacy Policy validée** | Avocat | Cabinet sénégalais (~2 j de relecture) |
| **Terms of Service** | Avocat | Idem |
| **Politique Cookies** | RGPD | À rédiger |
| **Politique escalade** | Gouvernance | ESCALATION_POLICY.md + signature préfet |

### 2.4 — Backups & PRA
| Item | Action |
|---|---|
| **Cron daily Postgres dump → Wasabi** chiffré GPG | À automatiser avant prod |
| **Test de restauration mensuel** | Procédure documentée |
| **PRA basique** RTO 4h / RPO 1h | Document `PRA.md` |
| **PCA basique** | Document `PCA.md` |
| **Runbook incident** | `RUNBOOK.md` (5 cas : DB down, Redis down, queue saturée, OTP erreur, broadcast échec) |

### 2.5 — Infra production
| Item | Action |
|---|---|
| **Nginx config versionnée** | `infra/nginx/sites-available/*.olel.sn.conf` (4 fichiers) |
| **Pare-feu UFW** | Ports 22 (WireGuard only) / 80 / 443 |
| **Fail2ban** | Configuration SSH |
| **Unattended-upgrades** | Sécurité OS auto |
| **WireGuard VPN** | Accès admin sécurisé (port 51820/udp) |
| **LUKS chiffrement partition data** | Postgres + MinIO/photos |

### 2.6 — MFA TOTP flux d'enrôlement
**Bloquant fonctionnel** : `RequireTwoFaGuard` empêche broadcast tant que pas activé, mais **aucune UI** pour activer.

Action : page `/dashboard/2fa-setup` avec :
1. Appel `POST /auth/2fa/setup` → renvoie secret + QR code
2. Affichage QR code à scanner avec Google Authenticator / FreeOTP
3. Saisie premier code TOTP → `POST /auth/2fa/confirm` → activation
4. 10 codes de récupération générés à imprimer
5. Redirection auto après activation

Sans ça, **aucun préfet ne peut diffuser** en production. **1 jour de dev**.

### 2.7 — Storage des photos signalements
Actuellement, l'upload photo dans mobile/dashboard n'a **pas de backend** réel — pas de bucket configuré.

Action :
- Backend endpoint `POST /uploads` avec multer
- Stockage MinIO sidecar (gratuit) OU Cloudflare R2 (10 GB gratuits)
- URLs signées TTL 1h
- Mobile/dashboard : remplacer base64 par upload vers `/uploads` puis poster l'URL

**1-2 jours de dev**. Sans ça les photos ne sont jamais transmises.

---

## 3. AMÉLIORATIONS importantes (P1 — à faire pendant les 2 premières semaines pilote)

### 3.1 — Service Worker offline
- Workbox pour Mobile PWA
- Précache tuiles Leaflet pour Matam (zooms 8/10/12, ~200 MB)
- BackgroundSyncPlugin pour rejouer signalements bloqués
- **3 jours de dev**

### 3.2 — Page diffusion (broadcast) dashboard complète
Actuellement la page broadcast existe mais basique. À enrichir :
- Liste templates pré-approuvés Meta WhatsApp
- Multi-sélection zones avec carte Leaflet
- Compteur SMS (160 chars max + warning)
- Preview multi-canal (WhatsApp / SMS / IVR / Push)
- Bouton "Envoyer test sur mon numéro"
- Champ confirmation TOTP avant envoi
- Idempotency-Key auto

**2 jours de dev**.

### 3.3 — Tests Jest backend
Couverture minimum 50% sur :
- `auth.service` (login, refresh, OTP rate limit, 2FA)
- `alerts.service` (create, validate, escalation cursus)
- `notifications` (fanout, retry, DLQ)

**3 jours de dev**.

### 3.4 — Tests E2E Playwright
3 scénarios :
- Citoyen : login OTP → signalement → confirmation
- Sentinelle : login → file → validation
- Préfet : login → page alertes → page détail → broadcast (avec MFA)

**2 jours de dev**.

### 3.5 — Logs centralisés Loki
- Promtail sur chaque conteneur
- Grafana + 3 dashboards sécurité (échecs auth, requêtes anormales, audit log)
- Alertmanager → Telegram OPS

**2 jours de dev**.

### 3.6 — Géocodage inverse
`lat=15.66, lng=-13.25` affiché brut → doit dire **"Wuro-Mamadou, Matam"**.
- Nominatim self-hosted OU Mapbox geocoding
- Hook `useReverseGeocode(lat, lng)` côté frontend
- Cache 24h Redis

**1 jour de dev**.

### 3.7 — i18n dashboard
Mobile en 4 langues mais dashboard 100% FR. Pour préfet Pulaar/Wolof non francophone.
- `next-intl` + extraction strings + traduction FR/Pulaar minimum

**3 jours de dev**.

### 3.8 — Cron jobs scheduler
- Clôture auto alertes validées > 48h sans activité
- Nettoyage OTP expirés
- Rotation refresh tokens
- Désactivation sentinelles inactives > 30 jours

**1 jour de dev**.

### 3.9 — Bouton "Diffuser" sur page détail alerte
Actuellement préfet valide à étape 4 mais l'action "diffuser" passe par page séparée. Améliorer :
- Bouton "Diffuser maintenant" direct sur AlertDetailPage si VALIDATED + role PREFECTURE+
- Compose message inline avec template auto-rempli

**0.5 jour**.

### 3.10 — Notifications dashboard (badge bell)
TopBar a une cloche mais inerte. Brancher :
- Alertes URGENCE nouvelles → toast + son
- Compteur unreadCount actif

**1 jour**.

---

## 4. AMÉLIORATIONS optionnelles (P2 — V1.5 ou V2)

| Item | Justif différé |
|---|---|
| IVR multilingue Africa's Talking | Coût + délais TTS Whisper |
| FCM push Android (notifications natives) | PWA suffit pilote |
| APK Play Store signé | PWA suffit pilote, V1 |
| Classification IA NLP doublons | Pas de données encore |
| Heat maps dashboard | Joli mais pas critique |
| Bot WhatsApp boutons interactifs | Templates Meta basiques OK pour MVP |
| Pen-test externe complet | Avant V1 (~5 j prestataire) |
| Wazuh HIDS | Quand SOC monté |
| Metabase BI | Quand bailleurs demandent |
| Multi-VPS HA Paris fallback | V2 |
| Modèles prédiction crue XGBoost | V2 (6 mois historique requis) |

---

## 5. Polish UX/UI à appliquer (P1)

### 5.1 Mobile
- ⬜ Loading skeletons sur AlertsScreen et FileScreen (pas juste un Loader2)
- ⬜ Animation de transition entre écrans (slide right/left)
- ⬜ Toast notifications (au lieu de `alert()` natif après actions)
- ⬜ Mode dark (toggle dans AccessibilitySettings)
- ⬜ Vibration haptique sur actions critiques (validate, send report)
- ⬜ Pull-to-refresh sur listes (touch event)

### 5.2 Dashboard
- ⬜ Breadcrumb dans TopBar (où suis-je ?)
- ⬜ Save filter view (localStorage)
- ⬜ Export CSV sur AlertTable + AuditLog
- ⬜ Mode plein-écran "salle de crise" (sidebar hidden)
- ⬜ Couches Leaflet superposables (zones touchées, refuges, points d'eau)
- ⬜ Recharts pour /analytics (déjà fait mais à enrichir)

### 5.3 Bot WhatsApp
- ⬜ Boutons interactifs (Reply Buttons + List Messages API)
- ⬜ Support note vocale → STT Whisper (V1)
- ⬜ Commande `/langue` persistante

---

## 6. Risques résiduels identifiés

| Risque | Probabilité | Impact | Mitigation actuelle | Action à prendre |
|---|---|---|---|---|
| Validation Meta WhatsApp retardée | Élevée | Élevé | Fallback SMS Africa's Talking | Démarrer J1 |
| Adoption sentinelles faible | Moyenne | Critique | Formation prévue Sprint 5 | Onboarding terrain intensif |
| Compte préfet compromis | Faible | Critique | MFA RequireTwoFaGuard | Audit log + Sentry alerting |
| Faux signalements en masse | Moyenne | Moyen | Rate limit OTP + vérif sentinelle | Politique sanctions GOVERNANCE.md |
| Saturation pic événement | Moyenne | Élevé | Bull queues + Redis | Tests de charge k6 (P1) |
| Catastrophe réelle pendant pilote | Plausible (saison pluies) | OPPORTUNITÉ + risque | Astreinte 24/7 obligatoire |
| Bailleur retire financement | Moyenne | Critique | Plusieurs bailleurs | Jalons mensuels visibles |
| Photo upload backend manquant | **CERTAINE actuellement** | Bloquant | — | À développer P0 (cf §2.7) |

---

## 7. Synthèse priorisée

### Avant la mise en ligne (3-4 semaines de travail)

**Bloquants techniques P0** :
1. Storage photos backend (multer + MinIO/R2) — **2 jours**
2. Page MFA TOTP enrollment UI — **1 jour**
3. Page broadcast complète dashboard — **2 jours**
4. Service Worker offline + tuiles — **3 jours**
5. Cron jobs (clôture, OTP cleanup) — **1 jour**
6. Backups automatiques + test restore — **1 jour**
7. Tests Jest 50% — **3 jours**

**Bloquants externes P0** :
8. VPS + DNS + TLS + Cloudflare — **1-3 jours**
9. Meta WhatsApp validation — **1-2 semaines** ⚠️ démarrer J1
10. Africa's Talking USSD shortcode — **5-15 j** ⚠️ démarrer J1
11. Sentry + UptimeRobot + Wasabi — **2 heures**

**Bloquants légaux P0** :
12. DPO + déclaration CDP — **2 semaines avocat**
13. Privacy + ToS validés — **1 semaine avocat**

### Polish 2 premières semaines pilote
- Tests E2E Playwright
- Logs centralisés Loki + alerting
- i18n dashboard
- Page détail "Diffuser maintenant"
- Notifications dashboard
- Toast notifications mobile
- Loading skeletons
- Géocodage inverse

### Backlog V1 (M+4)
- IVR multilingue
- FCM push Android
- APK Play Store
- Bot WhatsApp boutons interactifs
- Pen-test externe
- Tests de charge automatisés
- Templates broadcast dynamiques

### Backlog V2 (M+12)
- Multi-VPS HA
- iOS App Store
- IA classification + clustering doublons
- Modèles prédiction crue
- SIEM externalisé
- Metabase BI bailleurs
- Wazuh HIDS

---

## 8. Recommandation finale

**OLEL est techniquement prêt pour un pilote contrôlé** à condition de fermer :
- Les **2 P0 fonctionnels** (storage photos + MFA enrollment UI) — **3 jours de dev**
- Les **3 P0 légaux** (DPO + CDP + Privacy/ToS) — **2-3 semaines en parallèle**
- Les **3 P0 infra** (VPS + Cloudflare + secrets prod) — **2-3 jours**
- Les **2 P0 externes critiques** (Meta WhatsApp + Africa's Talking) — **2-3 semaines**

**Calendrier minimum réaliste** : **3 semaines** (en parallèle) pour le lancement pilote Wuro-Mamadou.

Toute autre amélioration peut se faire **après le lancement**. L'objectif est de valider le système en condition réelle, pas d'avoir un produit parfait.

**Décision recommandée** : lancer Sprint 0 du ROADMAP_OLEL.md immédiatement avec les 6 actions externes (VPS, domaine, Meta, Africa's Talking, DPO, comité pilotage). En parallèle l'équipe dev finalise les 7 points P0 internes en 2 semaines. Pilote live possible **J+21**.
