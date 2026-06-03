# OLEL — Plan de recette manuel

Tests à effectuer avant déploiement, **dans l'ordre**. Chaque section a un objectif clair et un critère de succès vérifiable.

> **Préalable** : la stack tourne (Docker compose dev) et les 3 URLs répondent :
> - http://IP_PC:4000/api/docs (Swagger)
> - http://IP_PC:3000 (dashboard)
> - http://IP_PC:3001 (mobile)

---

## 0. Smoke test automatisé (30 s)

Lancer le script qui exerce tous les endpoints critiques :

```powershell
pwsh scripts\smoke-test.ps1 -ApiUrl http://10.145.44.15:4000
```

**Critère** : `PASS : 13`, `FAIL : 0`. Si une seule étape échoue, ne pas continuer la recette manuelle.

---

## 1. App citoyen (mobile, http://IP_PC:3001)

### 1.1 — Login OTP
- [ ] Saisir `+221700000020` → bouton **Recevoir le code**
- [ ] Saisir `000000` → bouton **Valider**
- [ ] Choisir une zone (ex : Matam nord) → bouton **Entrer**
- **Critère** : arrivée sur l'écran d'accueil, le token est stocké (rester connecté après rafraîchissement).

### 1.2 — Signaler un risque
- [ ] Bouton **Signaler** depuis l'accueil
- [ ] Sélectionner type : **Inondation**
- [ ] Décrire : "Eau dans la cour"
- [ ] Renseigner localisation
- [ ] Valider → retour accueil
- **Critère** : pas d'erreur réseau ; un POST 201 visible dans la console DevTools.

### 1.3 — Carte des alertes
- [ ] Bouton **Carte**
- [ ] Vérifier que les alertes seedées apparaissent
- **Critère** : ≥ 1 marqueur visible, panneau de filtres opérationnel.

### 1.4 — Détail d'une alerte
- [ ] Cliquer une alerte
- [ ] Vérifier la **chaîne d'escalade 5 étapes** (Phase D2) : ronds, lignes, statuts animés
- **Critère** : les 5 étapes sont rendues, l'étape "active" pulse.

### 1.5 — Mode hors-ligne (R-06)
- [ ] DevTools → Network → **Offline**
- [ ] Signaler une alerte → le formulaire indique "stocké en file"
- [ ] Repasser **Online** → l'alerte se rejoue
- **Critère** : l'alerte apparaît bien dans `/dashboard/alerts` après reconnexion.

---

## 2. App sentinelle (mobile, après login `+221700000010`)

### 2.1 — Quick-access (Phase D)
- [ ] Le menu sentinelle affiche **📋 File à vérifier**, **👥 Équipe**, **🎓 Formations**, **🎯 Missions**
- **Critère** : les 4 boutons sont présents et cliquables.

### 2.2 — File de vérification (Phase D1)
- [ ] Cliquer **File à vérifier**
- [ ] Vérifier le tri : URGENCE > DANGER > VIGILANCE > NORMAL
- [ ] Vérifier l'affichage distance (si géoloc autorisée)
- [ ] Bouton **Actualiser** rafraîchit la liste
- **Critère** : les alertes sont triées par niveau, la distance s'affiche si position connue.

### 2.3 — Vérification terrain (Phase D3)
- [ ] Cliquer une alerte → écran **Vérification terrain**
- [ ] Section **Position GPS** affiche lat/lng + précision
- [ ] Section **Échelle de gravité** : choisir gravité 2 (Sérieux)
- [ ] **Photo preuve** : prendre une photo (caméra) ou choisir un fichier
- [ ] **Note vocale** : appuyer Enregistrer puis Arrêter — l'audio se rejoue
- [ ] Saisir un commentaire
- [ ] Bouton **Confirmer** → retour à la file
- **Critère** : PATCH 200 visible, le niveau d'alerte change dans le dashboard, l'étape "Vérification" passe à `done` dans la chaîne d'escalade.

### 2.4 — Équipe (Phase D4)
- [ ] Cliquer **Équipe**
- [ ] Vérifier la liste des coéquipiers + statut pastille (online/busy/offline)
- [ ] Envoyer un message dans le canal
- [ ] Le message apparaît avec auteur + timestamp relatif
- **Critère** : POST + GET messages OK ; le polling 15s rafraîchit automatiquement.

### 2.5 — Formations + Missions (Phase B)
- [ ] **Formations** : liste des modules + progression
- [ ] Compléter un quiz → score affiché + badge décerné
- [ ] **Missions** : voir au moins 1 mission assignée
- [ ] Répondre à une mission (Accepter / Décliner)
- **Critère** : score persisté, mission status passe à `IN_PROGRESS` / `DECLINED`.

