# OLEL — Workflows complets & 6 scénarios catastrophe

**But** : valider que la chaîne **Citoyen → Signalement → Sentinelle → Validation → Autorité → Diffusion** fonctionne réellement pour chaque type de risque. Pour chaque scénario : étapes pas-à-pas, canaux utilisés, blocages potentiels identifiés, solutions.

---

## Vue d'ensemble : la chaîne canonique

```
┌────────────────────┐    ┌──────────────────┐    ┌────────────────────┐
│  1. SIGNALEMENT    │    │ 2. VÉRIFICATION  │    │  3. ESCALADE       │
│  Citoyen / capteur │───▶│  Sentinelle      │───▶│  Mairie/Préfecture │
│  via app/WA/SMS/   │    │  GPS + photo +   │    │  Décision broadcast│
│  USSD/IVR          │    │  gravité 0-3     │    │                    │
└────────────────────┘    └──────────────────┘    └────────────────────┘
                                                            │
                          ┌─────────────────────────────────┘
                          ▼
                ┌─────────────────────────┐
                │  4. DIFFUSION MULTI     │
                │  WhatsApp+SMS+USSD+IVR+ │
                │  Push+Radio communautaire│
                └─────────────────────────┘
                          │
                          ▼
                ┌─────────────────────────┐
                │  5. SUIVI POST-EVENT    │
                │  feedback, clôture,     │
                │  post-mortem            │
                └─────────────────────────┘
```

**Délais cibles MVP** :
- Étape 1 → 2 (signalement reçu par sentinelle) : < 5 min
- Étape 2 → 3 (sentinelle valide ou rejette) : < 30 min
- Étape 3 → 4 (autorité décide + diffuse) : < 15 min
- **Total signalement → diffusion : < 30 min médian, < 50 min p95**

---

## SCÉNARIO 1 — Inondation (crue de fleuve)

### Contexte
Crue annuelle du Sénégal à Wuro-Mamadou, août-octobre. ANACIM publie niveau Bakel. Fenêtre d'évacuation : 6-24h avant pic.

### Workflow

#### Phase 1 — Signal faible (J-3 à J-1)
- ANACIM publie niveau fleuve à Matam +2,80 m → seuil orange.
- OLEL ingère via cron `/anacim/sync` (à créer P1) → met à jour `RiverLevel` table.
- Backend déclenche **broadcast préventif** automatique aux zones à risque (mode VIGILANCE).
- WhatsApp + SMS : "Niveau fleuve élevé. Préparez vos affaires. Restez informés."

#### Phase 2 — Signalement terrain (J0)
- Femme de Wuro-Mamadou voit eau monter dans la cour de l'école → WhatsApp bot OLEL.
- Bot demande : type ? "Eau". Lieu ? "École". Photo ? Envoyée.
- Bot crée `Alert` (riskType=HYDRO, level=PENDING, currentStep=1, source=WHATSAPP).
- 3 autres citoyens signalent dans les 10 min suivantes → IA cluster (V2) marque `parentAlertId`.

