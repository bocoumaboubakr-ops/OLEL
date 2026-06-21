# 🔄 OLEL — Reprise de session (point de sauvegarde)

> **Objectif de ce fichier** : permettre à quiconque (toi, un nouveau dev, une nouvelle session IA) de reprendre EXACTEMENT là où on s'est arrêtés, sans avoir à relire l'historique de 100k tokens.
>
> **À LIRE EN PRIORITÉ** avant `SUIVI_SESSION.md` (qui est le détail granulaire des tests). Ce fichier-ci est le **résumé opérationnel**.

**Dernière mise à jour** : 2026-06-18 — fin de la session HTTPS olel.app.

---

## 🟢 État synthétique en 5 lignes

OLEL est une plateforme d'alerte précoce multi-risques pour la **région de Matam (Sénégal)**, déployée sur **VPS Hostinger 187.124.34.136** en HTTPS sur le domaine **olel.app**. Backend NestJS + Postgres/PostGIS + Redis + bot WhatsApp + mobile PWA + dashboard. **22 bugs critiques** trouvés et corrigés en session, le cursus **citoyen → sentinelle → mairie → diffusion → WhatsApp** fonctionne de bout en bout. Le workflow a été **refondu en v3** (cursus court urgence-first). Les **chantiers d'inclusion** (langues Pulaar/Wolof/Soninké, audio vocal WhatsApp, photo caméra) sont livrés. Reste à : valider l'enrôlement webhook Meta sur `bot.olel.app`, créer un token Meta permanent, faire relire les traductions par des locuteurs natifs avant le pilote.

---

## 🌐 Infrastructure live

### Accès production
| Élément | URL/Valeur |
|---|---|
| Dashboard autorités | **`https://olel.app`** (ou `https://app.olel.app`) |
| Mobile PWA citoyen/sentinelle | **`https://m.olel.app`** |
| API backend | **`https://api.olel.app`** |
| Webhook WhatsApp | **`https://bot.olel.app/webhook/whatsapp`** |
| Health check API | `https://api.olel.app/api/v1/health/live` |
| Health check bot | `https://bot.olel.app/health` |

