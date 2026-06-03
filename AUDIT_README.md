# OLEL — Audit complet et plan d'exécution

**Date** : 2026-06-01
**Posture** : OLEL = infrastructure critique d'alerte. Système doit fonctionner en situation réelle de catastrophe. Aucune faiblesse non identifiée n'est acceptable.

Ce dossier regroupe 5 documents qui se complètent. Lire **dans cet ordre** :

| # | Document | Objet | Pour qui ? |
|---|---|---|---|
| 1 | `AUDIT_OLEL_EXHAUSTIF.md` | Gap analysis 18 catégories avec criticité/impact/solution. Vérité de référence sur ce qui manque. | Tous |
| 2 | `ARCHITECTURE_OLEL.md` | Architecture cible (V2), MVP, V1, V2. Composants, dépendances, flux, APIs. | CTO, architecte, SRE |
| 3 | `SECURITY_BLUEPRINT_OLEL.md` | Zero Trust, IAM, RBAC, MFA, secrets, WAF, SIEM, gestion incidents. Niveau institutions publiques. | Cybersécurité, DPO, CTO |
| 4 | `WORKFLOWS_SCENARIOS_OLEL.md` | 6 scénarios catastrophe pas-à-pas, blocages identifiés, corrections schéma. | PM, gestion risques, dev |
| 5 | `ROADMAP_OLEL.md` | Sprint 0-5 vers pilote Matam, arbitrages, RACI, métriques de succès. | Tous |

---

## Synthèse exécutive en 1 page

### État actuel
La stack technique est **fonctionnellement complète** :
- Phases A-E livrées (dashboard 8 onglets, formations/missions, login mobile OTP, app sentinelle complète, scaffolding Capacitor).
- 38 correctifs d'audit appliqués (sécurité, résilience, complétude, performance, accessibilité).
- 5 builds rc=0 (backend tsc, @olel/ui tsup, dashboard build, mobile build, bot tsc).
- Migration Prisma initiale versionnée (559 lignes SQL).
- Documentation technique (TEST_PLAN.md, TEST_LAN.md, CHECKLIST_DEPLOIEMENT.md, GUIDE_DEPLOIEMENT.md, DEMARRAGE.md, CAPACITOR.md).

**Le code est solide pour un MVP.** Ce qui manque est principalement **opérationnel et organisationnel**.

### Ce qui manque (synthèse 115 items)

| Catégorie | P0 | P1 | P2 | P3 |
|---|---|---|---|---|
| Produit | 2 | 2 | 1 | 0 |
| UX/UI | 1 | 2 | 1 | 1 |
| Mobile | 2 | 4 | 2 | 0 |
| Backend | 3 | 3 | 1 | 0 |
| Base de données | 2 | 3 | 1 | 0 |
| API | 1 | 2 | 1 | 0 |
| Infrastructure | 4 | 3 | 1 | 0 |
| DevOps | 4 | 3 | 1 | 1 |
| **Sécurité** | **5** | **5** | **1** | **0** |
| IA | 1 | 2 | 1 | 1 |
| Cartographie | 1 | 3 | 2 | 0 |
| **Télécommunications** | **4** | **3** | **0** | **0** |
| Gouvernance | 3 | 2 | 0 | 0 |
| **Conformité** | **3** | **2** | **0** | **1** |
| Monitoring | 4 | 2 | 1 | 0 |
| Analytics | 0 | 2 | 2 | 0 |
| Maintenance | 3 | 3 | 0 | 0 |
| Documentation | 3 | 2 | 1 | 0 |
| **Total** | **46** | **48** | **17** | **4** |

### Bloquants critiques avant pilote Matam

**Les 12 chantiers strictement obligatoires avant le J0 du pilote** :

1. ⚠️ **MFA obligatoire MAIRIE+** (compte préfet compromis = broadcast frauduleux à des milliers de personnes)
2. ⚠️ **Rate limit OTP** (anti-SMS bombing, coût + DoS)
3. ⚠️ **Backups automatiques chiffrés daily** (sinon perte totale possible)
4. ⚠️ **USSD MVP** (40% population rurale Matam sans smartphone)
5. ⚠️ **WhatsApp Business compte validé + templates approuvés** (canal principal en zone urbaine)
6. ⚠️ **Cloudflare WAF + DDoS** (protection front-line)
7. ⚠️ **Secrets prod générés + stockés Vault/SOPS** (sinon clés dev en clair en prod)
8. ⚠️ **Sentry + UptimeRobot** (sinon panne silencieuse)
9. ⚠️ **CGU + Politique confidentialité + DPO + Déclaration CDP** (légalement obligatoire au Sénégal)
10. ⚠️ **Service Worker + tuiles offline + image compression** (utilisable en zone 2G)
11. ⚠️ **Centre admin** (sinon toute modif = appel développeur)
12. ⚠️ **Runbook incident + PCA/PRA basique** (gestion crise opérationnelle)

### Calendrier

