# 🚀 OLEL — Sprint 0 GO — Tableau de bord opérationnel

**Date de lancement** : 2026-06-03  
**Fin Sprint 0** : 2026-06-17 (2 semaines)  
**Objectif** : Tous les P0 externes + légal lancés, dev active sur P0 technique

---

## 📊 Vue d'ensemble rapide

| Phase | Items | Statut | ETA |
|-------|-------|--------|-----|
| 🔴 **Externe P0** | Meta, Africa's, Infra, Secrets | 🔴 À démarrer URGENT | J1-J14 |
| 🔴 **Dev P0** | Storage, MFA, USSD, Rate limit | 🟡 Dev active | J1-S2 |
| 🔴 **Légal P0** | DPO, CDP, Privacy, ToS | 🟡 Avocat engagé | S1-S4 |
| 🟠 **P1** | Tests, admin, monitoring | ⏳ Après déploiement prod | S2+ |

---

## 🔥 ACTIONS CRITIQUES JOUR 1-3 (IMMÉDIAT)

### ✅ **J1 — Lancing externe**

**À faire AUJOURD'HUI par PM/CEO** :

- [ ] **Meta WhatsApp Business**
  - Aller sur https://business.facebook.com
  - Créer compte Business
  - Demander accès "WhatsApp Business Account"
  - Numéro dédié : +221 (Sénégal) si possible
  - 🔔 **Délai attendu** : 1-2 semaines ⚠️
  - **Contact Meta** : escalade possible via API docs