### Serveur
- **VPS** : Hostinger `187.124.34.136` (srv1464451), Ubuntu 24.04, 95 GB, 80% utilisé
- **SSH** : `ssh root@187.124.34.136` (mot de passe sur place — Hostinger Console)
- **Code** : `/opt/olel`
- **Branche déployée** : `claude/laughing-hawking-4olx5k`
- **Repo GitHub** : `bocoumaboubakr-ops/OLEL` (PR #2 ouverte vers `main`)
- **Secrets/`.env`** : sur le VPS uniquement, **JAMAIS dans Git** (sauvegardes datées : `.env.bak.*`)

### Conteneurs Docker (stack complète)
| Conteneur | Port | Rôle |
|---|---|---|
| `olel-postgres` | 5434 | DB + PostGIS |
| `olel-redis` | 6380 | Bull queues + cache |
| `olel-backend` | 4000 | API NestJS |
| `olel-dashboard` | 3000 | Next.js autorités |
| `olel-mobile` | 3001 | Next.js PWA citoyens |
| `olel-bot` | 3002 | Webhook WhatsApp |
| `olel-nginx` | 80/443 | Reverse proxy + TLS |
| `olel-certbot` | — | Auto-renew Let's Encrypt (12 h) |

**Stack** : `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`

### Domaine + DNS
- **Domaine** : `olel.app` chez **BookMyName** (NS bNamed par défaut)
- **6 enregistrements A** vers `187.124.34.136` : `@`, `www`, `api`, `app`, `m`, `bot`
- **Certificat Let's Encrypt** : `/etc/letsencrypt/live/olel.app/` — couvre les 6 sous-domaines, renouvelé auto via conteneur `certbot` (cron 12 h)

### WhatsApp Cloud API (Meta)
| Élément | Valeur |
|---|---|
| App Meta | « OLEL Matam » |
| Numéro test | `+1 555 638 5802` (90 j gratuits) |
| Phone Number ID | `1154825947720369` |
| WABA ID | `27123736810617677` |
| `WHATSAPP_VERIFY_TOKEN` | dans `.env` du VPS |
| `WHATSAPP_APP_SECRET` | clé secrète Meta (dans `.env`, validée HMAC) |
| `WHATSAPP_TOKEN` | ⚠️ **temporaire 24 h** — à régénérer ou créer un System User Token permanent |
| Numéro destinataire test | `+221 77 476 59 07` (vérifié chez Meta) |

### Comptes de seed (mots de passe par défaut, à changer en prod)
| Rôle | Téléphone | MFA TOTP requis |
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

Mots de passe : `<Rôle>2024!` (ex. `Mairie2024!`, `Sent2024!`) — ou valeur `SEED_*_PASSWORD` du `.env` VPS.

---

## ✅ Ce qui a été fait (chronologique)

1. **Audit A→Z** (commit `109198e`) — MFA TOTP obligatoire MAIRIE+, chiffrement AES-256-GCM, verrouillage 10 échecs/15 min, quota OTP 5/j, SMS Africa's Talking branché, HMAC webhook (rawBody), seed prod sécurisé, CORS strict, .env hors Git, CI réparée (ESLint, tsconfig ui, uuid→crypto, specs Jest).

2. **Bot `/health` + fix conteneur unhealthy** (`fad6f37`).

3. **Découverte VPS sur mauvaise branche** (`gracious-ritchie` au lieu de `laughing-hawking`) → bascule + rebuild complet → MFA confirmé actif.

4. **Configuration WhatsApp Meta** : app créée, tunnel ngrok actif, envoi sortant validé, webhook config, HMAC validé.

5. **Page Signalements dashboard** (bug 9), **RBAC élargi SENTINELLE+** (bug 10), **scoping zone arborescent** (bug 11), **JWT porte zoneId** (bug 11).

6. **Validation MAIRIE crée alerte** (bug 12) : ferme le chaînon manquant signalement → alerte → diffusion.

7. **Vérification terrain sentinelle obligatoire** (bug 13) : `PATCH /signalements/:id/field-verify` avec GPS + notes + photo, MAIRIE bloquée tant que pas fait sur signalements sans preuve.

8. **GPS manuel en secours HTTP** (bug 14) + **signalements visibles dans mobile sentinelle** (bug 15).

9. **REFONTE WORKFLOW v3** (cursus court urgence-first) : 3 phases (RECEPTION → VERIFIEE → [CONFIRMEE] → DIFFUSEE), bypass urgence MAIRIE+, auto-escalade 15 min, fanout RGPD réparé (bug 16 cause racine du « pas de WhatsApp reçu »), scoping zone fanout (bug 19).

10. **Chantier 1 — Langues** (Pulaar/Wolof/Soninké/Français) : bot 100 % multilingue (choix langue 1ᵉʳ contact), notifications dans la langue de chaque destinataire, sélecteur langue mobile. ⚠️ **Traductions ff/wo/snk à FAIRE RELIRE par locuteurs natifs avant le pilote**.

11. **Chantier 2 — Audio** : vocal WhatsApp → téléchargement Meta → stockage → lecteur audio côté opérateur (dashboard + mobile sentinelle).

12. **Chantier 3 — Photo caméra + vocal in-app** : composant `MediaCapture` (caméra arrière, compression client, vocal MediaRecorder si HTTPS, fallback WhatsApp si HTTP).

13. **HTTPS olel.app** : nginx reverse-proxy 5 sous-domaines (api, app, m, bot, www), Certbot auto-renew, script `setup-https.sh` idempotent. Certificat Let's Encrypt obtenu pour `*.olel.app`.

---

## 🐛 Tous les bugs trouvés et corrigés (22)

| # | Description | Sévérité |
|---|---|---|
| — | (Audit) MFA TOTP non bloquant pour rôles MAIRIE+ | Critique |
| — | (Audit) Webhook HMAC sur rawBody manquant → webhooks Meta rejetés | Critique |
| — | (Audit) Filtre RGPD `consents.some.termsAccepted` bloquait 100% des destinataires | **Critique** |
| 1 | Test D1 : Signature HMAC invalide (cause racine = bug rawBody + token mal écrit) | Bloquant |
| 2 | VPS sur mauvaise branche `gracious-ritchie` (pré-audit) | Critique |
| 3 | `.env` écrasé par checkout → P1000 Postgres | Bloquant |
| 4 | Échec envoi WhatsApp = boucle Meta (webhook 500) | Élevée |
| 5 | Token Meta 24 h expiré | Bloquant D1 |
| 6 | `POST /signalements/bot` 400 (DTO refuse phone+severity) → AUCUN signalement WhatsApp enregistré | **Critique** |
| 7 | Menu bot « 2 » (alertes) → 401 (GET /alerts exige JWT) | Élevée |
| 8 | Dashboard inaccessible : `NEXT_PUBLIC_API_URL=localhost` baked | Bloquant |
| 9 | Pas de page Signalements côté dashboard | Bloquant UX |
| 10 | `GET /signalements` interdit aux SENTINELLES (RBAC trop strict) | Bloquant |
| 11 | Pas de scoping zone : signalement WhatsApp zone racine invisible aux sous-zones | Bloquant |
| 12 | Validation MAIRIE ne créait pas l'alerte → cursus mort après vérification | **Critique workflow** |
| 13 | Mairie pouvait valider en aveugle sans GPS ni photo | Critique métier |
| 14 | GPS bloqué en HTTP (caméra/géoloc indispo) | Bloquant chantier 3 |
| 15 | Signalements citoyens absents du mobile sentinelle | Bloquant E2E |
| 16 | Workflow trop long (5 humains) + fanout RGPD bloquant | **Critique** |
| 17 | Pas d'auto-escalade week-end/nuit | Élevée |
| 19 | Scoping zone fanout non arborescent | Élevée |
| 20 | Boucle infinie au choix de langue (session.lang vide rejouait menu) | Bloquant |
| 21 | `mediaUrls` `localhost` rejeté par `@IsUrl()` → vocal cassait signalement | Bloquant |
| 22 | URLs médias en `localhost:4000` → lecteur audio sans son côté opérateur | Bloquant UX |

---

## 🔴 Reste à faire (priorisé)

### 🚨 Bloquants pour le pilote
1. **Finaliser webhook Meta** : enregistrer l'URL `https://bot.olel.app/webhook/whatsapp` et token sur Meta → cercle vert. Statut au moment de la sauvegarde : ngrok marche en parallèle, donc Meta envoie sur ngrok. Il faut basculer vers bot.olel.app et **désabonner/réabonner** au champ `messages`. Une fois OK, **tuer ngrok définitivement** (`pkill ngrok`).
2. **Token Meta permanent** (System User Token) — fin des régénérations 24 h.
3. **Relecture native** Pulaar/Wolof/Soninké des fichiers `apps/bot/src/whatsapp/i18n.ts` + `apps/mobile/src/lib/i18n.ts` + `backend/src/common/i18n/alert-messages.ts` (chacun porte un `// À FAIRE RELIRE`).
4. **Templates Meta validés** (4 langues) — nécessaire pour notifier hors fenêtre de session 24 h.

### 🟡 Avant pilote (non-bloquant)
5. **Africa's Talking en mode prod** (actuellement sandbox = SMS simulés).
6. **DPO désigné + déclaration CDP** Sénégal.
7. **Privacy Policy + ToS** rédigés par avocat (en cours).
8. **Backups automatiques** : conteneur `--profile backup` à confirmer actif sur le VPS.
9. **Compte SMS prod** + **numéro Sénégal validé Meta** (au lieu du +1 555 638 5802 test).
10. **Mots de passe seed** à remplacer en prod (les défauts `<Rôle>2024!` sont publics dans le code).

### 🟢 Plan de test restant (B1-B10, C2-C6, E1-E7, F, G, H, I)
Voir `SUIVI_SESSION.md` §5. Sections déjà cochées :
- ✅ A1, A2, A3, A4 (auth + MFA)
- ✅ D1, D2 (bot WhatsApp entrant + signalement complet)
- Tout le reste : ⬜ à dérouler

### Chantiers nice-to-have post-pilote
- **Transcription audio auto** (Meta MMS Fulah + NLLB) en phase 2 — l'écoute humaine actuelle suffit pour le pilote.
- **Token permanent Africa's Talking + USSD shortcode**.
- **PWA install + push notifications**.
- **Tests E2E Playwright**.

---

## ⚙️ Comment reprendre la session

### 1. Si tu es l'utilisateur (PM/dev) — pour reprendre l'opérationnel
```bash
ssh root@187.124.34.136
cd /opt/olel
./scripts/health-check.sh                       # vérifier que tout tourne
git log --oneline -5                            # voir les derniers commits
docker compose ps                               # état des conteneurs
docker compose logs --tail 50 backend bot       # logs récents
```

### 2. Si tu es Claude dans une nouvelle session — lis dans cet ordre
1. **CE FICHIER** (`CONTEXT_REPRISE.md`) — synthèse opérationnelle
2. **`SUIVI_SESSION.md`** — détail du plan de test (63 tests, A-I) avec statuts
3. **`README.md`** — vision projet + architecture
4. **`CURSUS_ALERTE.md`** + **`WORKFLOWS_SCENARIOS_OLEL.md`** — métier
5. **`SECURITY_BLUEPRINT_OLEL.md`** — modèle de menace

Puis si tu codes :
- **Workflow v3** : `backend/src/alerts/alert-workflow.ts` (PHASE, nextStepFor, canAdvanceAt)
- **i18n bot** : `apps/bot/src/whatsapp/i18n.ts`
- **i18n mobile** : `apps/mobile/src/lib/i18n.ts`
- **MediaCapture** : `apps/mobile/src/lib/MediaCapture.tsx`
- **Bot service** : `apps/bot/src/whatsapp/whatsapp.service.ts`
- **Tests** : `cd backend && npx jest` (33 tests verts)

### 3. Pour redéployer après un commit
```bash
ssh root@187.124.34.136
cd /opt/olel
git pull origin claude/laughing-hawking-4olx5k
docker compose build [backend|bot|dashboard|mobile]
docker compose up -d [service]
```

> ⚠️ **Toujours rebuild `dashboard` et `mobile` après changement de `.env`** : `NEXT_PUBLIC_API_URL` est bakée dans le bundle Next.js.

### 4. En cas d'erreur — diagnostic rapide
```bash
docker compose logs --tail 50 <service>          # logs
docker exec olel-<service> printenv VAR_NAME     # variable d'env
docker exec olel-postgres psql -U olel olel -c "..."   # SQL
curl -v https://api.olel.app/api/v1/health/live  # API HTTPS
docker compose ps                                # état conteneurs
```

---

## ⚠️ Points d'attention CRITIQUES

1. **Token WhatsApp 24 h** : il expire chaque jour. Régénérer (ou créer System User Token permanent — instructions dans l'historique de session).

2. **Traductions non validées** : Pulaar/Wolof/Soninké sont une base brute. Sur une plateforme d'alerte, une mauvaise formulation peut coûter une vie. **OBLIGATOIRE : relecture native avant pilote**.

3. **Secrets exposés en chat** : pendant la session, ces secrets ont transité en clair dans la conversation :
   - `WHATSAPP_TOKEN` (de toute façon temporaire 24 h)
   - `WHATSAPP_APP_SECRET` = `2b9014405473e869770b2e1ade4303ac`
   - **À RÉINITIALISER** avant le pilote (bouton « Réinitialiser » à côté de « Clé secrète de l'app » dans Meta).

4. **Postgres mot de passe par défaut** : `olel_dev_pwd` toujours en place sur le VPS. À changer avant le pilote.

5. **HSTS activé** sur `*.olel.app` (max-age=31536000). Si tu changes le domaine, les navigateurs garderont le souvenir HTTPS pendant 1 an.

6. **Migration enum `AlertStep`** : le workflow v3 réutilise les anciennes valeurs (SIGNALEMENT=RECEPTION, MAIRIE=VERIFIEE, PREFECTURE=CONFIRMEE, BROADCAST=DIFFUSEE) pour rétrocompat. Les valeurs SENTINELLE/COORDINATEUR/GOUVERNANCE existent encore dans l'enum mais ne sont plus utilisées — `normalizePhase()` les mappe.

7. **JWT porte zoneId** : depuis le bug 11, le payload JWT inclut `zoneId`. **Les utilisateurs doivent se déconnecter/reconnecter** pour récupérer un token enrichi après changement de zone.

---

## 📊 Métriques de la session

- **Durée** : du 2026-06-09 au 2026-06-18 (10 jours)
- **Commits** : ~50 sur la branche `claude/laughing-hawking-4olx5k`
- **Lignes de code modifiées** : ~3000+ (audit + workflow v3 + i18n + chantiers)
- **Bugs corrigés** : 22 (dont 8 critiques bloquants)
- **Tests automatisés** : 33 passent (Jest backend)
- **Sous-domaines HTTPS** : 6 (api, app, m, bot, www, root)
- **Langues supportées** : 4 (fr, ff, wo, snk)

---

## 📞 Pour relancer le bot/dashboard si tout casse

```bash
cd /opt/olel
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
sleep 30
./scripts/health-check.sh
curl https://api.olel.app/api/v1/health/live
curl https://bot.olel.app/health
```

---

**Fin du fichier. Bon courage pour la suite. 🚨🌍**