| Sprint | Semaines | Thème |
|---|---|---|
| 0 | 1-2 | Préparation (gouvernance, infra, secrets, comptes) |
| 1 | 3-4 | Sécurité critique + USSD MVP |
| 2 | 5-6 | Résilience offline + tests |
| 3 | 7-8 | Centre admin + conformité RGPD/CDP |
| 4 | 9-10 | Monitoring + WhatsApp prod |
| 5 | 11-12 | Pilote terrain Wuro-Mamadou |

**Équipe cible** : 3 devs full-stack + 1 SRE/DevSecOps + 1 PM/UX + 1 référent terrain Matam = **6 personnes**, **12 semaines**, **~50 000 €**.

### Risques majeurs identifiés

1. **Validation Meta WhatsApp** — peut retarder lancement de 1-2 semaines. À initier J1.
2. **Adoption sentinelles** — 5 personnes Wuro-Mamadou à former intensivement Sprint 5.
3. **Catastrophe réelle pendant pilote** — opportunité ET risque. Astreinte 24/7 obligatoire.
4. **Bailleur retire financement** — diversifier (PNUD, UE, Banque mondiale).
5. **Compromission Préfecture** — MFA + audit log + Sentry alerting indispensables.

### Arbitrages assumés (ce qu'on N'AURA PAS au pilote)

- ❌ IVR multilingue → V1 (M+4)
- ❌ Push FCM Android → V1 (PWA suffit MVP)
- ❌ APK signé Play Store → V1
- ❌ IA classification + détection doublons → V2 (M+6)
- ❌ Multi-VPS HA → V2
- ❌ iOS App Store → V2
- ❌ SIEM externalisé → V2
- ❌ Modèles prédictifs crue → V3

Tout cela est documenté en détail dans `ROADMAP_OLEL.md`.

---

## Modules ajoutés (par rapport au cahier des charges initial)

Le cahier des charges OLEL d'origine mentionne 3 interfaces + chatbot WhatsApp. L'audit identifie **16 modules supplémentaires** indispensables :

1. ✅ Gestion des rôles (existant)
2. ⬜ Gestion des permissions granulaires (ZoneOwnerGuard, RequireTwoFa)
3. ✅ Journalisation (logs Pino structurés à compléter)
4. 🟧 Audit trail (modèle + service OK, UI à créer)
5. ⬜ Sauvegardes automatiques chiffrées
6. ⬜ Supervision Prometheus + Grafana + Sentry
7. ⬜ Gestion incidents (runbook + astreinte)
8. ⬜ PCA / PRA
9. ⬜ Monitoring santé (Terminus health checks)
10. ⬜ Observabilité (logs/metrics/traces)
11. 🟧 Notifications multicanal (existant, ajouter fallback strategy)
12. ⬜ Centre d'administration (8 pages admin)
13. ⬜ Portail support (status.olel.sn V1)
14. ⬜ Gestion consentement (modèle Consent + UI)
15. ⬜ Conformité données personnelles (RGPD + Loi 2008-12 sénégalaise)
16. ⬜ Module USSD
17. ⬜ Module IVR (V1)
18. ⬜ Module classification IA (V2)
19. ⬜ Module SIG avancé (PostGIS exploité, géocodage, heat maps)
20. ⬜ Module Cost tracking (coût par alerte/canal)

---

## Document de référence sécurité

`SECURITY_BLUEPRINT_OLEL.md` couvre :
- ✅ Modèle de menace STRIDE par composant (mobile, backend, bot, USSD/SMS/IVR, infra, réseau, données)
- ✅ Architecture Zero Trust (diagramme + règles)
- ✅ IAM (identités humaines + machines + fédérées V2)
- ✅ RBAC matrice rôles × ressources (7 rôles × 13 actions)
- ✅ MFA politique (citoyen → super admin)
- ✅ Chiffrement transit + at-rest (TLS 1.3, LUKS, AES-256-GCM, GPG backups)
- ✅ Gestion secrets (Vault / SOPS)
- ✅ WAF Cloudflare avec règles spécifiques OLEL
- ✅ Protection DDoS L3/L4/L7
- ✅ SIEM Loki MVP → Wazuh V1 → SOC externalisé V2
- ✅ Gestion vulnérabilités (Dependabot, Trivy, pen-test)
- ✅ Audit applicatif (modèle existant à étendre + UI)
- ✅ Gestion incidents (P1 → P4 + workflow + post-mortem)
- ✅ Conformité (loi 2008-12, RGPD, ISO 27001 V2, NIST CSF)

**Niveau visé** : institutions publiques + organisations internationales (ONU, UE) + collectivités territoriales.

---

## Document de référence workflows

`WORKFLOWS_SCENARIOS_OLEL.md` couvre les 6 scénarios :
1. ✅ Inondation (crue fleuve) — chaîne canonique
2. ✅ Feu de brousse — coordination terrain
3. ✅ Incendie urbain — diffusion zonale rapide
4. ✅ Accident route (HAZMAT) — escalade Protection Civile
5. ✅ Alerte sanitaire (épidémie) — workflow spécifique avec étape sentinelle skipped
6. ✅ Urgence communautaire (disparition mineur) — consentement parental + diffusion restreinte

