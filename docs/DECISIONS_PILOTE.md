# OLEL — Registre des décisions avant le pilote

> À compléter et signer par la structure qui porte OLEL. Version du 15/10/2026, branche `claude/laughing-hawking-4olx5k`.
> Aucune de ces décisions n'a été prise à votre place : le code applique un **défaut prudent**, indiqué pour chacune. Tant qu'une décision n'est pas signée, c'est ce défaut qui s'applique.

## Comment utiliser ce registre

1. Pour chaque décision, cochez la recommandation ou écrivez une autre réponse, puis indiquez le nom, la fonction du signataire et la date.
2. Les décisions marquées **bloquante étape N** doivent être signées avant de lancer l'étape N du [guide de mise en service](MISE_EN_SERVICE_PILOTE.md).
3. Une réponse différente du défaut peut demander une modification du code ou de la configuration : la colonne « Effet » l'indique.

## Vue d'ensemble

| # | Sujet | Bloquante pour | Effet d'une décision |
|---|---|---|---|
| D15 | La version en production sert-elle déjà des citoyens ? | étape 2 | procédure |
| D2 | Comptes, habilitations, aptitude des sentinelles | étape 2 | configuration |
| D4 | Diffusion d'urgence (bypass) | étape 2 | configuration ou code |
| D10 | Les administrateurs techniques peuvent-ils diffuser ? | étape 2 | code (petit) |
| D11 | Rectificatif et retrait : qui décide | étape 2 | configuration ou code (petit) |
| D12 | Permanence et suppléance | étape 2 (simplifiée), étape 3 (complète) | organisation |
| D14 | Structure exploitante, comptes fournisseurs | étape 2 | organisation |
| D9 | Perte de données acceptable, délai de reprise | étape 2 | configuration |
| D1 | Autorité sanitaire (épidémies) | étape 2 si un scénario d'épidémie est joué, sinon étape 3 | configuration |
| D5 | Traductions pulaar, wolof, soninké | étape 3 | contenu |
| D7 | Base légale, consentement, durées de conservation | étape 3 | organisation et code |
| D8 | Modèles WhatsApp et porteur auprès de Meta | étape 3 | démarche externe |
| D13 | Numéros d'urgence affichés | étape 3 | configuration |
| D3 | Pré-alerte et escalade automatiques | étape 4 (laisser désactivées avant) | indicateur |
| D6 | Position saisie à la main | étape 3 | code (petit) |
| D16 | Mention « EXERCICE » pendant le pilote | étape 2 | déjà en place |

---

## Décisions bloquantes pour l'étape 2 (pilote interne)

### D15 — État actuel du service

**Question.** La version actuellement en production (`cfd68a5`) envoie-t-elle déjà des alertes à de vrais citoyens ?

**Pourquoi c'est important.** Le déploiement de l'étape 2 active le mode pilote : **plus aucune diffusion ne part vers un numéro hors de la liste autorisée**, et la consultation publique affiche « service en phase d'essai ». Si des citoyens comptent aujourd'hui sur OLEL, ils cessent de recevoir les alertes pendant le pilote.

**Défaut.** Aucun : le déploiement n'aura pas lieu sans votre réponse.

