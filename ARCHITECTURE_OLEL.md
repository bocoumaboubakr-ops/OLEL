# OLEL — Architecture cible (MVP → V2)

> **Principe directeur** : commencer simple, prouver la valeur en zone pilote Matam, scaler progressivement. Aucun composant n'entre en V0 s'il n'est pas indispensable à sauver des vies.

---

## Architecture cible (V2 — référence)

```
                                ┌─────────────────────────┐
                                │   Cloudflare WAF + CDN  │
                                │   DNS + DDoS + cache    │
                                └────────┬────────────────┘
                                         │ HTTPS / WSS
              ┌──────────────────────────┼────────────────────────────┐
              │                          │                            │
              ▼                          ▼                            ▼
     ┌──────────────────┐      ┌──────────────────┐         ┌────────────────────┐
     │  app.olel.sn     │      │  m.olel.sn       │         │   api.olel.sn      │
     │  Dashboard Next  │      │  Mobile PWA Next │         │   Backend NestJS   │
     │  (autorités)     │      │  (citoyens+sent.)│         │  (4 instances HA)  │
     └──────────────────┘      └──────────────────┘         └─────────┬──────────┘
                                                                      │
                                                                      ├──► Postgres+PostGIS (primary+replica, daily backup→R2)
                                                                      ├──► Redis (Bull queues + sessions + cache)
                                                                      ├──► MinIO/R2 (photos, audio, exports)
                                                                      ├──► Loki (logs centralisés)
                                                                      └──► Prometheus + Grafana (métriques)

     ┌──────────────────┐      ┌──────────────────┐         ┌────────────────────┐
     │  bot.olel.sn     │      │  ussd.olel.sn    │         │   ivr.olel.sn      │
     │  WhatsApp Bot    │      │  USSD Gateway    │         │   IVR Gateway      │
     │  NestJS          │      │  Africa's Talking│         │   Africa's Talking │
     └────────┬─────────┘      └─────────┬────────┘         └─────────┬──────────┘
              │                          │                            │
              └──────────────┬───────────┴────────────────────────────┘
                             ▼
                ┌──────────────────────────┐
                │   Service-token (JWT)    │
                │   ↓ Backend API          │
                └──────────────────────────┘

     ┌──────────────────────────────────────────────────────────────────────────┐
     │                       External providers                                  │
     │  Meta WhatsApp Cloud · Africa's Talking SMS/USSD/IVR/TTS                 │
     │  Firebase Cloud Messaging · ANACIM weather · OpenStreetMap Nominatim     │
     │  Sentry · UptimeRobot                                                     │
     └──────────────────────────────────────────────────────────────────────────┘
```

### Composants par couche

#### Présentation
- **app.olel.sn** : dashboard Next.js (autorités).
- **m.olel.sn** : mobile PWA Next.js + Capacitor (citoyens, sentinelles).
- **APK signé** : Android Play Store (à partir de V1).

#### Edge / gateway
- **Cloudflare** : DNS, WAF, DDoS, cache statique, certificats TLS.

#### Application
- **api.olel.sn** : backend NestJS, 4 instances en HA derrière Nginx (`least_conn` load balancing).
- **bot.olel.sn** : NestJS WhatsApp Cloud webhook.
- **ussd.olel.sn** : NestJS endpoint USSD callback Africa's Talking.
- **ivr.olel.sn** : NestJS endpoint IVR callback Africa's Talking.

#### Données
- **Postgres+PostGIS** : DB primaire (réplique streaming pour reads + DR).
- **Redis** : sessions bot, file Bull, cache requêtes lourdes (alerts/stats), rate limiting.
- **MinIO/R2** : photos signalements, audio vocaux, exports PDF.
- **Loki** : logs structurés (rétention 30 j).
- **Prometheus** : métriques (rétention 15 j) → Grafana.

#### Observabilité
- **Sentry** : erreurs runtime (backend, dashboard, mobile).
- **UptimeRobot** : check `/health` externe toutes 5 min.
- **PostHog** : product analytics auto-hébergé.