Pour chaque scénario : pas-à-pas, canaux, **blocages identifiés** (24 blocages au total), mitigations.

**Corrections de schéma proposées** :
- Enum `RiskSubType` (18 sous-types)
- Champs `requiresMedicalReview`, `requiresConsent`, `parentAlertId`, `relatedAlertIds`, `refugePoints`, `customInstructions`
- `Zone.refugePoints` + `Zone.emergencyContacts`

**Workflows transverses** :
- Test de chaîne mensuel (drill)
- Mode "haute alerte" saison à risque
- Mode "post-événement"
- Politique faux signalements + sanctions

---

## Document de référence architecture

`ARCHITECTURE_OLEL.md` couvre 4 niveaux :
1. **Architecture cible V2** (référence) — multi-VPS HA, SIEM, SOC, IA
2. **Architecture MVP V0** (pilote 6 sem, 50 €/mo) — VPS Hostinger unique, Cloudflare gratuit
3. **Architecture V1** (M+4, 150 €/mo) — IVR, push FCM, APK signé, monitoring complet
4. **Architecture V2** (M+12, 400 €/mo) — multi-zone, iOS, IA, SIEM externalisé

**5 workflows techniques détaillés** :
- Signalement citoyen via app
- Vérification sentinelle terrain
- Broadcast préfectoral (avec MFA)
- Signalement USSD
- Réception IVR

**7 ADRs** (Architecture Decision Records) :
- Monorepo Turbo
- Next.js partout
- Postgres+PostGIS vs MongoDB
- Bull vs Kafka
- Capacitor vs React Native
- VPS Hostinger vs cloud hyperscaler
- Cloudflare free tier

**API synthèse** : routes existantes + 7 nouvelles routes à créer (USSD, IVR, health, metrics, push, close alert, cluster).

---

## Document de référence roadmap

`ROADMAP_OLEL.md` détaille :
- **Sprint 0-5** complets (objectifs, livrables, fonctionnalités, dépendances, risques)
- **Backlog différé V1** (9 items)
- **Backlog V2** (7 items)
- **Arbitrages clés** assumés (7 décisions documentées)
- **Risques transverses** + mitigations
- **10 indicateurs de succès** mesurables au pilote
- **RACI** Sprint 0
- **Convention versioning + Git workflow**

---

## Comment utiliser ce dossier

### Pour un nouveau membre de l'équipe
Lire dans l'ordre : 
1. `AUDIT_README.md` (ce fichier)
2. `ROADMAP_OLEL.md`
3. Le document de ton rôle (sécurité, archi, ou produit).

### Pour le comité de pilotage
1. `AUDIT_README.md` — synthèse exécutive
2. `ROADMAP_OLEL.md` — section "Indicateurs de succès" + risques
3. `AUDIT_OLEL_EXHAUSTIF.md` — section "Résumé exécutif"

### Pour les bailleurs
1. `AUDIT_README.md`
2. `ROADMAP_OLEL.md` — calendrier + budget
3. `SECURITY_BLUEPRINT_OLEL.md` — niveau sécurité

### Pour le développeur qui démarre
1. `DEMARRAGE.md`
2. `TEST_LAN.md`
3. `ARCHITECTURE_OLEL.md`
4. `WORKFLOWS_SCENARIOS_OLEL.md`
5. Pris ses tickets dans `ROADMAP_OLEL.md` Sprint courant.

---

## Décision finale demandée au comité de pilotage

**Recommandation de l'audit** : **valider le démarrage immédiat du Sprint 0** sur les 6 chantiers suivants :

| Action | Responsable | Délai |
|---|---|---|
| Constituer comité de pilotage 5 personnes | PM | J+3 |
| Désigner DPO (interne ou prestataire) | Comité | J+5 |
| Déposer déclaration CDP | DPO | J+10 |
| Créer compte Meta Business + numéro WhatsApp | PM | J+1 |
| Acheter VPS Hostinger + domaine olel.sn | SRE | J+1 |
| Créer compte Africa's Talking + crédits 100 € | SRE | J+1 |

Une fois ces 6 actions lancées, **les sprints 1 à 5 peuvent commencer** selon le calendrier établi.

**Date cible pilote Matam** : J+84 (semaine 13).

---

*Audit réalisé en posture d'équipe inter-experts : PM Senior, CTO GovTech, Architecte Logiciel Senior, Expert Cybersécurité, Expert DevSecOps, UX Lead, Expert SIG/GIS, Expert Télécom, Expert IA, Expert Gestion des Risques et Systèmes d'Alerte Précoce.*

*Aucune hypothèse n'a été considérée comme acquise. Toutes les conclusions sont documentées et traçables aux 5 livrables de référence.*