#### Phase 3 — Vérification (J0 +10 min)
- 5 sentinelles de la zone reçoivent push (FCM V1, mais MVP : ouvrent l'app et voient la file).
- Aïssatou (sentinelle) clique la première alerte → écran Verify.
- GPS confirme à 50 m de l'école.
- Elle prend photo, choisit Gravité=2 (Sérieux), commentaire "Eau 30 cm, classes RDC menacées, évacuation rentrée à organiser".
- PATCH `/alerts/:id/validate` → currentStep=2, level=DANGER.

#### Phase 4 — Escalade (J0 +15 min)
- Notification auto à Mairie de Wuro-Mamadou (dashboard + push).
- Maire valide, ajoute photo aérienne drone (V1), confirme niveau DANGER.
- Notification escalade Préfecture Matam.

#### Phase 5 — Décision Préfet (J0 +25 min)
- Préfet dashboard `/broadcast` → cible zones inondables Matam (3 zones).
- Sélectionne template "Évacuation immédiate crue", langue PU/FR.
- **MFA requis** (TOTP) → valide.
- POST `/broadcasts` → file Bull → multicanal.

#### Phase 6 — Diffusion (J0 +30 min)
| Canal | Couverture estimée | Délai |
|---|---|---|
| WhatsApp Business | ~70% (smartphones) | <2 min |
| SMS Africa's Talking | ~95% (tous téléphones) | 2-5 min |
| Push FCM Android | ~50% (Android avec app) | <30s |
| USSD broadcast | N/A (pull only) | au prochain *123# |
| IVR appel sortant | 100% des numéros configurés | 5-15 min |
| Radio communautaire | ~80% zone | manuelle, contact direct |

#### Phase 7 — Suivi (J0 +1h à J+7)
- WhatsApp mini-survey à -2h : "Avez-vous reçu l'alerte ? Êtes-vous en sécurité ?"
- Préfecture suit dashboard live évolution.
- Clôture manuelle après pic + 48h sans nouveau signalement.
- Post-mortem semaine suivante : timeline complète, indicateurs.

### Blocages identifiés
| # | Blocage | Probabilité | Mitigation |
|---|---|---|---|
| 1.1 | Sentinelle hors-ligne au moment du pic | Élevée (rural) | Fallback à 2 sentinelles + escalade auto Mairie après 30 min sans validation |
| 1.2 | Photo trop lourde sur 2G | Élevée | Compression client (Sprint 2) |
| 1.3 | ANACIM API down | Moyenne | Cache 6h + manual override Préfecture |
| 1.4 | Préfet absent (week-end, nuit) | Élevée | Astreinte 24/7 + délégation Sous-préfet |
| 1.5 | WhatsApp Business suspendu | Faible | Fallback SMS automatique |
| 1.6 | Surcharge file Bull (1000+ broadcasts) | Faible | Bull queue cluster + DLQ (R-02) |

---

## SCÉNARIO 2 — Feu de brousse

### Contexte
Saison sèche novembre-mai. Feux fréquents à Kanel et Bakel. Avance rapide selon vent harmattan.

### Workflow

#### Phase 1 — Signalement (T0)
- Berger voit fumée à 2 km de son troupeau → USSD `*123#`.
- Africa's Talking USSD gateway → POST `/ussd/callback`.
- Menu : "1=Signaler", "1=Crue 2=Feu 3=Santé", "Confirmer zone Kanel Nord ? 1=Oui".
- Backend crée `Alert` (riskType=FEU, level=PENDING, source=USSD, lat/lng = centroïde zone).

#### Phase 2 — Vérification (T0 +5 min)
- 2 sentinelles Kanel reçoivent.
- L'une tape "📋 File", voit l'alerte FEU.
- Ouvre Verify, va sur place (10 min trajet à pied).
- GPS confirme, photo flammes, gravité=3 (Critique), commentaire "Feu sur 200m, vent SO, direction village Toulel".
- PATCH `/alerts/:id/validate` → level=URGENCE.

#### Phase 3 — Escalade immédiate (T0 +15 min)
- Niveau URGENCE → notification auto SIMULTANÉE à Mairie + Préfecture + Protection Civile.
- Pas d'étape Mairie séparée pour URGENCE — escalade directe.

#### Phase 4 — Coordination équipe sentinelles
- Page Team de la sentinelle Aïssatou.
- Message dans canal coordination : "Feu Toulel, besoin renfort, qui peut venir ?"
- 3 autres répondent. Auto-déplacement.

#### Phase 5 — Diffusion URGENCE (T0 +25 min)
- Protection Civile dashboard → broadcast URGENCE multi-zones (5 km autour).
- Template "Feu de brousse imminent. Évacuez immédiatement vers [zone refuge]".
- Multicanal IDENTIQUE à scénario 1 mais TTL = 1h (urgence).
- IVR appel sortant : message TTS multilingue avec instruction touche 1 = "Je m'évacue", 2 = "J'ai besoin d'aide".

#### Phase 6 — Suivi
- Dashboard map heat : signalements coordonnés par sentinelles sur place.
- WS push aux dashboards évolution status.
- Croix-Rouge alertée si besoin.

### Blocages identifiés
| # | Blocage | Probabilité | Mitigation |
|---|---|---|---|
| 2.1 | Pas de réseau du tout (zone très isolée) | Moyenne | Fallback radio communautaire VHF (hors-OLEL mais à coordonner) |
| 2.2 | USSD délais opérateur (Orange) | Moyenne | Multi-opérateur (Orange + Tigo + Expresso) |
| 2.3 | Geolocalisation USSD imprécise (centroïde zone) | Élevée | Coordination terrain sentinelles via Team canal |
| 2.4 | Sentinelle paniquée → faux gravité | Moyenne | Double validation auto sur URGENCE par 2ᵉ sentinelle |
| 2.5 | Refuge non défini | Élevée | Liste refuges par zone dans `Zone.refugePoints` (à ajouter au schéma P1) |

---

## SCÉNARIO 3 — Incendie urbain (maison / marché)

### Contexte
Marché central Matam, incendie nocturne 23h. Pompiers à 12 km. Densité population autour.

### Workflow

#### Phase 1 — Signalement (T0)
- Commerçant appelle pompiers + signal sur OLEL via app.
- Ouvre `/m.olel.sn` (déjà installé PWA).
- Bouton SOS → appel direct Sapeurs-pompiers Matam.
- En parallèle, signalement OLEL (riskType=FEU, sous-type=URBAIN).

#### Phase 2 — Coordination immédiate (T0 +2 min)
- App signale aux 3 sentinelles de la zone (Matam centre).
- L'une se trouve à 200 m, ouvre Verify, confirme avec photo.
- Gravité=3 instant.

#### Phase 3 — Diffusion zonale (T0 +10 min)
- Niveau URGENCE → broadcast 500 m autour du marché.
- Message : "Incendie marché. Évitez zone. Routes coupées Sud."
- Push + WhatsApp + SMS aux abonnés zone.

#### Phase 4 — Gestion victimes
- Bouton "Besoin d'aide" sur app citoyenne → marquage GPS personne.
- Map dashboard montre points "demande aide" pour pompiers.

### Blocages
| # | Blocage | Probabilité | Mitigation |
|---|---|---|---|
| 3.1 | Confusion entre "incendie urbain" et "feu de brousse" dans le bot | Élevée | Sous-types riskType : FEU_BROUSSE, FEU_URBAIN, FEU_AGRICOLE |
| 3.2 | Réseau saturé pendant événement majeur | Élevée | SMS sortants prioritaires + USSD pull |
| 3.3 | Pompiers pas connectés à OLEL | Élevée | V2 — intégration ESRI/Sapeurs si possible |

---

## SCÉNARIO 4 — Accident de la route grave

### Contexte
Route Matam-Ourossogui, camion-citerne renversé 80 km/h. Multiples victimes. Risque secondaire fuite carburant.

### Workflow

#### Phase 1 — Signalement (T0)
- Témoin passant appelle d'abord pompiers, puis OLEL via WhatsApp.
- Bot demande : type ? "Accident grave". Photo ? Envoyée. Position GPS partagée.
- Backend crée `Alert` (riskType=SECURITE, sous-type=ACCIDENT_ROUTE).

#### Phase 2 — Multi-canal réception
- Citoyens secondaires voient autres signalements arrivés en grappe → bot répond "Alerte déjà ouverte, secours informés."
- IA déduplication V2 marque tous comme `relatedAlertId`.

#### Phase 3 — Escalade Protection Civile
- Niveau DANGER auto → Protection Civile + Gendarmerie Ourossogui.
- Coordination via Team channel sentinelles axe routier.

#### Phase 4 — Diffusion préventive
- Broadcast restreint : "Accident grave RN2 Matam-Ourossogui. Évitez itinéraire. Risque fuite carburant. Pas d'arrêt à proximité."
- Push WhatsApp + radio Matam FM (contact manuel pour le moment, automatisé V2).

### Blocages
| # | Blocage | Probabilité | Mitigation |
|---|---|---|---|
| 4.1 | Localisation GPS imprécise sur route | Faible | Snap to road avec OSM nearest line |
| 4.2 | Multiplication faux signalements (rumeur) | Élevée | Déduplication + modération sentinelle |
| 4.3 | Risque secondaire (carburant, explosion) non géré | Élevée | Sous-type ACCIDENT enrichi : tag "HAZMAT" automatique si tank/citerne mentionné |

---

## SCÉNARIO 5 — Alerte sanitaire (épidémie)

### Contexte
Cas suspect Crimée-Congo dans village Aéré Lao. Détection précoce critique pour cordon sanitaire.

### Workflow

#### Phase 1 — Signalement (J0)
- Centre de santé Aéré Lao identifie cas suspect.
- Infirmier-chef (compte rôle=PROTECTION_CIVILE) connecte dashboard, crée alerte CONFIRMÉE directement.
- riskType=SANTE, gravité=3, level=DANGER.

#### Phase 2 — Pas de vérification sentinelle
- Source officielle (centre santé) → étape sentinelle skipped.
- `currentStep` passe directement à 3 (Mairie/Préfecture).

#### Phase 3 — Notification autorités sanitaires
- Préfecture + Région médicale + Ministère santé.
- Dashboard montre marker rouge sur Aéré Lao.

#### Phase 4 — Diffusion ciblée
- Pas de broadcast public initial (éviter panique).
- Notification ciblée : centres santé voisins, professionnels santé inscrits.
- Mesures barrière via WhatsApp groupe communautaire dédié santé.

#### Phase 5 — Communication publique
- Si confirmation labo + propagation → broadcast public avec gestes barrières.

### Blocages
| # | Blocage | Probabilité | Mitigation |
|---|---|---|---|
| 5.1 | Confidentialité données médicales | Élevée | Pas de noms patients, juste agrégats + zones |
| 5.2 | Centre santé non équipé smartphone | Moyenne | USSD avec saisie texte limitée + appel téléphone confirmation |
| 5.3 | Panique communautaire si broadcast prématuré | Élevée | Validation Région médicale OBLIGATOIRE avant broadcast public |
| 5.4 | Multiples cas non liés signalés | Moyenne | Clustering géo + temporel + IA NLP V2 |

### Spécificités
- **Workflow distinct** des autres scénarios (étape sentinelle skipped).
- **Rôle PROTECTION_CIVILE étendu** : ajouter sous-rôle `SANTE_PUBLIQUE` ?
- **Recommandation P1** : ajouter champ `Alert.requiresMedicalReview: boolean` + workflow conditionnel.

---

## SCÉNARIO 6 — Urgence communautaire (disparition, violence, autre)

### Contexte
Enfant 8 ans disparu Wuro-Mamadou. Recherche en cours, mobilisation communauté.

### Workflow

#### Phase 1 — Signalement (T0)
- Mère via WhatsApp : "Mon fils n'est pas rentré".
- Bot : "Type ?" → "Disparition enfant".
- riskType=SECURITE, sous-type=DISPARITION, gravité=3.

#### Phase 2 — Vérification rapide
- Sentinelle voisine confirme par téléphone famille → valide.
- Photo enfant (consentement famille requis).

#### Phase 3 — Diffusion communautaire restreinte
- Broadcast ciblé Wuro-Mamadou + villages voisins 5 km.
- WhatsApp + SMS + USSD pull menu.
- Pas de broadcast IVR (rapidité moindre, ratio faux numéros).

#### Phase 4 — Coordination
- Team canal sentinelles mobilisé.
- Map dashboard : signalements "vu" géolocalisés.

#### Phase 5 — Résolution
- Si retrouvé → bouton "Résolu" → cloture + message communautaire de remerciement.

### Blocages
| # | Blocage | Probabilité | Mitigation |
|---|---|---|---|
| 6.1 | Photo mineur non-consentie diffusée | Critique légal | Workflow consentement parental ENCODE OBLIGATOIRE avant broadcast |
| 6.2 | Diffusion virale hors-zone | Élevée | TTL 24h sur le message + watermark "diffusion restreinte" |
| 6.3 | Faux signalements (vengeance, blague) | Moyenne | Vérif obligatoire 2 sentinelles |
| 6.4 | Coordination gendarmerie absente | Élevée | V1 — intégration formelle gendarmerie |

---

## Tableau récapitulatif

| Scénario | Étape sentinelle | Délai diff. cible | Canaux clés | Sous-type schéma à ajouter |
|---|---|---|---|---|
| 1 — Inondation | Obligatoire | < 30 min | Tous | — |
| 2 — Feu brousse | Obligatoire (2 sentinelles) | < 25 min | USSD + Radio | FEU_BROUSSE |
| 3 — Incendie urbain | Obligatoire | < 15 min | SOS + Push | FEU_URBAIN |
| 4 — Accident route | Optionnelle si officiel | < 20 min | WhatsApp + Radio | ACCIDENT_ROUTE, HAZMAT |
| 5 — Sanitaire | SKIPPED (centre santé) | < 40 min (validation) | Groupes pro | EPIDEMIE, SANTE_PUBLIQUE |
| 6 — Urgence comm. | Obligatoire | < 20 min | Communauté locale | DISPARITION, VIOLENCE |

---

## Corrections de schéma proposées

```prisma
// Ajouter sous-types pour discrimination plus fine
enum RiskSubType {
  // HYDRO
  CRUE_FLEUVE
  INONDATION_URBAINE
  RUPTURE_BARRAGE
  // FEU
  FEU_BROUSSE
  FEU_URBAIN
  FEU_AGRICOLE
  // SANTE
  EPIDEMIE
  INTOXICATION
  ACCIDENT_SANITAIRE
  // SECURITE
  ACCIDENT_ROUTE
  ACCIDENT_HAZMAT
  DISPARITION
  VIOLENCE
  ATTAQUE_ARMEE
  // SERVICES
  COUPURE_EAU
  COUPURE_ELEC
  // ENVIRONNEMENT
  POLLUTION
  TEMPETE_SABLE
}

model Alert {
  // ... existing fields
  subType   RiskSubType?
  requiresMedicalReview Boolean @default(false)
  requiresConsent       Boolean @default(false)
  parentAlertId         String? @db.Uuid    // pour clustering doublons
  relatedAlertIds       String[] @default([])
  // refuge / consignes spécifiques
  refugePoints          String[] @default([])
  customInstructions    Json?
}

model Zone {
  // ... existing fields
  refugePoints Json[] @default([])  // [{name, lat, lng, capacity}, ...]
  emergencyContacts Json[] @default([])  // [{role, name, phone}, ...]
}
```

---

## Workflows transverses critiques

### W-T1 — Test de chaîne mensuel (drill)
- 1 alerte simulée par mois (test=true).
- Toute la chaîne joue, mais broadcast PAS envoyé (mode dry-run).
- Mesure des délais réels par sentinelle / autorité.
- Rapport mensuel pour comité de pilotage.

### W-T2 — Mode "haute alerte" (saison à risque)
- Toggle dashboard Préfet : "saison crue active".
- Conséquences : 
  - Seuils alertes abaissés (VIGILANCE auto même sur signalement isolé)
  - Astreinte forcée
  - Tests drill bi-hebdomadaires
  - Sentinelles obligées de pinger /2h

### W-T3 — Mode "post-événement"
- Après catastrophe majeure : verrou dashboard "événement EN COURS".
- Logs renforcés (toutes actions auditées DEBUG).
- Communication interne consolidée.

### W-T4 — Faux signalement
- Détection : signalement très rapidement rejeté par sentinelle.
- Action : compteur user.falseReportsCount.
- Sanctions progressives : avertissement (3), suspension 7j (5), bannissement (10).
- Documentation dans GOVERNANCE.md.

---

## Métriques workflow à instrumenter

| Métrique | Calcul | Dashboard |
|---|---|---|
| Délai signalement → 1ʳᵉ sentinelle voit | `now - createdAt` au premier read sentinelle | Grafana |
| Délai signalement → validation | `validation.createdAt - alert.createdAt` | Grafana |
| Délai validation → broadcast | `broadcast.createdAt - validation.createdAt` | Grafana |
| Délai broadcast → 1ʳᵉ réception (Meta callback) | `meta.deliveredAt - broadcast.createdAt` | PostHog |
| Taux abandon USSD (% session non finie) | sessions abandonnées / total | Grafana |
| Coverage broadcast (% abonnés joints) | abonnés ack / abonnés cible | Grafana |
| Taux faux signalements | rejetés / total | Grafana |
| Délai astreinte préfet (réponse alerte URGENCE) | first action - alert.created | Grafana |

---

## Conclusion sur la chaîne

La chaîne canonique fonctionne pour 4 scénarios sur 6 sans modification. Les **2 cas particuliers** (sanitaire, urgence communautaire avec mineur) nécessitent des branches conditionnelles à implémenter en V0/V1.

**Recommandations P0** :
1. Ajouter `RiskSubType` enum + champ `subType` à `Alert` (déblocage scénarios 2, 3, 4, 5, 6).
2. Ajouter `requiresMedicalReview` + workflow conditionnel sanitaire.
3. Ajouter `requiresConsent` + UI consentement parental.
4. Ajouter `refugePoints` à `Zone` (déblocage évacuations).
5. Ajouter test de chaîne mensuel (W-T1).
6. Ajouter mode "haute alerte" saison.

**Recommandations P1** :
- Astreinte préfecture 24/7 documentée.
- Délégation sous-préfecture en cas d'absence.
- Intégration formelle gendarmerie + sapeurs-pompiers.

Tout cela est repris et planifié dans `ROADMAP_OLEL.md` (sprints concernés).