---

## 3. Centre de commandement (dashboard, http://IP_PC:3000)

Login avec un compte préfecture ou super admin (mot de passe par défaut : `Prefet2024!` ou `OlelAdmin2024!`).

### 3.1 — Carte live
- [ ] Page `/dashboard/map`
- [ ] Marqueurs alertes en temps réel
- [ ] Sentinelles affichées par position
- **Critère** : WebSocket connecté (indicateur), nouvelles alertes apparaissent sans rafraîchir.

### 3.2 — Flux d'alertes
- [ ] Page `/dashboard/alerts`
- [ ] Filtres par niveau, zone, type
- [ ] Action **Valider** sur une alerte de niveau URGENCE
- **Critère** : validation reflétée immédiatement dans mobile et dashboard via WebSocket.

### 3.3 — Diffusion (broadcast)
- [ ] Page `/dashboard/broadcast`
- [ ] Composer un message → cibler une zone → Envoyer
- [ ] Historique affiche le broadcast
- **Critère** : POST /broadcasts 201 ; le bot WhatsApp reçoit l'event (vérifiable dans logs bot).

### 3.4 — Météo / Zones / Sentinelles / Analytics
- [ ] `/dashboard/weather` — statut des zones, niveaux fleuve
- [ ] `/dashboard/sentinel` — liste sentinelles par zone, formulaire d'assignation mission
- [ ] `/dashboard/analytics` — graphiques recharts (stats alertes)
- **Critère** : pas d'erreur 5xx, données cohérentes avec le seed.

### 3.5 — Utilisateurs
- [ ] `/dashboard/users` (super admin uniquement)
- [ ] Créer un nouvel utilisateur (rôle MAIRIE)
- [ ] L'utilisateur apparaît dans la liste
- **Critère** : POST /auth/admin/users 201, la liste se rafraîchit.

### 3.6 — Paramètres
- [ ] `/dashboard/settings` — changer langue
- [ ] Le dashboard reflète la nouvelle langue après refresh
- **Critère** : PATCH /users/me/language 200.

---

## 4. Bot WhatsApp (apps/bot, http://IP_PC:3002)

Pour tester sans WhatsApp Business : utiliser le simulateur cURL.

### 4.1 — Webhook verify
```bash
curl "http://IP_PC:3002/webhook?hub.mode=subscribe&hub.verify_token=olel_webhook_verify_2024&hub.challenge=abc123"
```
- **Critère** : réponse `abc123`.

### 4.2 — Conversation FR
Voir la signature HMAC dans `apps/bot/docs/` si activée. En dev, le check HMAC peut être désactivé. Envoyer payload simulé d'un message texte.
- **Critère** : le bot répond avec le menu d'accueil.

---

## 5. Tests transverses

### 5.1 — WebSocket reconnect
- [ ] Pendant que le dashboard tourne, redémarre le backend (`docker compose restart backend`)
- [ ] Le dashboard se reconnecte automatiquement avec backoff
- **Critère** : indicateur WS repasse au vert sans rafraîchir la page.

### 5.2 — Rate limiting
- [ ] Envoyer 15 requêtes `POST /auth/refresh` en 1 minute
- **Critère** : la 11ᵉ renvoie 429 Too Many Requests (limite 10/min).

### 5.3 — CSP / Helmet
- [ ] Dans Chrome DevTools → onglet Security
- **Critère** : pas de violation CSP, headers `Strict-Transport-Security` et `X-Content-Type-Options` présents.

### 5.4 — Accessibilité
- [ ] Naviguer le mobile uniquement au clavier (Tab, Enter, Esc)
- [ ] Vérifier les `aria-label` sur les boutons critiques
- **Critère** : focus visible, pas de piège, lecteur d'écran annonce les actions.

---

## 6. Charge / résilience (optionnel, avant prod)

### 6.1 — Charge légère
```bash
# k6 ou ab
ab -n 1000 -c 10 http://localhost:4000/api/v1/zones
```
- **Critère** : 95ᵉ percentile < 200 ms, 0 erreur.

### 6.2 — Crash recovery
- [ ] `docker compose kill backend` puis `docker compose start backend`
- **Critère** : les notifications Bull en file ne sont pas perdues (DLQ active).

---

## Synthèse de la recette

Une fois toutes les cases cochées **et** le smoke test au vert, l'application est prête pour le déploiement.

Voir aussi : `CHECKLIST_DEPLOIEMENT.md` pour les étapes prod.