- [ ] **Africa's Talking Account**
  - Site : https://africastalking.com
  - Signup + KYC verification
  - Demander : **SMS SMS + USSD + IVR** (tous les 3)
  - USSD shortcode Sénégal (numéro court genre *123#)
  - Crédits : charger 100 € (testing + premiers jours pilote)
  - 🔔 **Délai attendu** : 5-15 jours ⚠️
  - **Support** : help@africastalking.com

- [ ] **Avocat/DPO**
  - Appeler cabinet local Dakar (ex: Sarr & Associés)
  - Mandat : relecture Privacy Policy + ToS (sénégalais + RGPD)
  - Budget : ~500-1000 € (3-5 jours travail)
  - **ETA** : début S2 pour validation

- [ ] **Envoyer brief équipe** : qui fait quoi, deadlines claires

---

### ✅ **J2 — Infra & Secrets (SRE)**

**À faire JOUR 2 par SRE** :

- [ ] **VPS Hostinger 8 GB** (Dakar ou Paris)
  - Commander via https://www.hostinger.com/vps
  - Spécs : Ubuntu 22.04 LTS, 8 GB RAM, 160 GB SSD, Dakar datacenter
  - Budget : ~25 €/mois
  - ✅ Livraison : instant
  - Récupérer : IP, login SSH, port SSH

- [ ] **Domaine `olel.sn`**
  - Registrar : ex Afrinic, Netim, OVH Senegal
  - Budget : ~15 €/an
  - Créer DNS records pour 4 sous-domaines :
    - `api.olel.sn` → IP VPS
    - `app.olel.sn` → IP VPS (Nginx upstream)
    - `m.olel.sn` → IP VPS (Nginx upstream)
    - `bot.olel.sn` → IP VPS (Nginx upstream)

- [ ] **Générer secrets prod** (locale, pas en repo)
  ```bash
  # Sur ta machine locale (JAMAIS en prod d'abord)
  openssl rand -hex 32  # Répéter 5 fois
  
  # Secrets générés :
  JWT_SECRET=<...>
  JWT_REFRESH_SECRET=<...>
  TOTP_ENCRYPTION_KEY=<...>
  BOT_API_KEY=<...>
  POSTGRES_PASSWORD=<...>
  
  # Stockage temporaire : fichier .env.production LOCAL only
  ```

- [ ] **Cloudflare setup** (gratuit)
  - Créer compte https://dash.cloudflare.com
  - Pointer domaine `olel.sn` vers Cloudflare nameservers
  - Activer : WAF (gratuit), DDoS (gratuit), cache (gratuit)
  - Zone : olel.sn (free tier = 100k req/jour)

- [ ] **Sentry + UptimeRobot + Wasabi**
  ```
  Sentry : https://sentry.io (free tier)
    → Créer projet NestJS + Next.js + React Native
    → Récupérer DSN_BACKEND, DSN_FRONTEND, DSN_MOBILE
  
  UptimeRobot : https://uptimerobot.com (free tier)
    → Monitor : https://api.olel.sn/health/live (check 5 min)
    → Notif Telegram channel ops
  
  Wasabi : https://wasabi.com (backup S3)
    → Bucket : olel-backup-prod (privé)
    → Budget : ~5 €/mois
    → Générer access key / secret key
  ```

- [ ] **Créer `.env.production.vault`** chiffré (temporaire)
  - Outil : SOPS (simple-secrets) OU Doppler
  - Alternative facile : copier `.env.example`, remplir secrets, **garder LOCAL**
  - Ne jamais committer en clair

---

### ✅ **J3 — Dev team kickoff (CTO + 3 devs)**

**À faire JOUR 3 par Dev Lead** :

- [ ] **GitHub repo setup**
  - Créer branches : `main`, `staging`, `develop`
  - Protection branches : require PR review avant merge
  - Create GitHub Actions workflow `.github/workflows/ci.yml` (minimal)
  - Documenter : qui commit quoi où

- [ ] **Dev kick-off réunion** (30 min)
  ```
  Participants : 3 devs full-stack + PM + CTO
  
  Agenda :
  1. Affectation tâches P0 (dev répart entre eux)
  2. Dev P0-13 (storage photos) : sprint 1-2 j
  3. Dev P0-14 (MFA UI) : 1 jour
  4. Dev P0-15 (MFA middleware) : 1 jour
  5. Dev P0-16 (OTP rate limit) : 4h
  6. Dev P0-17 (USSD backend) : 2 jours
  7. Backups script bash : 2h
  8. Test planning (Jest + E2E Playwright) : S2
  9. Standup daily 9h pendant Sprint 0
  ```

- [ ] **Jira/GitHub Issues board**
  - Créer issues pour chaque P0 dev (P0-13 à P0-17)
  - Labels : `P0`, `blocked`, `urgent`
  - Assigner dev owner + deadline

---

## 📋 **TABLEAU SUIVI SPRINT 0**

### **Phase 1 : Externe (PARALLÈLE)**

| # | Tâche | Owner | Début | Fin | Status |
|---|-------|-------|-------|-----|--------|
| P0-1 | Meta WhatsApp account | PM | J1 | J14 | 🔴 |
| P0-2 | Africa's Talking account + USSD | SRE | J1 | J14 | 🔴 |
| P0-3 | VPS Hostinger 8GB | SRE | J2 | J3 | 🔴 |
| P0-4 | Domaine + DNS | SRE | J2 | J5 | 🔴 |
| P0-5 | Désigner DPO | CEO | J1 | J3 | 🔴 |
| P0-6 | CDP declaration | DPO | J3 | J10 | 🔴 |
| P0-7 | Sentry setup | SRE | J2 | J3 | 🔴 |
| P0-8 | UptimeRobot + Wasabi | SRE | J2 | J3 | 🔴 |
| P0-18 | Privacy Policy (avocat) | DPO | J1 | S4 | 🔴 |
| P0-19 | ToS (avocat) | DPO | J1 | S4 | 🔴 |

**Chemin critique** : **Meta + Africa's = 2-3 sem**. Pas d'attente !

---

### **Phase 2 : Dev P0 (SÉQUENTIEL)**

| # | Tâche | Dev | Sprint | Délai | Status |
|---|-------|-----|--------|-------|--------|
| P0-13 | Storage photos backend | Dev1 | S1 | 2j | 🟡 |
| P0-14 | MFA TOTP UI enrollment | Dev2 | S1 | 1j | 🟡 |
| P0-15 | MFA mandatory middleware | Dev1 | S1 | 1j | 🟡 |
| P0-16 | OTP rate limit | Dev3 | S1 | 4h | 🟡 |
| P0-17 | USSD backend | Dev2 | S1 | 2j | 🟡 |
| — | Backup automation script | SRE | S1 | 2h | 🟡 |

**Start** : J3 après kick-off. **Fin S1** (semaine 2).

---

### **Phase 3 : Infra & Certbot**

| # | Tâche | SRE | Jour | Status |
|---|-------|-----|------|--------|
| P0-10 | Certbot TLS 4 domaines | SRE | J4-J5 | 🔴 |
| P0-11 | Firewall UFW + WireGuard | SRE | J5-J6 | 🔴 |
| P0-12 | Backup cron + test restore | SRE | J6-J7 | 🔴 |

---

## 🎯 **Milestones Sprint 0**

### **Fin semaine 1 (J7)**
- ✅ Comptes externe créés (Meta pending, Africa's pending)
- ✅ VPS live + domaine DNS OK
- ✅ Secrets générés locally
- ✅ Sentry/UptimeRobot/Wasabi connectés
- ✅ Dev team active sur P0-13 à P0-17
- ✅ Avocats engagés (Privacy/ToS en cours)

### **Fin semaine 2 (J14)**
- ✅ All P0 dev DONE (ou en final test)
- ✅ Backup automation validée (test restore OK)
- ✅ Staging déploiement test (docker compose up)
- ✅ Meta templates soumis (en attente approbation)
- ✅ Africa's USSD shortcode attribué (confirmé)
- ⏳ Privacy/ToS : avocat review (peut déborder en S2)

---

## 📞 **Communication & Escalade**

### **Daily standup** (09:00 UTC+0)
- 15 min sur Zoom/meet
- Participants : CTO, PM, 3 devs, SRE
- Format : blockers + ETA
- **Ne pas dépasser 15 min**

### **Weekly sync** (vendredi 17:00)
- CTO + CEO + PM + DPO
- Recap semaine + risques
- Decision sur ajustements

### **Escalade critique**
- **Meta/Africa's retard** : CEO contact direct
- **Bug P0 bloquant** : CTO decision dev vs deploy
- **Légal timeout** : CEO engage backup avocat

---

## 🔔 **Risques identifiés S0**

| Risque | Probabilité | Mitigation |
|--------|-------------|-----------|
| Meta validation lente (2+ sem) | Élevée | Démarrer J1, fallback SMS OK |
| Africa's USSD shortcode retard | Moyenne | Démarrer J1, dev mock API en parallèle |
| Avocat indisponible | Faible | Liste 3 cabinets backup (Dakar) |
| VPS/DNS config complexe | Faible | SRE senior, documentation image complète |
| Dev underestimate storage dev | Faible | Code review daily jusqu'à DONE |

---

## 📂 **Où trouver l'info**

- **Architecture** : `ARCHITECTURE_OLEL.md`
- **Audit exhaustif** : `AUDIT_OLEL_EXHAUSTIF.md`
- **Pré-déploiement** : `AUDIT_PREDEPLOIEMENT_V2.md`
- **Roadmap full** : `ROADMAP_OLEL.md`
- **Checklist deploy** : `CHECKLIST_DEPLOIEMENT.md`
- **Ce sprint** : Ce fichier (mis à jour daily)

---

## ✍️ **Sign-off**

- [ ] CTO : validé tech
- [ ] PM : validé planning  
- [ ] CEO : validé externes lancées
- [ ] SRE : validé infra planning

**GO DATE** : 2026-06-03 ✅

---

*Mis à jour* : 2026-06-03 J1  
*Next update* : Jour 3 (réunion kick-off dev)