#### Sécurité
- **HashiCorp Vault** (ou Doppler) : secrets, clés.
- **Cloudflare WAF** : règles OWASP.
- **Fail2ban** : protection SSH VPS.
- **Wazuh** : HIDS sur VPS (host intrusion detection).

#### Intégrations externes
- **Meta WhatsApp Cloud API** : envoi / réception messages.
- **Africa's Talking** : SMS, USSD, IVR, TTS.
- **Firebase Cloud Messaging** : push Android (et iOS via APNS).
- **ANACIM** : niveau fleuve, prévisions météo (XML / API).
- **OpenStreetMap Nominatim** : géocodage inverse.

---

## Architecture MVP (V0 — pilote Matam 6 semaines)

> **But** : prouver qu'OLEL fonctionne en situation réelle sur 1 commune (Wuro-Mamadou), avec 50 utilisateurs, 5 sentinelles, 1 préfet. Pas de scale ni de redondance.

### Stack minimale

```
                  Cloudflare (DNS + WAF gratuit)
                          │
              ┌───────────┼───────────┐
              ▼                       ▼
       app.olel.sn / m.olel.sn   api.olel.sn / bot.olel.sn
       ↓                              ↓
                  ┌──── VPS Hostinger 8 GB RAM ─────┐
                  │  Nginx + Docker compose         │
                  │  ├─ backend (NestJS)            │
                  │  ├─ bot (NestJS)                │
                  │  ├─ dashboard (Next)            │
                  │  ├─ mobile (Next PWA)           │
                  │  ├─ postgres+postgis            │
                  │  ├─ redis                       │
                  │  └─ minio (photos)              │
                  └─────────────────────────────────┘
                          │
                          ├──► Backup daily → Wasabi (5 $/mo)
                          ├──► Sentry cloud (free tier)
                          └──► UptimeRobot (free)
```

