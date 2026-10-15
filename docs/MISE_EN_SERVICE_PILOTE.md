# OLEL — Guide de mise en service progressive

> Version du 15/10/2026, branche `claude/laughing-hawking-4olx5k`. Complète la [remédiation de l'audit](AUDIT_REMEDIATION.md) (§ 7 : déploiement, retour arrière, restauration) et le [registre des décisions](DECISIONS_PILOTE.md).
>
> **Règle générale.** Chaque étape commence seulement après accord écrit du responsable désigné (D14) et signature des décisions qu'elle exige. Rien dans ce guide n'envoie de message à un citoyen avant l'étape 3, et à l'étape 3 seulement aux volontaires inscrits.

| Étape | Objet | Qui reçoit des messages | Durée indicative |
|---|---|---|---|
| 1 | Répéter le déploiement sur une copie des données réelles | personne | une demi-journée |
| 2 | Pilote interne : opérateurs et sentinelles réels | numéros de l'équipe uniquement | 2 à 3 semaines |
| 3 | Exercice avec des citoyens volontaires, sur une commune | équipe + volontaires ayant signé leur accord | 2 à 4 semaines |
| 4 | Élargissement progressif | selon décision | — |

## Le mode pilote en bref

Le mode pilote est activé par une seule variable, lue par le serveur :

```
PILOT_RECIPIENT_ALLOWLIST=+221770000001,+221770000002
```

Quand elle n'est pas vide :

- **aucun message de diffusion ne part** vers un numéro absent de la liste. Dans le suivi des remises, ces destinataires apparaissent « ignoré — Mode pilote : destinataire hors liste autorisée » ;
- **la consultation est réservée aux mêmes numéros** : application mobile, USSD, bot WhatsApp, temps réel et radios partenaires. Les autres voient « Service OLEL en phase d'essai », jamais « aucune alerte » ;
- chaque message diffusé porte la mention **« [OLEL] EXERCICE — … EXERCICE »** ;
- le tableau de bord affiche un bandeau « Mode pilote », la santé (`/api/v1/health/diffusion`) indique `pilotMode: true` et la métrique `olel_pilot_mode` vaut 1.

Les opérateurs (sentinelles, mairies, préfecture…) ne sont pas concernés : ils conduisent l'exercice. Ces règles sont appliquées côté serveur, aucune action d'interface ne peut les lever. Modifier la liste demande un redémarrage du backend (`docker compose … up -d backend`).

---

## Étape 1 — Répétition sur une copie des données réelles

**But.** Vérifier que les migrations passent sur les vraies données, sans rien perdre, avant de toucher à la production.

**Garanties du script** (`scripts/rehearse-deploy.sh`) : la base de production est seulement **lue** (`pg_dump`) ; toute écriture vise une base distincte `olel_repetition`, vérifiée avant chaque commande ; la nouvelle version tourne dans des conteneurs temporaires, sans identifiant fournisseur et en mode pilote fermé ; les conteneurs de production ne sont ni arrêtés ni modifiés ; nettoyage complet à la fin.

**Prérequis.** Accès SSH administrateur au serveur ; Docker ; espace disque libre d'au moins deux fois la taille de la base plus 2 Go (vérifié par le script).

**Commandes** (sur le serveur) :

```bash
git clone --branch claude/laughing-hawking-4olx5k <URL du dépôt> /opt/olel-next
cd /opt/olel-next
sudo scripts/rehearse-deploy.sh                 # ajouter --keep pour inspecter la copie ensuite
# conteneur PostgreSQL nommé autrement : --pg-container <nom>
```

**Critères de réussite** : le rapport `rehearsal-<horodatage>.txt` se termine sans aucune ligne « ÉCHEC ». Il contrôle notamment :

- aucune ligne perdue ni ajoutée, table par table ;
- comptes inactifs devenus SUSPENDED (même nombre) ; tous les comptes ont un statut ;
- diffusions historiques marquées terminées (aucune ne sera rejouée) ; compteurs « livré » requalifiés en « envoyé » ;
- codes OTP en cours invalidés ; compte technique du bot sans rôle ADMIN ;
- nouvelle version démarrée sur la copie, mode pilote confirmé, **aucun message envoyé**.

Résultat obtenu sur une production simulée (ancienne version `cfd68a5` et données fictives) : **17/17**, base de production inchangée.

**Si un contrôle échoue** : rien n'a changé en production. Transmettez le rapport (il ne contient que des comptages, aucune donnée personnelle) ; je corrige et on recommence.

---

## Étape 2 — Pilote interne (numéros de l'équipe)

### Prérequis

- [ ] Étape 1 réussie (rapport conservé).
- [ ] Décisions signées : D15, D2, D4, D10, D11, D12 (version simplifiée), D14, D9, D16 ; D1 si un scénario d'épidémie est joué.
- [ ] Liste des numéros autorisés : membres de l'équipe, sentinelles et agents participants (téléphones professionnels ou personnels avec leur accord).
- [ ] Comptes nominatifs créés, formés puis habilités ; double authentification active pour les rôles qui l'exigent.
- [ ] Sauvegarde hors serveur configurée et restauration vérifiée (`scripts/restore.sh <lot> --verify-only`).
- [ ] Fenêtre de maintenance annoncée (tous les utilisateurs devront se reconnecter).

### Déploiement

Suivre [AUDIT_REMEDIATION.md § 7.1](AUDIT_REMEDIATION.md), en ajoutant **avant le démarrage du backend** dans `.env` :

```
PILOT_RECIPIENT_ALLOWLIST=<numéros de l'équipe, séparés par des virgules>
```

Contrôles juste après le démarrage (lecture seule) :

- [ ] `GET /api/v1/health/ready` → 200 ;
- [ ] `GET /api/v1/health/diffusion` → `pilotMode: true`, `allowlistSize` = nombre de numéros de la liste ;
- [ ] bandeau « Mode pilote » visible dans le tableau de bord ;
- [ ] depuis un téléphone **hors liste** : le bot (« Alertes ») et l'USSD répondent « phase d'essai ».

En cas de problème : retour arrière du § 7.2.

### Scénarios à jouer

Chaque scénario est joué au moins deux fois, par des personnes différentes. Noter chaque écart dans la fiche de constat ci-dessous.

| # | Scénario | Résultat attendu |
|---|---|---|
| 1 | Une sentinelle signale par WhatsApp (texte, photo, vocal) | Signalement visible au tableau de bord de son territoire, accusé de réception sans promesse d'intervention |
| 2 | Signalement par l'application mobile, dont une fois hors connexion | Envoyé au retour du réseau, une seule fois |
| 3 | Vérification par la sentinelle, validation et diffusion ORANGE par la mairie | Reçu uniquement par les numéros de la liste, avec « EXERCICE » ; suivi des remises complet (envoyé, remis, lu, ignoré hors liste) |
| 4 | Rectificatif de l'alerte du scénario 3 | Mêmes destinataires, mention « RECTIFICATIF » |
| 5 | Retrait de l'alerte (motif saisi) | Message « ALERTE ANNULÉE » ; l'alerte disparaît des consultations |
| 6 | Alerte ROUGE | Diffusion refusée à la mairie, possible pour la préfecture, double regard exigé |
| 7 | Diffusion d'urgence (bypass) | Mention « vérification en cours » ; revue a posteriori demandée à la préfecture |
| 8 | Panne simulée : arrêt de Redis 2 minutes pendant une diffusion | Santé « dégradée » avec la cause ; aucune décision perdue ; envoi repris au retour |
| 9 | Consultation depuis un téléphone hors liste (application, USSD, bot) | « Service en phase d'essai », jamais « aucune alerte » |
| 10 | Suspension d'un compte pendant qu'il est connecté | Accès coupé dans la minute (tableau de bord et temps réel) |
| 11 | Sauvegarde puis restauration dans une base neuve | Comptages identiques, médias présents |
| 12 | Alerte Prometheus (ex. file de diffusion bloquée) | Reçue par le référent désigné (D12) |

### Fiche de constat

| Date | Scénario | Attendu | Observé | Écart | Gravité (bloquant / gênant / mineur) | Suite |
|---|---|---|---|---|---|---|
| | | | | | | |

### Critères de sortie

- tous les scénarios réussis deux fois, aucun écart bloquant ouvert ;
- au moins une semaine de fonctionnement continu sans incident non expliqué ;
- retours des opérateurs recueillis (clarté du tableau de bord, des messages, du suivi).

---

## Étape 3 — Exercice avec des citoyens volontaires (une commune)

### Prérequis

- [ ] Étape 2 terminée selon ses critères de sortie.
- [ ] Décisions signées : D1, D5, D7, D8, D13, D6 ; D12 complète (astreinte écrite).
- [ ] Traductions validées et intégrées, tests relancés (je m'en charge à réception de la feuille relue).
- [ ] Accord écrit de chaque volontaire (objet, numéro utilisé, retrait à tout moment par « STOP » ou sur simple demande).
- [ ] Autorités locales de la commune informées de la date et du contenu de l'exercice ; radio partenaire informée.
- [ ] Si les modèles WhatsApp ne sont pas approuvés : consigne aux volontaires d'écrire au bot la veille de chaque exercice.

### Déroulement

1. Ajouter les numéros des volontaires à `PILOT_RECIPIENT_ALLOWLIST`, redémarrer le backend, vérifier `allowlistSize`.
2. Chaque volontaire écrit au bot : choix de la langue, accord pour recevoir les alertes, choix de la commune.
3. Jouer les scénarios 3, 4 et 5 de l'étape 2 sur la commune choisie, dans les langues des volontaires.
4. Recueillir les retours : message compris ? langue correcte ? consigne claire ? délai de réception ? (questionnaire court, oral si nécessaire).
5. Mesurer : délai décision → réception, part des messages remis et lus, désabonnements.

### Critères de sortie

- messages compris par la grande majorité des volontaires dans leur langue ;
- délai médian décision → réception mesuré et jugé acceptable par les autorités ;
- aucun message reçu hors de la liste (contrôle du suivi des remises) ;
- aucune plainte non traitée.

---

## Étape 4 — Élargissement

Seulement après décision écrite, sur la base des résultats de l'étape 3 :

1. Vider `PILOT_RECIPIENT_ALLOWLIST` (fin du mode pilote) **ou** l'étendre commune par commune.
2. Activer les modèles WhatsApp approuvés (indicateur `whatsapp_templates`) et le SMS de production.
3. Campagne de recueil du consentement (modèle approuvé, D7, D8).
4. Communication publique seulement à ce moment-là, en n'annonçant que les canaux réellement éprouvés (voir la matrice des canaux, § 7.4 de la remédiation).
