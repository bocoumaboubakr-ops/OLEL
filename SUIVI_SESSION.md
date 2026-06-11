# 📋 OLEL — Suivi de session : tests & corrections

> **Fichier de contexte vivant** — mis à jour à chaque étape pour ne perdre aucune information.
> **Objectif global** : tester TOUS les workflows et TOUTES les fonctionnalités du système, corriger ce qui doit l'être, et rendre OLEL le plus performant possible avant le pilote Matam.

**Dernière mise à jour** : 2026-06-11 — entrant WhatsApp : webhooks Meta reçus mais HMAC invalide (APP_SECRET à corriger + rebuild bot requis)

---

## 1. Infrastructure actuelle

| Élément | Valeur | État |
|---|---|---|
| VPS | Hostinger `187.124.34.136` (srv1464451), Ubuntu 24.04, 95 GB | ✅ Live |
| Répertoire projet | `/opt/olel` | ✅ |
| Branche déployée | `claude/laughing-hawking-4olx5k` | ✅ (audit inclus) |
| PR ouverte | #2 → `main` (mise à jour auto à chaque push) | 🟡 ouverte |
| Postgres+PostGIS | conteneur `olel-postgres`, port 5434 | ✅ healthy |
| Redis | conteneur `olel-redis`, port 6380 | ✅ healthy |
| Backend NestJS | conteneur `olel-backend`, port 4000 | ✅ healthy |
| Dashboard | conteneur `olel-dashboard`, port 3000 | ✅ |
| Mobile PWA | conteneur `olel-mobile`, port 3001 | ✅ |
| Bot WhatsApp | conteneur `olel-bot`, port 3002, endpoint `/health` | ✅ (rebuild fait) |
| Tunnel public | ngrok `https://defeat-consent-culinary.ngrok-free.dev` → :3002 | ⚠️ URL volatile (free) |
| Backup auto | conteneur `--profile backup` (cron 2h00, rétention 7 j) | ❓ à confirmer activé |
| Nginx + TLS | non configuré (accès par IP/ports) | ⬜ à faire avant pilote |
| Domaine olel.sn | non acheté | ⬜ à faire avant pilote |

## 2. Configuration WhatsApp Cloud API (Meta)

| Élément | Valeur | État |
|---|---|---|
| App Meta | « OLEL Matam » (type Business) | ✅ créée |
| Numéro test | `+1 555 638 5802` (90 jours gratuits) | ✅ |
| Phone Number ID | `1154825947720369` | ✅ dans `.env` VPS |
| WABA ID | `27123736810617677` | ✅ |
| Token | temporaire 24 h — **dans `.env` VPS uniquement, jamais en Git** | ✅ validé |
| Numéro destinataire test | `+221 77 476 59 07` (vérifié chez Meta) | ✅ |
| **Test sortant** (API → WhatsApp) | message reçu sur le téléphone | ✅ **VALIDÉ** |
| Webhook Meta configuré | URL ngrok + verify token | ✅ (webhooks reçus 2026-06-11 12:27) |
| Abonnement champ `messages` | | ✅ (messages arrivent) |
| `WHATSAPP_APP_SECRET` dans `.env` | requis pour HMAC entrant | ❌ **valeur incorrecte — cause du rejet HMAC** |
| **Test entrant** (WhatsApp → bot) | webhooks arrivent mais rejetés (HMAC) | 🔄 en cours de correction |
| Token permanent (System User) | à créer après les tests | ⬜ |
| Templates Meta (4 langues) | requis pour notifier hors session 24 h | ⬜ |

## 3. Historique de la session (résumé)