**Recommandation.** Si le service est déjà utilisé par des citoyens : les prévenir avant (message d'information, radio), et convenir avec les autorités du canal de substitution pendant le pilote. Sinon : rien à faire.

- [ ] Aucun citoyen ne dépend aujourd'hui d'OLEL
- [ ] Des citoyens en dépendent ; mesure retenue : ……………………………………

Signataire : ……………………  Fonction : ……………………  Date : ……………

### D2 — Comptes et habilitations

**Question.** Qui crée, modifie, habilite et suspend quels comptes ? Sur quel critère une sentinelle est-elle déclarée apte ?

**Défaut appliqué.** Tables de `backend/src/users/user-policy.ts` : un compte opérateur est créé « en formation », sans aucun droit, puis habilité manuellement après formation. Le tableau de bord n'autorise que ce que le serveur permet.

**Recommandation.** Valider ces tables par écrit ; exiger une formation tracée (date, formateur) et un exercice réussi avant habilitation d'une sentinelle.

- [ ] Recommandation retenue
- [ ] Autre : ……………………………………

Signataire : ……………………  Fonction : ……………………  Date : ……………

### D4 — Diffusion d'urgence (bypass)

**Question.** Qui peut diffuser sans attendre la vérification, qui en est informé immédiatement, qui revoit la décision ?

**Défaut appliqué.** MAIRIE ou supérieur ; justification d'au moins 20 caractères ; message marqué « DIFFUSION D'URGENCE — VÉRIFICATION EN COURS » ; revue a posteriori obligatoire par un compte PRÉFECTURE ou supérieur, distinct de l'auteur.

**Recommandation.** Confirmer le défaut et désigner nommément la personne prévenue en temps réel (préfet ou son représentant).

- [ ] Recommandation retenue ; personne prévenue : ……………………
- [ ] Autre : ……………………………………

Signataire : ……………………  Fonction : ……………………  Date : ……………

### D10 — Administrateurs techniques

**Question.** Les comptes ADMIN et SUPER_ADMIN (équipe technique) peuvent-ils valider et diffuser des alertes ?

**Défaut appliqué.** Oui (rang le plus élevé).

**Recommandation.** Non : séparer l'administration technique de l'autorité opérationnelle. Les administrateurs gèrent comptes et configuration ; seules les autorités diffusent. Modification du code d'environ une demi-journée, avec tests.

- [ ] Recommandation retenue (je réalise la modification)
- [ ] Garder le défaut
- [ ] Autre : ……………………………………

Signataire : ……………………  Fonction : ……………………  Date : ……………

### D11 — Rectificatif et retrait d'une alerte

Le circuit est **développé et testé** (il manquait dans la version auditée) :

- **Rectificatif** : nouveau message envoyé aux mêmes destinataires, par les mêmes canaux, avec la mention « RECTIFICATIF — remplace le message précédent ». Plusieurs rectificatifs successifs sont possibles, chacun tracé.
- **Retrait** (fausse alerte) : motif obligatoire (au moins 20 caractères), message « ALERTE ANNULÉE » aux mêmes destinataires, alerte retirée de toutes les consultations publiques, envoi initial interrompu s'il est encore en cours. Un seul retrait possible ; plus aucun rectificatif ensuite.
- Le suivi des remises (par destinataire et par canal) est visible dans le tableau de bord pour chaque envoi.

**Question.** Qui peut décider d'un rectificatif ou d'un retrait ?

**Défaut appliqué.** La même autorité que pour diffuser l'alerte selon son niveau : MAIRIE pour BLEU, JAUNE et ORANGE ; PRÉFECTURE pour ROUGE ; GOUVERNORAT pour ROUGE FONCÉ (ou supérieur).

**Recommandation.** Conserver ce défaut, et ajouter que le retrait d'une alerte ROUGE ou ROUGE FONCÉ est signalé immédiatement à l'autorité supérieure (procédure, pas de code).

- [ ] Recommandation retenue
- [ ] Autre : ……………………………………

Signataire : ……………………  Fonction : ……………………  Date : ……………

### D12 — Permanence

**Question.** Qui surveille OLEL la nuit et le week-end, qui supplée, qui joint-on si un canal échoue ?

**Défaut appliqué.** Rien n'est modélisé dans le code. Les sondes de santé et les métriques signalent les pannes, mais personne n'est désigné pour les recevoir.

**Recommandation.** Étape 2 : un référent technique et un référent opérationnel joignables aux heures de l'exercice. Étape 3 : astreinte écrite (calendrier, suppléants) et alertes Prometheus envoyées à l'astreinte (Alertmanager).

- [ ] Recommandation retenue ; référents : ……………………
- [ ] Autre : ……………………………………

Signataire : ……………………  Fonction : ……………………  Date : ……………

### D14 — Structure exploitante

**Question.** Quelle structure exploite OLEL, détient les comptes fournisseurs (Meta, Africa's Talking, serveur) et répond aux demandes des personnes sur leurs données ?

**Défaut.** Non désignée.

**Recommandation.** Une structure publique ou mandatée, désignée par écrit, avec un responsable nommé et un suppléant.

- [ ] Structure : ……………………  Responsable : ……………………

Signataire : ……………………  Fonction : ……………………  Date : ……………

### D9 — Perte de données et délai de reprise

**Défaut proposé.** Sauvegarde chiffrée toutes les 6 heures (`scripts/setup-backup.sh`), restauration vérifiée (`scripts/restore.sh --verify-only`).

**Recommandation.** Perte maximale acceptable : 6 heures ; reprise en 4 heures. Copie hors serveur (rclone) ; phrase de chiffrement gardée par deux personnes, hors du serveur.

- [ ] Recommandation retenue ; destination hors serveur : ……………………  gardiens de la clé : ……………………
- [ ] Autre : ……………………………………

Signataire : ……………………  Fonction : ……………………  Date : ……………

### D16 — Mention « EXERCICE » pendant le pilote

**Ce qui est en place.** En mode pilote, tout message diffusé commence par « [OLEL] EXERCICE — » et se termine par « EXERCICE » (SMS, WhatsApp, modèles). C'est automatique : un opérateur ne peut pas l'oublier. Ainsi une capture d'écran transférée hors du groupe d'essai ne peut pas passer pour une vraie alerte.

**Question.** Garder cette mention pendant toutes les étapes en mode pilote ?

**Recommandation.** Oui. Une vraie urgence pendant le pilote se traite par les canaux habituels des autorités, pas par OLEL.

- [ ] Recommandation retenue
- [ ] Autre : ……………………………………

Signataire : ……………………  Fonction : ……………………  Date : ……………

---

## Décisions bloquantes pour l'étape 3 (citoyens volontaires)

### D1 — Autorité sanitaire

**Question.** Qui confirme une alerte d'épidémie (levée de la revue médicale) ?

**Défaut appliqué.** PROTECTION_CIVILE et l'administration. Aucune alerte d'épidémie ne peut être diffusée tant que la revue médicale n'est pas levée.

**Recommandation.** Désigner l'autorité sanitaire (médecin-chef de district ou de région) avec un compte nominatif dédié, et lui réserver la levée de la revue médicale (petite modification du code).

- [ ] Recommandation retenue ; autorité : ……………………
- [ ] Autre : ……………………………………

Signataire : ……………………  Fonction : ……………………  Date : ……………

### D5 — Traductions

**État.** 150 textes destinés aux citoyens et aux sentinelles sont réunis dans [`traductions/relecture-traductions.csv`](traductions/relecture-traductions.csv) (mode d'emploi : [`traductions/LISEZMOI.md`](traductions/LISEZMOI.md)). 37 n'existent qu'en français (consentement, rectificatif, retrait, mention EXERCICE, USSD, SVI). Aucune traduction n'est validée.

**Recommandation.** Deux relecteurs natifs par langue (un rédacteur, un vérificateur), de préférence avec une expérience de la radio communautaire ; validation des messages d'alerte en priorité. J'intègre ensuite les textes validés et je relance les tests.

- [ ] Recommandation retenue ; relecteurs : pulaar …………… wolof …………… soninké ……………
- [ ] Autre : ……………………………………

Signataire : ……………………  Fonction : ……………………  Date : ……………

### D7 — Base légale, consentement, conservation

**Défaut appliqué.** Aucun consentement présumé : après migration, aucun citoyen n'a d'accord WhatsApp enregistré. Le bot demande l'accord et enregistre la réponse ; « STOP » désabonne. Aucune purge automatique.

**Recommandation.** Qualifier le traitement avec la CDP et désigner le responsable de traitement (D14). Pour l'étape 3 : formulaire d'accord écrit des volontaires (objet de l'exercice, numéro utilisé, retrait possible à tout moment) ; durées de conservation à fixer (proposition : médias et positions 12 mois, journaux d'audit 5 ans).

- [ ] Recommandation retenue ; durées : ……………………
- [ ] Autre : ……………………………………

Signataire : ……………………  Fonction : ……………………  Date : ……………

### D8 — Modèles WhatsApp

**Défaut appliqué.** Modèles `alert_level_2` et `alert_level_3` préparés dans les quatre langues ; envoi par modèle désactivé. Sans modèle approuvé, WhatsApp ne joint que les personnes qui ont écrit au bot dans les dernières 24 heures.

**Recommandation.** Pour l'étape 3, demander aux volontaires d'écrire au bot avant chaque exercice (fenêtre de 24 h) ; en parallèle, faire approuver les modèles par Meta après validation des traductions (D5) et qualifier le porteur du compte. Le modèle ORANGE ne contient pas de consigne : à arbitrer.

- [ ] Recommandation retenue
- [ ] Autre : ……………………………………

Signataire : ……………………  Fonction : ……………………  Date : ……………

### D13 — Numéros d'urgence

**Défaut appliqué.** L'application n'affiche que le 18 (sapeurs-pompiers) et le 17 (police).

**Recommandation.** Obtenir une confirmation écrite des numéros à afficher (BNSP, SAMU, Protection civile de Matam), puis renseigner `EMERGENCY_NUMBERS`.

- [ ] Numéros confirmés : …………………… (source : ……………………)

Signataire : ……………………  Fonction : ……………………  Date : ……………

### D6 — Position saisie à la main

**Défaut appliqué.** Acceptée et marquée « saisie manuelle » partout où elle s'affiche.

**Recommandation.** L'accepter pour les signalements ; exiger une position GPS pour la vérification de terrain par une sentinelle (petite modification du code).

- [ ] Recommandation retenue
- [ ] Autre : ……………………………………

Signataire : ……………………  Fonction : ……………………  Date : ……………

---

## Avant l'étape 4 (élargissement)

### D3 — Automatismes

**Défaut appliqué.** Pré-alerte automatique et escalade automatique en ROUGE **désactivées**.

**Recommandation.** Les laisser désactivées pendant tout le pilote. Les activer seulement avec une permanence de nuit (D12) ; la mention « non confirmée par l'autorité » reste alors obligatoire (en place).

- [ ] Recommandation retenue
- [ ] Autre : ……………………………………

Signataire : ……………………  Fonction : ……………………  Date : ……………
