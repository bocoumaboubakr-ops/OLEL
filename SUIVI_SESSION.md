# 📋 OLEL — Suivi de session : tests & corrections

> **Fichier de contexte vivant** — mis à jour à chaque étape pour ne perdre aucune information.
> **Objectif global** : tester TOUS les workflows et TOUTES les fonctionnalités du système, corriger ce qui doit l'être, et rendre OLEL le plus performant possible avant le pilote Matam.

**Dernière mise à jour** : 2026-06-13 — CHANTIER 1/3 LANGUES livré : i18n Pulaar/Wolof/Soninké/Français. Bot WhatsApp 100% multilingue (choix langue au 1er contact), notifications d'alerte envoyées dans la langue de chaque destinataire, sélecteur de langue mobile (profil+login) propagé au backend. ⚠️ Traductions à FAIRE RELIRE par natifs avant pilote. Reste : chantier 2 (audio) + chantier 3 (photo caméra).

---

## 1. Infrastructure actuelle

| Élément | Valeur | État |
|---|---|---|
| VPS | Hostinger `187.124.34.136` (srv1464451), Ubuntu 24.04, 95 GB | ✅ Live |
| Répertoire projet | `/opt/olel` | ✅ |
| Branche déployée | `claude/laughing-hawking-4olx5k` (audit + fixes) — bascule + rebuild complet faits le 11/06 | ✅ confirmé (MFA actif via curl) |
| PR ouverte | #2 → `main` (mise à jour auto à chaque push) | 🟡 ouverte |
| Postgres+PostGIS | conteneur `olel-postgres`, port 5434 | ✅ healthy |
| Redis | conteneur `olel-redis`, port 6380 | ✅ healthy |
| Backend NestJS | conteneur `olel-backend`, port 4000 | ✅ healthy |
| Dashboard | conteneur `olel-dashboard`, port 3000 | ✅ |
| Mobile PWA | conteneur `olel-mobile`, port 3001 | ✅ |
| Bot WhatsApp | conteneur `olel-bot`, port 3002, routes /webhook/whatsapp + /health | ✅ healthy |
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
| `WHATSAPP_APP_SECRET` dans `.env` | clé secrète Meta | ✅ HMAC validé (messages traités) |
| **Test entrant** (WhatsApp → bot) | menu reçu sur le téléphone après nouveau token | ✅ **VALIDÉ** |
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
| A1 | Login mot de passe CITOYEN/SENTINELLE → tokens directs | ✅ (login SENTINELLE dashboard sans MFA, 12/06) |
| A2 | Login ADMIN → `mfaSetupRequired` + écran enrôlement TOTP dashboard | ✅ (curl 11/06 : mfaSetupRequired:true + mfaToken) |
| A3 | Enrôlement TOTP (Google Authenticator) + login complet | ✅ (login MAIRIE dashboard 12/06) |
| A4 | Re-login MAIRIE/ADMIN → `mfaRequired` → code TOTP → tokens | ✅ (12/06) |
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
| D1 | Message texte → bot reçoit (logs) + répond menu | ✅ |
| D2 | Flux signalement complet via bot → `POST /signalements/bot` → visible dashboard | ✅ (mairie + sentinelle voient le signalement WhatsApp, 12/06) |
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
| E8 | Sentinelle mobile : signalements citoyens visibles dans l'onglet Valider + vérification terrain (GPS ou manuel) | 🔄 livré, à tester après redéploiement |

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
| 1 | 2026-06-11 | Test D1 : « Signature HMAC invalide » sur tous les webhooks Meta entrants | Bloquant entrant | Cause racine trouvée : VPS sur branche pré-audit (bug rawBody non corrigé) + APP_SECRET mal écrit dans .env (sed sans le nom de variable) | (opération VPS) |
| 2 | 2026-06-11 | **VPS sur mauvaise branche** : `gracious-ritchie-ZLtdg`@49795d8 = AUCUN correctif d'audit en prod (pas de MFA, pas de fix HMAC/rawBody, pas de quotas OTP, anciens bugs pagination/workflow inclus) | **Critique** | ✅ RÉSOLU : checkout laughing-hawking + rebuild complet, MFA confirmé actif | (opération VPS) |
| 3 | 2026-06-11 | .env écrasé par le checkout (placeholders) → P1000 Postgres + bot en mode SIMUL | Bloquant | ✅ RÉSOLU : .env reconstruit, ALTER USER postgres, vraies valeurs WhatsApp réinjectées | (opération VPS) |
| 4 | 2026-06-11 | Échec d'envoi WhatsApp (Graph 401) → exception → webhook 500 → Meta re-livre le même message en boucle | Élevée | sendText catch + log détail Meta, contrôleur try/catch par message (toujours 200) | (commit bot resilience) |
| 5 | 2026-06-11 | Token Meta temporaire expiré (24 h) → bot ne peut pas répondre | Bloquant D1 | ✅ RÉSOLU : nouveau token régénéré, D1 validé. **TODO** : System User Token permanent à créer pour ne plus refaire ça chaque jour | — |
| 6 | 2026-06-11 | **POST /signalements/bot → 400** : le bot envoie phone+severity, le DTO les refuse (whitelist) → AUCUN signalement WhatsApp enregistré (incendie Ogo 16:04 et crue Soubalo 20:56 perdus) | **Critique** | DTO accepte phone (E.164) + severity (1-3) ; service attribue au vrai citoyen (création auto compte CITOYEN) ; migration colonne severity | en cours de push |
| 7 | 2026-06-11 | Menu bot option 2 (alertes actives) → 401 : GET /alerts exige un JWT, la clé bot ne passe pas | Élevée | Nouveau endpoint GET /alerts-bot/active (BotApiKeyGuard) + bot mis à jour | en cours de push |
| 8 | 2026-06-11 | Dashboard inaccessible depuis le navigateur : NEXT_PUBLIC_API_URL baked = localhost:4000 (pointe vers la machine du visiteur, pas le VPS) | Bloquant F* | `./scripts/configure-ip.sh 187.124.34.136` + rebuild dashboard/mobile | (opération VPS) |
| 9 | 2026-06-11 | Dashboard n'a AUCUNE page « Signalements » (juste un compteur dans StatsBar) | Bloquant D2/F | Création apps/dashboard/src/app/signalements/page.tsx (liste + filtre statut + validation/rejet) + lien dans le header | en cours de push |
| 10 | 2026-06-11 | `GET /signalements` interdit aux SENTINELLES + autres opérateurs locaux (RBAC limité à ADMIN/PREFECTURE/MAIRIE) | Bloquant pour la sentinelle | RBAC étendu à SENTINELLE/COORDINATEUR/RADIO/HYDRO/GOUVERNORAT/PROTECTION_CIVILE/SUPERVISEUR_REGIONAL | en cours de push |
| 11 | 2026-06-11 | Pas de scoping par zone : un signalement WhatsApp rattaché à la zone racine Matam n'est pas vu par un maire d'Ourossogui (sous-zone) | Bloquant visibilité dashboard | ✅ RÉSOLU et confirmé sur le VPS (12/06) | déployé |
| 12 | 2026-06-12 | Valider un signalement ne fait que changer son statut : il ne « remonte » jamais dans le flux des alertes en cours — le cursus s'arrête net après la vérification mairie | **Critique workflow** | La validation MAIRIE/PREFECTURE/ADMIN crée automatiquement une Alerte (titre = type + zone, niveau = gravité 1→JAUNE 2→ORANGE 3→ROUGE, GPS/photos repris, signalement lié via alertId, fanout notifications + WebSocket) | en cours de push |

*(à compléter au fil des tests)*

---

## 7. Prochaines étapes immédiates

1. 🔄 **Bascule de branche VPS** : sauvegarder .env → checkout `laughing-hawking-4olx5k` → restaurer .env (avec APP_SECRET réparé) → `docker compose build` COMPLET (toute la stack était pré-audit) → vérifier MFA actif via curl login ADMIN → re-test entrant WhatsApp
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
- ⚠️ La clé secrète Meta et des tokens temporaires ont transité par le chat de session → **réinitialiser la clé secrète de l'app Meta + régénérer le token après la phase de tests**