**Coût estimé** : ~50 €/mo (VPS + Wasabi + Africa's Talking pay-per-use).

### Inclus
- Auth OTP (citoyens) + login mot de passe (autorités) **+ MFA obligatoire MAIRIE+**
- Mobile PWA installable (manifest + Service Worker tuiles cachées)
- Signalement texte + photo (compressée) + audio
- Vérification terrain sentinelle (GPS + photo + gravité)
- Dashboard temps réel (carte, flux alertes, broadcast)
- WhatsApp Bot 4 langues + SMS sortant
- **USSD basique** (menu 3 niveaux pour signalement texte)
- Sauvegardes daily DB

### Exclu V0 (V1 ou +)
- IVR (V1)
- IA classification (V2)
- Push FCM (V1)
- App native APK Play Store (V1)
- Réplica Postgres (V2)
- Multi-VPS (V2)

---

## Architecture V1 (12 semaines après lancement pilote)

Ajouts par rapport au MVP :

```
                       Cloudflare WAF + CDN
                              │
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
        Front PWA        api.olel.sn       bot/ussd/ivr.olel.sn
                              │
                  ┌──── VPS Hostinger 16 GB ─────┐
                  │  Nginx + Docker              │
                  │  ├─ 2× backend instances     │
                  │  ├─ postgres + REPLICA       │
                  │  ├─ pgBouncer (pooling)      │
                  │  ├─ redis + redis-sentinel   │
                  │  ├─ minio                    │
                  │  ├─ loki + promtail          │
                  │  ├─ prometheus + grafana     │
                  │  └─ alertmanager             │
                  └──────────────────────────────┘
                              │
                              ├─► IVR Africa's Talking (TTS + DTMF)
                              ├─► FCM push Android
                              └─► APK signé Play Store
```

**Coût estimé** : ~150 €/mo.

### Ajouts V1
- IVR multilingue (touches DTMF)
- Push Android via FCM
- APK signé Play Store
- Replica Postgres lecture (queries reporting)
- Pooling pgBouncer
- Observabilité complète (Loki + Prometheus + Grafana + Alertmanager)
- Classification doublons d'alertes (clustering temporel + textuel)
- Heat maps dashboard

---

## Architecture V2 (24 semaines)

Ajouts pour scaler à 5 communes / 5000 utilisateurs :

```
                       Cloudflare WAF + CDN
                              │
       ┌──────────────────────┼──────────────────────┐
       ▼                                             ▼
   VPS Hostinger Dakar (actif)               VPS Hostinger Paris (réplica)
   ├─ 4× backend                             ├─ 2× backend (chaud)
   ├─ postgres primary                       ├─ postgres replica (streaming)
   ├─ redis cluster (3 noeuds)               ├─ redis cluster (3 noeuds)
   ├─ minio primary                          ├─ minio replica (lifecycle)
   ├─ vault                                  ├─ vault (HA)
   ├─ loki/prometheus/grafana                
   └─ alertmanager → Telegram OPS            
                              │
              ┌───────────────┼────────────────┐
              ▼                                 ▼
        iOS App Store           Modèles IA dédiés (XGBoost prédiction)
```

**Coût estimé** : ~400 €/mo.

### Ajouts V2
- Multi-zone HA (failover automatique Cloudflare)
- iOS App Store
- Modèles IA prédiction crue (entraînés sur historique pilote)
- Classification NLP multilingue (FR/PU/WO/SO)
- Transcription Whisper des notes vocales
- SIEM externalisé (CSIRT.sn)
- Tableau bord BI Metabase pour bailleurs

---

## Flux principaux (workflows techniques)

### Workflow 1 — Signalement citoyen (canal app)

```
[Citoyen] → ouvre m.olel.sn → tape "Signaler"
        ↓ choisit risk type + description + photo
        ↓ POST /api/v1/alerts (JWT citoyen)
[Backend] → validate DTO, store en DB (status=PENDING, currentStep=1)
        → EventEmitter: alert.created
        → Notification queue (broadcast aux sentinelles de la zone)
[WebSocket] → push aux dashboards connectés à `zone:<id>`
[Sentinelles] → reçoivent push (FCM) + voient en file de vérification
```

### Workflow 2 — Vérification sentinelle

```
[Sentinelle] → ouvre File à vérifier → choisit alerte
            → arrive sur site, ouvre Verify
            → GPS + photo + gravité + commentaire
            → PATCH /api/v1/alerts/:id/validate (action=CONFIRM, newLevel=DANGER)
[Backend] → crée Validation (alert, sentinel, level, comment)
        → update Alert.currentStep=2, alert.level=DANGER
        → EventEmitter: alert.validated
        → si DANGER ou URGENCE → escalade auto à Mairie (notify)
[Dashboard] → reçoit WS event → met à jour map + flux
```

### Workflow 3 — Broadcast préfectoral

```
[Préfet] → dashboard /broadcast → compose message, cible zone, valide
        → POST /api/v1/broadcasts (JWT prefet, MFA requis)
[Backend] → audit log (auteur, contenu, cible)
        → résout abonnés zone (subscribers via getSubscribersForZone)
        → Notification queue (parallèle : WhatsApp, SMS, push, voix IVR si activé)
        → update Alert.status=BROADCASTING
[Bot WhatsApp] → envoie template approuvé par Meta
[SMS] → envoi Africa's Talking
[FCM] → push Android
[USSD] → ne push pas (par nature pull), mais alertes apparaissent au prochain *123#
```

### Workflow 4 — Signalement USSD

```
[Citoyen téléphone non-smartphone] → tape *123*1#
[Africa's Talking USSD gateway] → POST callback à ussd.olel.sn/callback
[Backend USSD] → parse session, affiche menu (1=signaler 2=consulter 3=quitter)
            → si 1 → menu risque (1=crue 2=feu 3=santé)
            → puis menu zone (auto-géoloc par préfixe MSISDN ou demande)
            → confirme et crée Alert (sans GPS précis, mais avec zone)
        → réponse USSD finale : "Alerte envoyée, merci."
```

### Workflow 5 — Citoyen reçoit alerte IVR

```
[Backend] → broadcast déclenché URGENCE
        → pour chaque abonné rural sans WhatsApp → appel IVR Africa's Talking
[IVR] → numéro composé, callbck POST ivr.olel.sn/answer
[Backend IVR] → lit TTS multilingue : "Alerte crue Wuro-Mamadou. Evacuez immédiatement."
            → DTMF : 1 pour confirmer, 2 pour rappel SMS, 3 pour aide voisinage.
        → log de réception
```

---

## APIs (synthèse)

### Auth
- `POST /auth/otp/request` — OTP citoyen
- `POST /auth/otp/verify` — vérif OTP + zone → JWT
- `POST /auth/login` — mot de passe autorités
- `POST /auth/refresh` — refresh token
- `POST /auth/logout`
- `GET /auth/me`
- `POST /auth/2fa/setup` / `POST /auth/2fa/confirm` — TOTP
- `POST /auth/admin/users` — création admin (super admin only)
- `POST /auth/service-token` — token pour bots (BOT_API_KEY)

### Alerts
- `POST /alerts` — créer signalement
- `GET /alerts?filters` — liste paginée
- `GET /alerts/:id` — détail
- `PATCH /alerts/:id/validate` — sentinelle valide
- `GET /alerts/stats` — agrégats

### Broadcast
- `POST /broadcasts` — diffuser
- `GET /broadcasts` — historique
- `GET /broadcasts/:id`

### Zones / Sentinel / Team / Trainings / Missions
- Voir Swagger `/api/docs`.

### Bot
- `POST /webhook` — WhatsApp Meta (HMAC signed)
- `GET /webhook` — verify token

### **À ajouter MVP** :
- `POST /ussd/callback` — Africa's Talking
- `GET /health/live`, `GET /health/ready`
- `GET /metrics` (Prometheus)
- `POST /alerts/:id/close` — fermeture manuelle Mairie+

### **À ajouter V1** :
- `POST /ivr/answer` — Africa's Talking IVR
- `POST /push/register` — FCM token register
- `POST /alerts/:id/cluster` — fusion doublons IA

---

## Stockage

| Donnée | Stockage | Rétention | Backup |
|---|---|---|---|
| Users, alerts, validations, broadcasts | Postgres | indéfinie (soft delete 6 mois) | daily → Wasabi |
| Photos signalements | MinIO `alerts/{id}/photo.jpg` | 12 mois | mensuel |
| Audio vocaux | MinIO `voice/{id}.webm` | 6 mois | trimestriel |
| Sessions WhatsApp | Redis (TTL 30 min) | — | — |
| File Bull (notifs) | Redis (persisté AOF) | retry max 5 puis DLQ table | — |
| Logs structurés | Loki | 30 j | — |
| Métriques | Prometheus | 15 j | — |
| Audit log | Postgres table `audit_logs` | 5 ans (loi sénégalaise) | daily → Wasabi |
| Exports PDF | MinIO `exports/{date}/{id}.pdf` | 12 mois | — |

---

## Services tiers (par version)

| Service | MVP | V1 | V2 |
|---|---|---|---|
| Meta WhatsApp Cloud | ✅ | ✅ | ✅ |
| Africa's Talking SMS | ✅ | ✅ | ✅ |
| Africa's Talking USSD | ✅ | ✅ | ✅ |
| Africa's Talking IVR | — | ✅ | ✅ |
| Africa's Talking TTS | — | ✅ | ✅ |
| Firebase Cloud Messaging | — | ✅ | ✅ |
| Apple Push Notification | — | — | ✅ |
| Cloudflare WAF/CDN | ✅ | ✅ | ✅ |
| Wasabi backup S3 | ✅ | ✅ | ✅ |
| Sentry | ✅ (free) | ✅ (team $26) | ✅ |
| UptimeRobot | ✅ | ✅ | ✅ |
| PostHog | — | ✅ (self) | ✅ |
| Metabase | — | — | ✅ |
| HashiCorp Vault | — | ✅ (self) | ✅ (HA) |
| OpenAI Whisper STT | — | — | ✅ |
| OpenStreetMap Nominatim | ✅ (self) | ✅ | ✅ |
| ANACIM API | — | ✅ | ✅ |

---

## Décisions architecturales clés (ADR-style)

### ADR-001 — Monorepo Turbo
**Décision** : monorepo pnpm + Turbo.
**Pourquoi** : 4 apps + 1 lib UI partagent du code (types, mappers). Mono évite duplication.
**Conséquence** : un seul `pnpm install`. CI doit utiliser `turbo` pour cache.

### ADR-002 — Next.js partout côté front
**Décision** : Next.js pour dashboard ET mobile (au lieu de React Native).
**Pourquoi** : équipe Sénégal disponible en web > en RN ; PWA + Capacitor couvre les usages mobile sans RN.
**Conséquence** : pas de natif pur, mais Capacitor donne accès caméra/GPS/push.

### ADR-003 — Postgres + PostGIS plutôt que MongoDB
**Décision** : SQL transactionnel.
**Pourquoi** : audit trail strict, contraintes référentielles, géospatial.
**Conséquence** : migrations Prisma versionnées ; schéma stable.

### ADR-004 — Bull queues plutôt que Kafka
**Décision** : Bull (Redis).
**Pourquoi** : volume MVP modeste (< 10k notifs/jour), Kafka overkill.
**Conséquence** : si V2 dépasse 100k/jour, migrer vers RabbitMQ ou Kafka.

### ADR-005 — Capacitor plutôt que React Native
Voir ADR-002.

### ADR-006 — Hostinger VPS plutôt que cloud hyperscaler
**Décision** : VPS Hostinger Dakar.
**Pourquoi** : coût (10× moins cher qu'AWS), latence locale meilleure pour utilisateurs Sénégal.
**Conséquence** : moins de services managés. SRE doit gérer Postgres/Redis manuellement.
**Réversibilité** : Docker permet de migrer vers AWS/GCP plus tard sans réécrire.

### ADR-007 — Cloudflare gratuit
**Décision** : Cloudflare free tier devant tout.
**Pourquoi** : WAF + DDoS + CDN gratuits.
**Limite** : 100k req/jour free. Si dépassement → upgrade Pro ($20/mo).

---

## Dépendances critiques externes

| Dépendance | Risque | Mitigation |
|---|---|---|
| Meta WhatsApp Cloud API | Suspension compte = perte du canal #1 | Fallback SMS + USSD automatique. Templates conservés. |
| Africa's Talking | Service interruption | Multi-fournisseur (Twilio backup) en V2. |
| ANACIM (météo) | API instable | Cache 1h, fallback "données indisponibles". |
| Cloudflare | Banni en Russie/Chine — pas un risque ici | OK |
| Hostinger | Datacenter Dakar | V2 = second VPS Paris (DR). |

---

## Récapitulatif décisionnel

| Question | Réponse |
|---|---|
| Stack confirmée ? | ✅ Oui (Next + NestJS + Postgres + Bull) |
| Faut-il refactor ? | ❌ Non — la base est saine. |
| Faut-il ajouter des modules ? | ✅ Oui : USSD, IVR (P0), Push FCM (P0 V1), AuditLogViewer UI, Admin Center |
| Multi-tenancy ? | Pas en MVP. V2 si extension à d'autres régions. |
| Architecture événementielle distribuée ? | Non nécessaire en MVP. EventEmitter local + Bull suffisent. |
| Microservices ? | Non. Modular monolith. NestJS modules suffisent. |
| Kubernetes ? | Non en MVP/V1. V2 si > 4 VPS. |

Voir `ROADMAP_OLEL.md` pour la séquence de mise en œuvre.