1. **Audit A→Z** (commit `109198e`) : MFA TOTP obligatoire MAIRIE+ (login 2 étapes), chiffrement TOTP AES-256-GCM, verrouillage 10 échecs/15 min, quota OTP 5/j, SMS réel Africa's Talking branché, HMAC webhook corrigé (**rawBody manquant = bug bloquant prod**), seed prod sécurisé, CORS WS restreint, `.env` sorti de Git, CI réparée (ESLint, tsconfig ui, uuid→crypto, specs Jest). **Vérifié : type-check 5/5, lint 0 erreur, tests 33/33, builds 4/4.**
2. **Fix bot /health** (commit `fad6f37`) : endpoint manquant → conteneur "unhealthy" à tort ; health-check.sh ne teste plus Swagger en prod (404 voulu).
3. **Déploiement VPS** : git pull + rebuild faits par l'utilisateur ; stack verte.
4. **Paramétrage WhatsApp** : app Meta créée, tunnel ngrok actif, token validé via `graph.facebook.com/me`, **envoi sortant confirmé sur le téléphone**.

## 4. Comptes de test (seed)

| Rôle | Téléphone | MFA requis |
|---|---|---|
| SUPER_ADMIN | +221700000000 | 🔐 oui |
| ADMIN | +221700000001 | 🔐 oui |
| SUPERVISEUR_REGIONAL | +221700000002 | 🔐 oui |
| GOUVERNORAT | +221700000003 | 🔐 oui |
| PROTECTION_CIVILE | +221700000004 | 🔐 oui |
| PREFECTURE | +221700000005 | 🔐 oui |
| MAIRIE | +221700000006 | 🔐 oui |
| COORDINATEUR | +221700000007 | non |
| HYDRO_METEO | +221700000008 | 🔐 oui |
| RADIO_COMMUNAUTAIRE | +221700000009 | non |
| SENTINELLE | +221700000010 | non |
| CITOYEN | +221700000011 | non (OTP) |

