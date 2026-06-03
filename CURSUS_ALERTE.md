# OLEL — Cursus d'une alerte (signalement → diffusion → suivi)

## Vue d'ensemble

Toute alerte OLEL traverse **6 étapes** dans un ordre strict. À chaque étape, un rôle précis a la responsabilité (et le pouvoir) de faire avancer l'alerte vers l'étape suivante ou de la rejeter.

```
   SIGNALEMENT  →  SENTINELLE  →  MAIRIE  →  PREFECTURE  →  BROADCAST  →  CLOSED
   (PENDING)     (UNDER_REVIEW)            (VALIDATED)   (BROADCASTING/   (CLOSED)
                                                          BROADCAST)
   CITOYEN       SENTINELLE     MAIRIE     PREFECTURE    PREFECTURE      MAIRIE+
                 valide         confirme   décide        diffuse         clôture
```

## Étape 1 — SIGNALEMENT (status `PENDING`)

| Champ | Valeur |
|---|---|
| `status` | PENDING |
| `currentStep` | SIGNALEMENT |
| Qui crée | Citoyen, sentinelle, bot WhatsApp, USSD, IVR (V1) |
| Action requise par | Sentinelle de la zone |

**Création** :
- App mobile : EmergencyReportScreen (3-taps) ou ReportScreen (complet)
- WhatsApp Bot : conversation guidée
- USSD `*123*1#` : menu zone + risque
- IVR (V1) : DTMF

**Conséquences immédiates** :
- Alerte ajoutée à la file de vérification des sentinelles de la zone
- Push WebSocket à tous les dashboards (zone:<id>)
- Pas encore visible dans la diffusion publique

## Étape 2 — VÉRIFICATION SENTINELLE (status `UNDER_REVIEW`)

| Champ | Valeur |
|---|---|
| `status` | UNDER_REVIEW |
| `currentStep` | SENTINELLE |
| Qui agit | Sentinelle de la zone (rôle ≥ SENTINELLE) |
| Action requise par | Mairie de la zone |

**Action sentinelle** : ouvrir l'alerte dans la file → VerifyScreen → choisir action :
- **VALIDATED** (avec GPS + photo + gravité 0-3 obligatoires) → fait avancer
- **REJECTED** → ferme l'alerte (incident infondé)
- **ESCALATED** → idem VALIDATED + force passage à l'échelon supérieur

**Règle métier critique** :
- Photo de preuve OBLIGATOIRE pour VALIDATED
- Position GPS OBLIGATOIRE pour VALIDATED
- Échelle de gravité 0-3 OBLIGATOIRE (mappée vers AlertLevel)

**Sortie possible** :
- `VALIDATED` → currentStep=SENTINELLE → status=UNDER_REVIEW → file mairie
- `REJECTED` → status=REJECTED + resolvedAt=now → alerte fermée

## Étape 3 — CONFIRMATION MAIRIE (status `UNDER_REVIEW`)

| Champ | Valeur |
|---|---|
| `status` | UNDER_REVIEW |
| `currentStep` | MAIRIE |
| Qui agit | Maire ou agent municipal (rôle ≥ MAIRIE) |
| Action requise par | Préfecture |

Action : dashboard `/dashboard/alerts` → valider, rejeter, ou retourner à la sentinelle.

Cas particulier : si le rôle PROTECTION_CIVILE crée l'alerte (origine officielle, centre santé par ex), cette étape peut être skippée.

## Étape 4 — VALIDATION PRÉFECTURE (status `VALIDATED`)

| Champ | Valeur |
|---|---|
| `status` | VALIDATED |
| `currentStep` | PREFECTURE |
| Qui agit | Préfet ou Sous-préfet (rôle ≥ PREFECTURE) |
| Action requise par | Préfecture (pour broadcast) |

À ce stade, l'alerte est officiellement validée. **MFA obligatoire** (TOTP) pour les autorités à ce niveau et au-dessus.

Sortie : Préfet décide de diffuser → étape 5.

## Étape 5 — DIFFUSION (status `BROADCASTING` → `BROADCAST`)

| Champ | Valeur |
|---|---|
| `status` | BROADCASTING (en cours) puis BROADCAST (envoyé) |
| Qui agit | Préfecture+ via `/dashboard/broadcast` |
| Action requise par | (suivi) |