Mots de passe : valeurs `SEED_*_PASSWORD` du `.env` VPS (ou défauts dev si seedé avant l'audit).

---

## 5. PLAN DE TEST EXHAUSTIF

> Légende : ⬜ à faire · 🔄 en cours · ✅ validé · ❌ bug trouvé (voir §6)

### A. Authentification & sécurité

| # | Test | Statut |
|---|---|---|
| A1 | Login mot de passe CITOYEN/SENTINELLE → tokens directs | ⬜ |
| A2 | Login ADMIN → `mfaSetupRequired` + écran enrôlement TOTP dashboard | ⬜ |
| A3 | Enrôlement TOTP (Google Authenticator) + login complet | ⬜ |
| A4 | Re-login ADMIN → `mfaRequired` → code TOTP → tokens | ⬜ |
| A5 | mfaToken utilisé comme access token → rejet 401 | ⬜ |
| A6 | 10 mots de passe faux → verrouillage 15 min | ⬜ |
| A7 | OTP citoyen : request + verify (RETURN_OTP_DEV_CODE ou SMS réel) | ⬜ |
| A8 | OTP : 2ᵉ demande < 1 min → refus ; 6ᵉ demande du jour → refus | ⬜ |
| A9 | Refresh token : rotation OK, refresh avec mfaToken → rejet | ⬜ |
| A10 | Rate-limit : 6ᵉ login en 1 min → HTTP 429 | ⬜ |

### B. Workflow alerte — cursus 6 étapes (CURSUS_ALERTE.md)

| # | Test | Statut |
|---|---|---|
| B1 | SENTINELLE crée une alerte (GPS + photo + gravité obligatoires) | ⬜ |
| B2 | Étape SIGNALEMENT → VERIFICATION (validation MAIRIE) | ⬜ |
| B3 | Escalade → PREFECTURE (validation niveau 2) | ⬜ |
| B4 | Niveau ROUGE_FONCE → étape GOUVERNANCE + validations critiques 3 catégories | ⬜ |
| B5 | Décision : diffusion (`/alerts/:id/broadcast`) | ⬜ |
| B6 | Clôture alerte (`/alerts/:id/close`) + historique complet (`/alerts/:id/history`) | ⬜ |
| B7 | Rejet d'une alerte par un validateur → statut REJECTED | ⬜ |
| B8 | Rôle non habilité tente de valider → 403 | ⬜ |
| B9 | Idempotency-Key : double POST /alerts → une seule alerte | ⬜ |
| B10 | Alerte clôturée → advance → 403 (terminal) | ⬜ |

### C. Canaux de diffusion

| # | Test | Statut |
|---|---|---|
| C1 | Diffusion → message WhatsApp reçu (numéro test) | ⬜ |
| C2 | Diffusion → SMS (sandbox Africa's Talking = simulé, vérifier logs) | ⬜ |
| C3 | WebSocket dashboard : alerte créée → apparaît en temps réel | ⬜ |
| C4 | File Bull : job notification visible puis traité (logs backend) | ⬜ |
| C5 | Échec d'envoi → DLQ / NotificationLog en échec persisté | ⬜ |
| C6 | File radio (RADIO_COMMUNAUTAIRE) : diffusion préfixée | ⬜ |

### D. Bot WhatsApp (conversation entrante)

| # | Test | Statut |
|---|---|---|
| D1 | Message texte → bot reçoit (logs) + répond menu | ⬜ |
| D2 | Flux signalement complet via bot → `POST /signalements/bot` → visible dashboard | ⬜ |
| D3 | HMAC : requête forgée sans signature → rejetée (logs) | ⬜ |
| D4 | Webhook GET verify : token correct → challenge ; incorrect → Forbidden | ⬜ |

### E. Mobile PWA (citoyen + sentinelle)

| # | Test | Statut |
|---|---|---|
| E1 | Login OTP citoyen depuis le téléphone | ⬜ |
| E2 | Signalement avec photo (compression côté client) + GPS | ⬜ |
| E3 | Mode offline : signalement hors ligne → file IndexedDB → rejeu au retour réseau | ⬜ |
| E4 | Réception liste alertes de sa zone | ⬜ |
| E5 | Bouton SOS header | ⬜ |
| E6 | Service worker : app se charge offline (cache) | ⬜ |
| E7 | Sentinelle inactive → login OK mais fonctionnalités restreintes | ⬜ |

### F. Dashboard autorités

| # | Test | Statut |
|---|---|---|
| F1 | Carte Leaflet : alertes positionnées, fond OSM | ⬜ |
| F2 | Feed temps réel + détail alerte + badges niveau (BLEU→ROUGE_FONCE) | ⬜ |
| F3 | Création alerte via modal (ADMIN/PREFECTURE) | ⬜ |
| F4 | Page admin : liste users, changement de rôle (12 rôles), pagination | ⬜ |
| F5 | Page sentinelles : création par MAIRIE (mdp temporaire), restriction zone | ⬜ |
| F6 | Stats bar : compteurs corrects (`/stats/summary`) | ⬜ |
| F7 | Gardes d'accès front par rôle (menus `/permissions/me/menus`) | ⬜ |
| F8 | Logout + redirection login | ⬜ |

### G. Modules support

| # | Test | Statut |
|---|---|---|
| G1 | Formations : liste, complétion leçon, statut sentinelle (`/trainings/me/status`) | ⬜ |
| G2 | Activation sentinelle après formations obligatoires | ⬜ |
| G3 | Missions : créer, assigner, accepter, compléter, rejeter | ⬜ |
| G4 | Territoires : régions/départements/communes (lecture + création ADMIN) | ⬜ |
| G5 | Zones : hiérarchie Matam + 6 sous-zones | ⬜ |
| G6 | Upload photo : JPEG OK, .exe refusé, > 10 MB refusé | ⬜ |
| G7 | Audit log : actions sensibles tracées (`/audit`) | ⬜ |
| G8 | Feature flags : toggle + effet | ⬜ |
| G9 | USSD `POST /ussd/session` : menu 3 niveaux → création alerte source USSD | ⬜ |
| G10 | IVR `POST /ivr/webhook` : XML réponse correct | ⬜ |
| G11 | Métriques Prometheus `/metrics` | ⬜ |
| G12 | Schedulers : relance sentinelles inactives, expiration alertes (logs cron) | ⬜ |

### H. Scénarios catastrophe end-to-end (WORKFLOWS_SCENARIOS_OLEL.md)

| # | Scénario | Statut |
|---|---|---|
| H1 | Inondation : signal faible → terrain → vérif → escalade → préfet → diffusion → suivi | ⬜ |
| H2 | Feu de brousse : urgence, escalade immédiate | ⬜ |
| H3 | Incendie urbain : coordination rapide | ⬜ |
| H4 | Accident route : multi-canal + Protection Civile | ⬜ |
| H5 | Alerte sanitaire : clearance médicale (`/alerts/:id/medical-clearance`) | ⬜ |
| H6 | Vent de sable / météo : HYDRO_METEO origine | ⬜ |

### I. Performance & robustesse

| # | Test | Statut |
|---|---|---|
| I1 | Temps de réponse API < 500 ms (GET /alerts, /stats) sous charge légère | ⬜ |
| I2 | 50 alertes + 100 users : pagination fluide | ⬜ |
| I3 | Redémarrage backend → reprise sans perte (jobs Bull persistés Redis) | ⬜ |
| I4 | Coupure Postgres → backend `ready` KO → récupération auto | ⬜ |
| I5 | Backup : dump présent + test de restore réel | ⬜ |
| I6 | Mémoire conteneurs stable après 24 h | ⬜ |

---

## 6. Bugs trouvés pendant les tests & corrections

| # | Date | Bug | Gravité | Correction | Commit |
|---|---|---|---|---|---|
| — | 2026-06-10 | (avant tests) bot sans `/health` → unhealthy | Moyenne | endpoint ajouté | `fad6f37` |
| — | 2026-06-10 | (avant tests) HMAC sur rawBody absent → webhooks Meta tous rejetés | **Critique** | `rawBody: true` | `109198e` |
| 1 | 2026-06-11 | Test D1 : webhooks Meta reçus mais « Signature HMAC invalide » — WHATSAPP_APP_SECRET placeholder dans .env VPS + conteneur bot sur image 109198e (pas de /health → rebuild jamais fait, seulement recreate) | Bloquant entrant | Vraie clé secrète Meta dans .env + git pull + docker compose build bot | (opération VPS) |

*(à compléter au fil des tests)*

---

## 7. Prochaines étapes immédiates

1. 🔄 **Test entrant WhatsApp** : webhook OK côté Meta ; reste à (a) mettre la vraie « Clé secrète de l'app » Meta dans WHATSAPP_APP_SECRET, (b) git pull + docker compose build bot (l'image VPS date de 109198e, sans /health), (c) renvoyer un message test
2. ⬜ Dérouler le plan §5 section par section (A → I), cocher, noter les bugs en §6
3. ⬜ Corriger les bugs au fil de l'eau (commits sur la branche → PR #2)
4. ⬜ Après les tests : token permanent Meta + templates + Nginx/TLS + domaine

## 8. Rappels & contraintes connues

- ⚠️ Token Meta = temporaire 24 h → régénérer demain ou créer System User Token
- ⚠️ URL ngrok change à chaque redémarrage → re-configurer le webhook Meta
- ⚠️ `TOTP_ENCRYPTION_KEY` : ne plus jamais la changer après le 1ᵉʳ enrôlement TOTP
- ⚠️ Mode test Meta : 5 destinataires max, fenêtre de session 24 h pour messages libres
- ⚠️ Sandbox Africa's Talking : SMS/IVR simulés (logs uniquement) tant que pas de clé prod
- 🔐 Aucun secret dans ce fichier ni dans Git — tout est dans `/opt/olel/.env` (VPS)