Préfet compose un message via templates validés Meta WhatsApp + zones cibles. Système envoie multi-canal :
- WhatsApp Business (template approuvé)
- SMS (Africa's Talking)
- Push FCM Android (V1)
- IVR appel sortant (V1)
- USSD pull au prochain `*123#`

Conformité broadcasts :
- Audit log (qui, quand, contenu, zones cibles, abonnés joints)
- Cost log par canal (xof par alerte)
- Idempotency-Key obligatoire (anti-double envoi)

## Étape 6 — SUIVI ET CLÔTURE (status `CLOSED`)

| Champ | Valeur |
|---|---|
| `status` | CLOSED |
| Qui agit | Mairie+ (clôture manuelle) ou cron (clôture auto 48h) |

Clôture automatique : cron quotidien `closeStaleAlerts` ferme les alertes validées sans activité depuis 48h.

Clôture manuelle : page admin avec champ obligatoire "raison + bilan".

Post-clôture :
- Alerte conservée pour 12 mois (puis archivée S3)
- Audit log conservé 5 ans (loi 2008-12 Sénégal)
- Statistiques agrégées disponibles via `/dashboard/analytics`

## Cas spéciaux

### URGENCE auto-broadcast
Si une sentinelle valide avec gravité=3 et le risque est de type FEU ou SECURITE, la chaîne peut être court-circuitée par la Protection Civile pour diffuser immédiatement (skip Mairie + Préfecture).

### Sanitaire (cas suspect épidémie)
Le rôle PROTECTION_CIVILE peut créer l'alerte directement à `currentStep=PREFECTURE`. Pas d'étape sentinelle ni mairie. Workflow conditionnel `requiresMedicalReview=true` bloque le broadcast public sans validation médicale.

### Disparition mineur
`requiresConsent=true` bloque le broadcast tant que `consentObtained=false` (procédure parents).

## Matrice rôles × actions

| Action | CITOYEN | SENTINELLE | MAIRIE | PREFECTURE | GOUVERNORAT | PROTECTION_CIVILE | SUPER_ADMIN |
|---|---|---|---|---|---|---|---|
| Créer alerte | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Voir alerte (sa zone) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Valider à SIGNALEMENT | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Valider à SENTINELLE | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Valider à MAIRIE | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Diffuser broadcast | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Clôturer alerte | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |

## Indicateurs de performance du cursus

| Métrique | Cible MVP | Mesure |
|---|---|---|
| Délai signalement → 1ʳᵉ vérif sentinelle | < 5 min | `validation.createdAt - alert.createdAt` (étape 1→2) |
| Délai signalement → validation | < 30 min | (étape 1 → étape 3 ou 4) |
| Délai validation → broadcast | < 15 min | (étape 4 → étape 5) |
| Délai signalement → broadcast | < 50 min p95 | Total cumulé |
| Couverture broadcast (% joints) | > 80% | `notifications.delivered / notifications.total` |
| Taux faux signalements (rejetés) | < 15% | `alerts.REJECTED / total` |

Toutes ces métriques sont exposées via `/api/metrics` (Prometheus) et visibles sur Grafana (V1).

## Diagramme d'état formel

```
       create
         │
         ▼
   ┌─────────┐  reject       ┌──────────┐
   │ PENDING │ ─────────────►│ REJECTED │ (terminal)
   └────┬────┘                └──────────┘
        │ validate
        ▼
   ┌──────────────┐  reject       ┌──────────┐
   │ UNDER_REVIEW │ ─────────────►│ REJECTED │ (terminal)
   │ (step=SENT)  │                └──────────┘
   └──────┬───────┘
          │ validate
          ▼
   ┌──────────────┐
   │ UNDER_REVIEW │
   │ (step=MAIRIE)│
   └──────┬───────┘
          │ validate
          ▼
   ┌──────────────┐
   │  VALIDATED   │
   │(step=PREFECT)│
   └──────┬───────┘
          │ broadcast
          ▼
   ┌──────────────┐  ack       ┌───────────┐
   │ BROADCASTING │ ──────────►│ BROADCAST │
   └──────────────┘             └─────┬─────┘
                                      │ close (manuel ou cron 48h)
                                      ▼
                                 ┌────────┐
                                 │ CLOSED │ (terminal)
                                 └────────┘
```
