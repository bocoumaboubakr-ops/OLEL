# OLEL — Remédiation de l'audit du 12 octobre 2026

> Branche : `claude/laughing-hawking-4olx5k` · version auditée : `cfd68a5` (21/06/2026) · travaux du 14 au 15/10/2026.
> Aucune mise en production, aucune diffusion réelle, aucune migration exécutée sur des données réelles : tout a été vérifié sur des environnements de test avec des données fictives et des fournisseurs simulés ou non configurés.

## 1. Version et méthode

- **Version de départ.** La branche désignée portait la version la plus avancée (`cfd68a5`), postérieure à `main`. L'installation stricte échouait (lockfile incomplet) : corrigé en premier (commit `3dc8329`).
- **Lecture critique de l'audit.** Chaque constat a été vérifié dans le code, puis reproduit lorsque c'était possible. Deux constats ont été élargis : des contournements supplémentaires ont été trouvés (rejet sans contrôle d'autorité, abaissement de niveau pour éviter la confirmation, données hydrologiques simulées affichées comme aide à la décision, confirmation « autorités notifiées » dans le bot, Permissions-Policy bloquant le micro du mobile).
- **Preuve avant/après.** `scripts/verify/before-after-probes.js` rejoue les mêmes requêtes contre `cfd68a5` et contre la version corrigée. **7/7 défauts reproduits sur la version auditée, 7/7 refusés** par la version corrigée (§ 4.3).
- **Règle suivie.** Toutes les règles sont appliquées côté serveur ; les interfaces ne font qu'afficher ce que le serveur autorise.

Commits (lisibles un par un) : `git log --oneline cfd68a5..claude/laughing-hawking-4olx5k`.

**Suite du 15/10/2026 — préparation du pilote** (§ 12) : mode pilote verrouillé côté serveur (envoi **et** consultation), mention « EXERCICE » automatique, rectificatif et retrait d'alerte (D11), suivi des remises dans le tableau de bord, répétition non destructive du déploiement sur une copie des données réelles, feuille de relecture des traductions, [registre des décisions](DECISIONS_PILOTE.md) et [guide de mise en service](MISE_EN_SERVICE_PILOTE.md).

## 2. Synthèse

| Lot | Constats | État |
|---|---|---|
| A — bloquants sécurité et chaîne d'alerte | F01–F07, F10–F12, F17, F23, F29 | corrigés et testés |
| B — cohérence des parcours | F08, F09, F13–F16, F18–F21 | corrigés et testés |
| C — échanges durables et exploitation | F22, F24–F26, F28, F30–F33 | corrigés dans le code ; plusieurs dépendent d'accès fournisseurs |
| D — crédibilité et accessibilité | F27, F34, F35 | corrigés pour l'essentiel ; essais utilisateurs à mener |

**Ce qui reste hors de portée du code** : approbation des modèles WhatsApp par Meta, compte Africa's Talking de production et URL de rappel, numéros d'urgence confirmés officiellement, relecture des traductions par des locuteurs, décisions de gouvernance (§ 8), copie hors serveur des sauvegardes, pare-feu réel du VPS, essais sur le terrain.

## 3. Matrice F01–F35

Légende du classement : **confirmé** · **confirmé, élargi** (défauts supplémentaires trouvés) · **partiellement confirmé** · **dépendant** (décision métier ou accès externe nécessaire pour clore).

| ID | Gravité audit | Classement | Correction | Tests | Reste ouvert |
|---|---|---|---|---|---|
| F01 | P0 | confirmé | politique de gestion des comptes (rang, rôles attribuables, territoire, pas d'auto-modification) | e2e auth-sessions, unitaires user-policy, sonde avant/après | tables de droits à valider (D2) |
| F02 | P0 | confirmé | Socket.IO authentifié, salles attribuées par le serveur, résumé minimal, révocation | e2e realtime (8), sonde | — |
| F03 | P0 | confirmé | politique unique ; aucun automatisme sur alerte rejetée/annulée/clôturée ; automatismes désactivés par défaut | e2e diffusion-chain F03 (4), unitaires alert-policy | activation éventuelle (D3) |
| F04 | P0 | confirmé | intention de diffusion figée (texte par langue, zones, canaux) exécutée à l'identique | e2e F04 (2), bot-relay (modèles) | modèles Meta (externe) |
| F05 | P0 | confirmé, élargi | autorité par étape y compris rejet, niveau de parcours = max(actuel, proposé), double regard ROUGE+, revue médicale bloquante partout, bypass borné et revu | e2e F05 (7), scoping F14 (6 rôles/étapes), sonde | D1, D4, D10 |
| F06 | P0 | confirmé, élargi | USSD/SVI : enregistrement avant confirmation, messages factuels ; bot et mobile sans « autorités notifiées » ; plus de mesures OMVS simulées | e2e channels (12), bot (15), navigateur (14) | traductions (D5) |
| F07 | P1 | confirmé | statut de compte, sessions révocables, identité relue à chaque requête, socket coupé | e2e auth-sessions, realtime, sonde | — |
| F08 | P1 | confirmé | lectures et écritures cloisonnées (alertes, historique, recoupement, diffusions, signalements, missions, comptes) | e2e scoping (18), sonde | — |
| F09 | P1 | confirmé | territoire récursif (CTE), jamais les zones sœurs ; commune choisie par le citoyen (mobile, WhatsApp) | e2e scoping, bot-relay, bot | adoption par les citoyens |
| F10 | P1 | confirmé | ThrottlerGuard global, proxy de confiance, verrouillages en base (mot de passe, TOTP) | e2e auth-sessions | limite par instance (mono-instance au pilote) |
| F11 | P1 | partiellement confirmé | sessions stockées et révocables, MFA vérifié au renouvellement, ancien facteur exigé, aléas cryptographiques, OTP hachés, RETURN_OTP_DEV_CODE interdit en production | e2e auth-sessions (18), sonde | jetons toujours en localStorage (risque accepté, § 9) |
| F12 | P1 | confirmé | contenu vérifié par signature binaire, extension imposée, plus de `/uploads` public, URL signées expirantes | e2e media (8), sonde | durée de conservation, EXIF (D7) |
| F13 | P1 | confirmé | renouvellement de session, déconnexion serveur, file et caches par compte, plus de cache d'API partagé | navigateur (14) | — |
| F14 | P1 | confirmé | actions autorisées calculées par le serveur ; ancien circuit retiré des interfaces ; triple validation retirée (410) | e2e scoping F14 | — |
| F15 | P1 | confirmé | contrat API seul, `clientRequestId` (pas de doublon), erreurs définitives distinctes, état visible, verrou | e2e scoping F15, navigateur | médias non conservés hors ligne |
| F16 | P1 | confirmé | définition unique « alerte publique » ; « consultation indisponible » ≠ « aucune alerte » (bot, USSD, mobile, tableau de bord) | e2e channels, bot-relay, bot | — |
| F17 | P1 | confirmé | transitions conditionnelles, transaction décision + intention, idempotence | e2e F17 (3) | — |
| F18 | P1 | confirmé | plus de coordonnées substituées ; provenance (GPS/saisie manuelle) et précision enregistrées ; bornes | e2e scoping F18 | accepter ou non la saisie manuelle (D6) |
| F19 | P1 | confirmé | états en formation / habilité / suspendu ; habilitation explicite ; jamais par la seule formation | e2e auth-sessions, scoping | critère d'aptitude (D2) |
| F20 | P2 | confirmé | missions cloisonnées, agent habilité du territoire, statut de participation distinct | e2e scoping F20 | définition de l'activité |
| F21 | P2 | confirmé | sous-type structuré ; niveau dérivé de la gravité déclarée, même règle partout | e2e scoping F18/F21 | — |
| F22 | P1 | confirmé | suivi par destinataire et canal, statuts WhatsApp et SMS confirmés, reprises bornées, simulation interdite en production | e2e diffusion-chain F22 (5), bot-relay (2), déploiement | abonnement aux statuts Meta, rappels AT (externe) |
| F23 | P1 | confirmé | boîte d'envoi transactionnelle, reprise périodique, panne Redis sans perte | e2e F23, déploiement Compose (panne réelle) | — |
| F24 | P1 | confirmé — **dépendant** | consentement explicite, STOP, fenêtre 24 h, modèles figés à la décision (indicateur désactivé) | e2e bot-relay (6), bot | approbation Meta, statut « entité gouvernementale » (D8) |
| F25 | P1 | confirmé | message enregistré avant accusé, dédoublonnage, reprise, sessions persistées, 1er média conservé | e2e bot-relay (4), bot (8) | — |
| F26 | P1 | partiellement confirmé | matrice des canaux publiée (§ 7.4), auth. des rappels, délais maximaux, USSD consultation réelle | e2e channels | SVI et push non opérationnels (déclarés comme tels) |
| F27 | P2 | partiellement confirmé | zoom rétabli, langue du document dynamique | — | lecteurs d'écran, essais avec des utilisateurs |
| F28 | P1 | confirmé | lockfile complet, images depuis la racine, CI complète, ESLint du landing | builds 5/5, images 5/5, lint/types 6/6 | CI GitHub à observer au premier passage |
| F29 | P1 | confirmé | Next 15.5.28, React 19.2.9, correctifs transitifs | audit prod : 0 critique | avis « high » d'outils de build (§ 9) |
| F30 | P1 | confirmé | volume médias, journaux stdout avec rotation | déploiement Compose | — |
| F31 | P1 | confirmé — **dépendant** | sauvegarde base + médias chiffrée, manifeste, restauration vérifiée, sans socket Docker | exercice 10/10, déploiement 23/23 | destination hors serveur, RPO/RTO (D9) |
| F32 | P1 | confirmé (configuration) | ports liés à 127.0.0.1, Redis authentifié, rechargement TLS, Grafana sans défaut | déploiement Compose | pare-feu réel du VPS (externe) |
| F33 | P2 | confirmé | prom-client, indicateurs de chaîne, santé « diffusion », alertes Prometheus | e2e supervision (5) | destinataires des alertes (Alertmanager) |
| F34 | P2 | partiellement traité | composants morts supprimés, gouvernance unique côté serveur, DTO validés | — | Zone vs Region/Department/Municipality, découpage du mobile |
| F35 | P1 | confirmé — **dépendant** | plus de chiffres, numéros, témoignage ni partenariats non attestés | vérification du rendu | accords partenaires, images officielles |

### 3.1 Détail par constat

**F01 — élévation de privilèges.** *Diagnostic* : `UsersService.update` acceptait un changement de rôle sans comparer le rang de l'appelant ; un COORDINATEUR pouvait promouvoir un compte SUPER_ADMIN (reproduit). *Correction* : `backend/src/users/user-policy.ts` (rangs, rôles attribuables, rôles gérables, territoire, interdiction de modifier son propre compte), appliquée dans `users.service.ts` avec traçabilité des refus et révocation des sessions à tout changement sensible. *Fichiers* : `users/user-policy.ts`, `users/users.service.ts`, `users/users.controller.ts`, `users/dto/*`. *Tests* : `user-policy.spec.ts`, `auth-sessions.e2e-spec.ts`, sonde avant/après (« HTTP 200, rôle final SUPER_ADMIN » → « HTTP 403 »).

**F02 — temps réel anonyme.** *Diagnostic* : passerelle Socket.IO sans authentification, abonnement libre (`join:zone`), contenu complet diffusé (reproduit). *Correction* : `alerts/alerts.gateway.ts` — jeton d'accès vérifié avec les mêmes règles que l'API, salles attribuées par le serveur selon le territoire, `join:zone` refusé, résumé minimal pour les opérateurs, événement public seulement pour une alerte diffusée sur la zone, revalidation chaque minute. Tableau de bord : rechargement via l'API. *Tests* : `realtime.e2e-spec.ts` (8), sonde.

**F03 — diffusion automatique d'une alerte rejetée.** *Diagnostic* : l'auto-escalade et la clôture automatique ne filtraient pas les états terminaux (reproduit). *Correction* : `alerts/alert-policy.ts` (états terminaux, éligibilité), transition conditionnelle, automatismes derrière les indicateurs `auto_escalation_red` / `prealert_red` **désactivés par défaut**, message marqué « non confirmée par l'autorité ». *Tests* : diffusion-chain F03 (4), alert-policy.

**F04 — texte, cibles et canaux ignorés.** *Diagnostic* : le processeur reconstruisait un message et une liste de destinataires indépendamment de la décision (reproduit). *Correction* : intention `Broadcast` créée dans la transaction de décision, texte figé par langue (`common/i18n/alert-messages.ts`), zones et canaux exacts ; le processeur exécute l'intention telle quelle (`notifications/notifications.processor.ts`). Hors fenêtre WhatsApp de 24 h, les paramètres de modèle sont figés eux aussi. *Tests* : diffusion-chain F04 (texte reçu = texte figé, zones et canaux respectés, canal inconnu refusé).

**F05 — barrières métier contournables.** *Diagnostic* : diffusion directe sans confirmation, revue médicale contournable par le bypass, rejet possible par n'importe quel rôle, abaissement ROUGE → ORANGE permettant d'éviter la confirmation (ces deux derniers points s'ajoutent à l'audit). *Correction* : `alert-policy.ts` (autorité par étape pour valider **et** rejeter, niveau de parcours = max(actuel, proposé), double regard pour ROUGE+, revue médicale bloquante sur tous les chemins, bypass réservé MAIRIE+ avec justification ≥ 20 caractères, mention « vérification en cours » et revue a posteriori par une autre autorité). *Tests* : diffusion-chain F05 (7), alert-policy, scoping F14, sonde (rejet par une sentinelle : « 201, REJECTED » → « 403 »).

**F06 — aide annoncée sans avoir eu lieu.** *Diagnostic* : SVI touche 2 sans enregistrement, USSD confirmant avant l'écriture, mobile « transmis aux autorités » même hors ligne ; en plus : bot « Les autorités ont été notifiées » (4 langues), invite SVI lisant une alerte fictive, panneau « Recoupement » affichant un niveau du fleuve simulé. *Correction* : `ussd/ussd.service.ts` (écriture attendue, référence, échec annoncé), `ivr/ivr.controller.ts` (enregistrement réel, invite neutre), écrans mobile « Enregistré sur ce téléphone » / « Reçu par OLEL », bot sans promesse, hydrologie « aucune source connectée ». *Tests* : channels-confirmations (12), bot, navigateur.

**F07 — désactivation incomplète.** *Correction* : `AccountStatus` (IN_TRAINING / ACTIVE / SUSPENDED), `Session` révocable, `tokenVersion`, identité relue en base à chaque requête (`auth/session.service.ts`, `auth/strategies/jwt.strategy.ts`), OTP refusé aux comptes suspendus, sockets coupés. *Tests* : auth-sessions, realtime, sonde (« 200 » → « 401 »).

**F08 — cloisonnement territorial.** *Correction* : `AlertsService.readScope` (opérateur : son territoire ; radio : alertes diffusées ; citoyen : alertes publiques de sa zone et ses propres signalements, vue publique), 404 hors périmètre ; signalements, missions, diffusions et comptes cloisonnés. *Tests* : scoping (18), sonde (« 200 » → « 404 »).

**F09 — expansion géographique.** *Correction* : `common/territory/territory.service.ts` (CTE récursives) ; destinataires = sous-arbre des zones ciblées ; signalements non localisés visibles par les opérateurs locaux et transformés en alerte **de leur commune** ; commune d'abonnement choisie par le citoyen (profil mobile, WhatsApp). *Tests* : scoping, bot-relay, bot.

**F10 — limitation des tentatives.** *Correction* : `APP_GUARD` ThrottlerGuard, `trust proxy` explicite (`TRUST_PROXY_HOPS`), verrouillages persistés (10 échecs de mot de passe → 15 min ; 5 échecs TOTP → 15 min), ports applicatifs non publiés. *Limite* : compteurs de limitation en mémoire par instance.

**F11 — sessions et secrets.** *Correction* : table `sessions` (rotation, détection de réutilisation, révocation à tout changement de mot de passe/facteur/rôle), MFA exigé au renouvellement pour les rôles concernés, code actuel exigé pour réenrôler le TOTP, `crypto.randomInt`, OTP stockés en HMAC, validation de configuration en production. *Non traité* : stockage des jetons dans `localStorage` (voir § 9).

**F12 — médias.** *Correction* : `common/media/*` (signatures binaires, extension imposée, fichier 0640), plus de `/uploads` public (backend et Nginx), URL signées HMAC valables 1 h insérées dans les seules réponses authentifiées, champs média limités aux médias OLEL. *Tests* : media (8) dont fichiers hérités. *Sonde* : « 200 » → « 404 ».

**F13 — hors connexion par compte.** *Correction* : `lib/session.ts` (dashboard et mobile) — renouvellement mono-vol, multi-onglets, déconnexion révoquant la session ; service worker sans cache d'API ; file IndexedDB rattachée au compte et purgée à la déconnexion après confirmation. *Tests* : navigateur 14/14 (`scripts/verify/mobile-offline-flow.js`).

**F14 — anciennes règles.** *Correction* : `GET /alerts/:id` renvoie `actions` (autorisé ou non, raison) ; le tableau de bord n'affiche que ces actions ; triple validation retirée (410). *Tests* : chaque action annoncée est confrontée à l'API réelle pour 6 combinaisons rôle/étape/niveau.

**F15 — rejeu hors connexion.** *Correction* : contrat API seul, `clientRequestId` → `sourceRef` unique, erreurs définitives visibles, verrou, mise en file si le réseau coupe pendant l'envoi.

**F16 — statut obsolète.** *Correction* : `PUBLIC_ACTIVE_STATUSES` utilisé partout ; `publicActiveFor(zone)` pour bot et USSD ; « indisponible » distinct de « aucune alerte » partout.

**F17 — transactions.** *Correction* : `updateMany` conditionnel (409 en concurrence), transaction signalement → alerte → intention, contrainte `(alertId, kind)`, clé d'idempotence rejouable.

**F18 — preuve terrain.** *Correction* : plus de coordonnées de Matam substituées ; validation à l'étape RÉCEPTION réservée à l'application mobile (GPS capturé, photo image, gravité) ; `LocationSource` et précision enregistrées ; bornes géographiques.

**F19 — formation et habilitation.** *Correction* : sentinelle créée « en formation » (accès formation seulement), habilitation explicite par un responsable (traçée), suspension jamais levée par la formation ; écrans dédiés (tableau de bord, mobile).

**F20 — missions.** *Correction* : liste cloisonnée, assignation d'un agent habilité et rattaché à la zone, statut de participation distinct.

**F21 — vocabulaire.** *Correction* : champ `subtype`, gravité déclarée (1–3) distincte du niveau officiel, dérivé par une seule règle (`levelFromDeclaredSeverity`).

**F22 — envoyé ≠ livré.** *Correction* : `BroadcastDelivery` par destinataire et canal (QUEUED/SENT/DELIVERED/READ/FAILED/SIMULATED/SKIPPED), statuts Meta et rapports SMS appliqués de façon monotone, compteurs recalculés, simulation impossible en production. *Preuve en conditions réelles* : sur le déploiement Compose sans fournisseur, la diffusion se termine **FAILED « canal non configuré »** et rien n'est compté comme envoyé.

**F23 — perte entre base et file.** *Correction* : intention écrite dans la transaction de décision ; `BroadcastDispatcher` remet en file et rebalaye toutes les 30 s. *Preuve* : Redis arrêté au moment de la décision (déploiement Compose) → décision enregistrée, intention PENDING, santé 503 ; Redis relancé → exécution.

**F24 — modèles et consentement.** *Correction* : consentement explicite enregistré (bot), STOP / ALERTES, WhatsApp seulement avec consentement, texte libre dans la fenêtre de 24 h, au-delà modèle approuvé (indicateur `whatsapp_templates`), sinon « non éligible » visible et repli SMS. Numéro « Protection civile » non vérifié retiré des modèles. **Dépend** de l'approbation Meta et de la qualification du porteur (D8).

**F25 — réception du bot.** *Correction* : message enregistré (`inbound_messages`) **avant** l'accusé à Meta, 503 si impossible (Meta re-livre), dédoublonnage, reprise toutes les minutes, sessions persistées 24 h, premier média conservé, positions WhatsApp utilisées, journaux sans données personnelles.

**F26 — couverture multicanal.** *Correction* : canaux par défaut limités à ceux réellement implémentés, rappels Africa's Talking authentifiés (`AT_CALLBACK_SECRET`), délais maximaux sur tous les appels externes, matrice publiée (§ 7.4) et site vitrine aligné.

**F27 — accessibilité.** *Correction* : zoom rétabli, attribut `lang` = langue choisie. *Non vérifié* : lecteur d'écran, clavier, essais avec des personnes peu alphabétisées.

**F28 — installation et CI.** *Correction* : lockfile complet, 5 Dockerfiles depuis la racine (`--frozen-lockfile`, `pnpm deploy --prod`), CI sur les branches de travail (lint, types, unitaires, e2e PostgreSQL/Redis, bot, builds, images), ESLint du landing.

**F29 — dépendances.** *Correction* : Next.js 15.5.28 (maintenance LTS, correctif du 14/10/2026), React 19.2.9, axios, multer, compression, socket.io, bcrypt 6, surcharges transitives (proxy-addr, body-parser, qs, form-data, engine.io, socket.io-parser, ws, lodash, js-yaml).

**F30 — persistance.** *Correction* : volume `backend_uploads`, journaux stdout avec rotation Docker. *Preuve* : média toujours servi après recréation du conteneur.

**F31 — sauvegardes.** *Correction* : `scripts/backup.sh`, `scripts/restore.sh`, `scripts/setup-backup.sh` (§ 7.3). Plus de conteneur monté sur le socket Docker. *Preuves* : exercice 10/10, restauration Compose de 28 tables et des médias avec comptages identiques.

**F32 — réseau et TLS.** *Correction* : ports liés à 127.0.0.1 (seul Nginx publie 80/443), Redis authentifié (obligatoire en production) avec AOF, rechargement Nginx après renouvellement Certbot, `/api/v1/metrics` non public, Grafana sans mot de passe par défaut.

**F33 — supervision.** *Correction* : `metrics/*` (prom-client, indicateurs de la chaîne), `/health/ready` (base + Redis), `/health/diffusion` (503 avec la cause), alertes Prometheus. *Reste* : configurer qui reçoit les alertes (Alertmanager vide).

**F34 — dette.** *Traité* : composants morts supprimés (mobile `ReportForm`, `AlertsList`, dashboard `CriticalValidationStatus`), règles d'alerte uniquement côté serveur, DTO validés pour les nouveaux points d'entrée. *Non traité* : unification Zone / Region-Department-Municipality, découpage du fichier `apps/mobile/src/app/page.tsx`, audit transactionnel de toutes les actions.

**F35 — affirmations publiques.** *Correction* : `apps/landing` — plus de « 562 000 habitants couverts », numéros fictifs, « traduction IA », « appels en moins de trente minutes », témoignage attribué ; canaux avec leur état réel ; partenaires présentés comme collaborations envisagées.

## 4. Résultats de tests et vérifications

### 4.1 Commandes et résultats (15/10/2026)

| Vérification | Commande | Résultat |
|---|---|---|
| Installation figée | `pnpm install --frozen-lockfile` | OK |
| Lint (6 tâches) | `pnpm lint` | 6/6, 0 erreur |
| Types (6 tâches) | `pnpm type-check` | 6/6 |
| Backend unitaires | `cd backend && pnpm test` | **61/61** (8 suites) |
| Backend e2e | `cd backend && pnpm test:e2e --forceExit` | **120/120** (10 suites) : auth-sessions 18, diffusion-chain 22, realtime 8, channels-confirmations 12, media 8, scoping-coherence 18, bot-relay 13, supervision 5, pilot-ops 8, pilot-consultation 8 |
| Bot | `cd apps/bot && pnpm test` | **16/16** |
| Répétition sur copie (production simulée `cfd68a5`, données fictives) | `scripts/rehearse-deploy.sh` | **17/17**, base de production inchangée |
| Mobile hors ligne (navigateur réel) | `scripts/verify/mobile-offline-flow.js` | **14/14** |
| Déploiement Compose représentatif | `scripts/verify/deployment-check.sh` | **23/23** |
| Sauvegarde / restauration | `scripts/verify/backup-restore-drill.sh` | **10/10** |
| Avant / après | `scripts/verify/before-after-probes.js` | **7/7 reproduits** sur `cfd68a5`, **7/7 refusés** |
| Builds | `next build` ×3, `nest build` ×2 | 5/5 |
| Images Docker | `docker build -f <composant>/Dockerfile .` | 5/5, démarrées dans le déploiement Compose |
| Audit dépendances (production) | `pnpm audit --prod --audit-level=critical` | 0 critique (2 low, 17 moderate, 21 high : § 9) |

Environnement : PostgreSQL 16 et Redis 7 locaux (`scripts/test-services.sh`), Chromium préinstallé, Docker 29.

### 4.2 Scénarios de recette de l'audit (§ 12) couverts

| Scénario demandé | Où |
|---|---|
| autorisations et accès hors territoire | scoping-coherence, sonde F08 |
| changement de rôle, suspension, MFA | auth-sessions, sondes F01/F07/F11, realtime |
| rejet puis tentative d'auto-escalade | diffusion-chain F03 |
| validations concurrentes, doubles requêtes | diffusion-chain F17, scoping F15, channels (USSD simultané) |
| texte/zones/canaux approuvés = exécutés | diffusion-chain F04, bot-relay (modèles) |
| panne Redis ou fournisseur, reprise, pas de doublon | diffusion-chain F22/F23, déploiement Compose (panne Redis réelle) |
| signalement hors connexion et changement de compte | navigateur 14/14 |
| webhook répété | bot-relay F25, channels (USSD/SVI rejoués) |
| restauration base et médias | exercice 10/10, déploiement Compose |

### 4.3 Sondes avant / après (même requêtes, bases de test séparées)

| Sonde | Version auditée `cfd68a5` | Version corrigée |
|---|---|---|
| F01 COORDINATEUR élève un compte en SUPER_ADMIN | reproduit (HTTP 200, rôle SUPER_ADMIN) | refusé (403) |
| F02 socket anonyme reçoit le contenu des alertes | reproduit (`alert:new`, `alert:global`) | refusé (déconnecté) |
| F05 sentinelle rejette une ROUGE à confirmer | reproduit (201, REJECTED) | refusé (403) |
| F07 jeton d'un compte suspendu | reproduit (200) | refusé (401) |
| F08 lecture d'une alerte d'une autre commune | reproduit (200) | refusé (404) |
| F11 refresh sans le MFA du nouveau rôle | reproduit (200) | refusé (401) |
| F12 média lisible sans authentification | reproduit (200) | refusé (404) |

### 4.4 Limites des vérifications

- **Aucun fournisseur réel** n'a été contacté : WhatsApp, SMS, USSD et SVI sont simulés en test et non configurés dans le déploiement de validation. Aucune livraison réelle, aucun modèle Meta, aucun rappel Africa's Talking n'est éprouvé.
- Le déploiement représentatif est un Compose local (sans Nginx/TLS ni Certbot réels) ; le pare-feu du VPS n'a pas été inspecté.
- Les migrations ont été appliquées sur des bases neuves et sur une production simulée (données fictives), **pas encore sur une copie de la base de production réelle** : `scripts/rehearse-deploy.sh` est prêt pour cela (étape 1 du [guide](MISE_EN_SERVICE_PILOTE.md)), il faut un accès au serveur.
- Les e2e utilisent `--forceExit` (connexions Bull/ioredis non fermées à la fin du processus).
- Contraintes du bac à sable contournées sans affaiblir les contrôles : dépôt Alpine bloqué (les images n'en dépendent plus), proxy TLS (certificat passé en secret de build facultatif), limite Docker Hub (image Redis tirée d'un miroir pour l'essai local uniquement).
- Le build Next télécharge les polices Google au moment du build (un échec transitoire observé).
- Non testé : lecteur d'écran, appareils modestes, charge, plusieurs instances backend, essais avec des citoyens.

## 5. Migrations (toutes additives, aucune suppression de données)

| Migration | Contenu | Effet sur les données existantes |
|---|---|---|
| `20261014100000_auth_sessions_account_status` | statut de compte, sessions, verrouillages, TOTP en attente, habilitation | comptes `isActive=false` → SUSPENDED ; opérateurs actifs → habilités ; **codes OTP en cours invalidés** ; **tous les utilisateurs devront se reconnecter** |
| `20261014120000_broadcast_outbox` | intentions de diffusion, remises par destinataire, revue du bypass | diffusions historiques marquées DONE (jamais rejouées) ; `sentCount ← deliveredCount`, `deliveredCount ← 0` (l'ancien « livré » était un « envoyé ») ; suppression d'un **index** résiduel `validations(alertId, validatorId)` (erreur 500) |
| `20261014140000_signalement_source_ref` | `sourceRef` unique (dédoublonnage par canal) | aucun |
| `20261014160000_location_provenance_subtype` | provenance de position, sous-type | aucun |
| `20261015090000_bot_relay_consent` | consentement, désabonnement, fenêtre WhatsApp, messages entrants, sessions du bot | **aucun citoyen existant n'a de consentement WhatsApp enregistré** : après déploiement, aucune alerte WhatsApp ne lui parvient tant qu'il n'a pas donné son accord (repli SMS si configuré) — voir D7 |
| `20261015120000_bot_account_least_privilege` | compte technique « BOT OLEL » ADMIN → CITOYEN | réversible : `UPDATE users SET role='ADMIN' WHERE name='BOT OLEL'` |
| `20261015160000_alert_correction_retraction` | types de diffusion RECTIFICATIF et RETRAIT, numéro d'ordre des diffusions, colonnes de retrait sur les alertes | aucun : l'unicité `(alerte, type)` devient `(alerte, type, numéro)` avec numéro = 0 pour l'existant (plusieurs rectificatifs possibles) |

Dérive préexistante non modifiée (constatée par `prisma migrate diff`) : quelques clés étrangères, valeurs par défaut et l'index `zones_code_idx` diffèrent entre schéma et migrations depuis avant ces travaux ; à traiter séparément, après décision.

## 6. Changements de configuration

**Nouvelles variables** (voir `.env.example`, générées par `scripts/generate-secrets.sh`) :

| Variable | Rôle | Production |
|---|---|---|
| `REDIS_PASSWORD` | authentification de Redis (file de diffusion) | **obligatoire** (le backend refuse de démarrer sans) |
| `AT_CALLBACK_SECRET` | secret `?key=` des rappels USSD, SVI, rapports SMS | **obligatoire** (sinon 503 sur ces rappels) |
| `WHATSAPP_VERIFY_TOKEN` | vérification du webhook Meta | **obligatoire** (plus de valeur par défaut) |
| `METRICS_TOKEN` | collecte Prometheus | recommandé (sinon `/metrics` masqué) ; copier dans `monitoring/prometheus/metrics.token` |
| `MEDIA_URL_SECRET`, `MEDIA_URL_TTL_S` | signature des URL de médias | facultatif (défaut : `JWT_SECRET`, 3600 s) |
| `PUBLIC_API_URL` | base des URL signées | doit être joignable par les navigateurs |
| `TRUST_PROXY_HOPS` | proxys de confiance | 1 (Nginx) |
| `EMERGENCY_NUMBERS` | numéros d'urgence du mobile (JSON) | seulement après confirmation officielle |
| `GRAFANA_PASSWORD` | profil monitoring | obligatoire si le profil est utilisé |
| `PILOT_RECIPIENT_ALLOWLIST` | **mode pilote** : seuls ces numéros (E.164, séparés par des virgules) reçoivent les diffusions et peuvent consulter les alertes ; mention « EXERCICE » sur chaque message | étapes 2 et 3 du pilote ; vide = fonctionnement normal, seulement après décision écrite |

**Indicateurs** (tous désactivés par défaut) : `prealert_red`, `auto_escalation_red`, `whatsapp_templates` (à activer seulement après approbation Meta), `ivr`.

**Fournisseurs** : URL de rappel Africa's Talking avec `?key=<AT_CALLBACK_SECRET>` — `/api/v1/ussd/session`, `/api/v1/ivr/webhook`, `/api/v1/providers/sms/delivery-report` ; webhook Meta abonné aux **messages et aux statuts de message**.

**Infrastructure** : contexte de build = racine ; ports internes sur 127.0.0.1 ; volume `backend_uploads` ; Redis avec mot de passe et AOF ; Nginx (`/uploads` 404, `/api/v1/media/`, `/api/v1/metrics` 404, rechargement TLS) ; service de sauvegarde Compose supprimé au profit de la crontab de l'hôte.

**Utilisateurs** : reconnexion obligatoire de tous les comptes ; le service worker mobile v6 supprime l'ancien cache d'API.

## 7. Procédures

> Ces procédures sont **préparées mais non exécutées**. Le déploiement en production, toute diffusion réelle et toute migration sur des données réelles attendent votre accord explicite.

### 7.1 Déploiement

1. **Répétition sur une copie** : `sudo scripts/rehearse-deploy.sh` depuis un clone séparé sur le serveur (copie de la base dans `olel_repetition`, migrations, contrôles de comptage et d'invariants, démarrage de la nouvelle version sans fournisseur ; production seulement lue). Détail : [guide de mise en service, étape 1](MISE_EN_SERVICE_PILOTE.md).
2. **Préparer l'environnement** : compléter `.env` avec les variables du § 6 (`scripts/generate-secrets.sh`), créer `monitoring/prometheus/metrics.token`, conserver les secrets hors serveur.
3. **Construire et étiqueter** : `docker compose -f docker-compose.yml -f docker-compose.prod.yml build` ; étiqueter les images actuelles en `:rollback` avant remplacement.
4. **Annoncer** une fenêtre de maintenance et la reconnexion obligatoire.
5. **Sauvegarder** : `scripts/backup.sh` puis `scripts/restore.sh <lot> --verify-only` (doit réussir).
6. **Arrêter** bot et backend (`docker compose … stop bot backend`) ; les anciennes tâches « fanout » restant dans Redis sont ignorées par le nouveau processeur.
7. **Démarrer** `postgres redis`, puis `backend` : les migrations s'appliquent au démarrage. Suivre `docker logs -f olel-backend`, puis vérifier `GET /api/v1/health/ready` (200) et `GET /api/v1/health/diffusion` (cause affichée si dégradé).
8. **Démarrer** `bot dashboard mobile landing nginx` (fichier `docker-compose.prod.yml`).
9. **Configurer les fournisseurs** (URL de rappel avec `?key=`, abonnement aux statuts Meta).
10. **Contrôles après déploiement** (lecture seule) : santé, métriques avec jeton, connexion d'un opérateur nommé avec MFA, vérification du webhook, signalement de test depuis un numéro de l'équipe. Toute diffusion d'essai uniquement vers des numéros de test, avec accord préalable.
11. **Mettre en place les sauvegardes** : `scripts/setup-backup.sh` (crontab toutes les 6 h, destination hors serveur).

### 7.2 Retour arrière

- **Retour rapide (code seulement)** : redéployer les images `:rollback`. Les migrations étant additives, l'ancienne version fonctionne sur le schéma migré (colonnes nouvelles ignorées). À n'utiliser que pour un défaut applicatif, en sachant que l'ancienne version réintroduit les défauts F01–F35.
- **Retour complet (données)** : arrêter les services, restaurer le lot pris à l'étape 5 dans une base neuve, puis échanger les bases (`ALTER DATABASE olel RENAME TO olel_echec; ALTER DATABASE olel_restaure RENAME TO olel;`), restaurer les médias dans le volume, redémarrer avec les images `:rollback`. Les données saisies depuis le déploiement sont perdues : à décider au cas par cas.

### 7.3 Restauration après incident

1. Récupérer le lot (`olel-<horodatage>.tar.enc` + `.sha256`) depuis la destination hors serveur et la phrase de chiffrement depuis le coffre.
2. `BACKUP_PASSPHRASE_FILE=… scripts/restore.sh <lot> --verify-only`.
3. Créer une base vide puis `scripts/restore.sh <lot> --db-url postgresql://olel:…@127.0.0.1:5434/olel_restaure --media-dir /tmp/medias` : le script refuse une cible non vide et vérifie comptages et liste des médias.
4. Copier les médias dans le volume : `docker run --rm -v <projet>_backend_uploads:/data -v /tmp/medias:/src:ro alpine sh -c 'cp -a /src/. /data/'`.
5. Basculer comme au § 7.2 et contrôler la santé.
6. Exercice recommandé chaque trimestre dans un environnement neuf (`scripts/verify/backup-restore-drill.sh` pour la mécanique).

### 7.4 Matrice des canaux (état réel)

| Canal | Sens | Langues | Fournisseur | État |
|---|---|---|---|---|
| WhatsApp (bot) | entrant + sortant | fr ; ff/wo/snk à valider | Meta Cloud API | développé, testé en simulation ; modèles d'alerte en attente d'approbation |
| Application web mobile | entrant + consultation | fr (interface) | — | développée, testée (navigateur) |
| Tableau de bord | opérateurs | fr | — | développé |
| SMS | sortant (alertes) | texte figé par langue | Africa's Talking | développé, compte de production à finaliser ; signalement par SMS non implémenté |
| USSD | entrant + consultation | fr | Africa's Talking | développé ; code court à obtenir |
| SVI (appel vocal) | entrant (touche 2) | fr | Africa's Talking | partiel, non opérationnel (indicateur désactivé) |
| Push web | sortant | — | — | non opérationnel (gestionnaire seul, sans abonnement ni envoi) |

Aucun canal ne doit être annoncé comme opérationnel avant un essai complet sur des numéros de test.

## 8. Décisions de gouvernance nécessaires

Ces points n'ont **pas** été tranchés silencieusement : le code applique un défaut prudent, signalé ci-dessous. Version à signer, avec l'étape que chaque décision bloque : [DECISIONS_PILOTE.md](DECISIONS_PILOTE.md) (ajouts : D15 état actuel du service, D16 mention « EXERCICE »).

| # | Décision | Défaut appliqué | Recommandation |
|---|---|---|---|
| D1 | Autorité habilitée à lever la revue médicale (épidémie) | PROTECTION_CIVILE (et administration) | désigner l'autorité sanitaire (district/région) avec un compte dédié |
| D2 | Qui crée, modifie, habilite, suspend quels comptes ; critère d'aptitude d'une sentinelle | tables de `user-policy.ts` ; habilitation manuelle après formation | valider les tables par écrit ; définir une validation terrain de l'aptitude |
| D3 | Pré-alerte et auto-escalade ROUGE sans confirmation | désactivées | les laisser désactivées au pilote ; si activées, permanence de nuit et mention « non confirmée » maintenue |
| D4 | Diffusion d'urgence (bypass) : qui, qui est informé, qui revoit | MAIRIE+, justification ≥ 20 caractères, revue a posteriori par PRÉFECTURE+ distincte | confirmer, et désigner la personne informée en temps réel |
| D5 | Traductions pulaar, wolof, soninké (messages, mentions de certitude, consentement) | nouveaux messages en français dans toutes les langues | relecture par des locuteurs avant le pilote |
| D6 | Position saisie à la main acceptée comme preuve ? | acceptée et marquée « saisie manuelle » | l'accepter seulement pour les signalements, exiger le GPS pour la vérification terrain |
| D7 | Base légale (CDP), consentement, durées de conservation (médias, positions, messages, journaux) | aucun consentement présumé ; aucune purge automatique | qualifier avec le responsable de traitement ; campagne de recueil du consentement via modèle approuvé |
| D8 | Modèles WhatsApp et statut du porteur (entité gouvernementale → Solution Provider) | modèles alert_level_2/3 × 4 langues, indicateur désactivé | arbitrer le texte (le modèle ORANGE ne porte pas de consigne), qualifier le montage avec Meta |
| D9 | Perte de données maximale et délai de reprise | sauvegarde toutes les 6 h proposée | RPO 6 h, RTO 4 h ; destination hors serveur et garde de la clé |
| D10 | Les comptes ADMIN/SUPER_ADMIN peuvent-ils valider et diffuser ? | oui (rang supérieur) | séparer administration technique et autorité opérationnelle |
| D11 | Retrait d'une fausse alerte et diffusion d'un rectificatif | **développé** : rectificatif et retrait (motif ≥ 20 caractères) aux mêmes destinataires, réservés à l'autorité de diffusion du niveau de l'alerte ; retrait interrompant un envoi en cours | confirmer l'autorité ; prévenir l'autorité supérieure du retrait d'une ROUGE |
| D12 | Permanence (nuit, week-end), suppléance, contact humain si un canal échoue | non modélisé | désigner une astreinte et la relier aux alertes Prometheus |
| D13 | Numéros d'urgence affichés | 18 et 17 seulement | confirmation officielle (BNSP, SAMU, Protection civile de Matam) |
| D14 | Structure exploitante, comptes fournisseurs, réponse aux demandes sur les données | — | à désigner par écrit |

## 9. Risques résiduels connus

- Jetons de session dans `localStorage` (exposition en cas de XSS) : atténué par l'absence de contenu HTML utilisateur et des durées courtes (accès 15 min) ; un passage à des cookies `HttpOnly` reste souhaitable.
- Avis de sécurité restants côté production (21 « high », 0 critique) : outils de build du plugin webpack de Sentry et postcss interne à Next (exécutés à la construction, pas sur des entrées utilisateur), `file-type` (non utilisé), `@nestjs/core` SSE (non utilisé). `prom-client` est marqué « remplacé par @prometheus-io/client » (renommage, sans avis).
- Limitation de débit en mémoire : valable en mono-instance seulement.
- Images du site vitrine (`logo.png`, `hero-banner.jpg`, `overview.jpg`) absentes du dépôt : un build depuis le dépôt les affiche cassées.
- Adresses `contact@olel.app` et `sentinelle@olel.app` non vérifiées.

## 10. Actions externes

1. Meta : vérification de l'entreprise, qualification du porteur, soumission des modèles (texte corrigé), abonnement aux statuts, numéros de test.
2. Africa's Talking : compte de production, identifiant d'expéditeur, URL de rappel avec `?key=`, code USSD.
3. Confirmation officielle des numéros d'urgence.
4. Relecture des traductions par des locuteurs natifs : [feuille de relecture](traductions/relecture-traductions.csv) (150 textes, dont 37 seulement en français) et [mode d'emploi](traductions/LISEZMOI.md).
5. Destination de sauvegarde hors serveur (rclone) et garde de la phrase de chiffrement.
6. Vérification du pare-feu du VPS (seuls 80/443 et SSH ouverts).
7. Démarches auprès de la CDP et désignation du responsable de traitement.
8. Accords écrits des partenaires et autorisations avant toute mention publique ; fourniture des images officielles du site.
9. Essais de terrain : téléphones modestes, lecteurs d'écran, personnes peu alphabétisées, sentinelles réelles en situation d'exercice.
10. Configuration d'Alertmanager (qui reçoit les alertes) et d'une astreinte.

## 11. Avis sur l'ouverture d'un pilote supervisé

**Le code est prêt pour un pilote supervisé restreint, mais le dispositif ne l'est pas encore.**

Côté logiciel, les défauts bloquants identifiés par l'audit sont corrigés et prouvés : les sept défauts d'accès reproductibles sur la version auditée sont refusés par la version corrigée ; la chaîne décision → intention → exécution est atomique, fidèle au texte approuvé et visible jusqu'au destinataire ; les confirmations disent ce qui s'est réellement passé ; une panne de Redis ne perd aucune décision ; un fournisseur absent produit un échec visible et jamais un faux envoi ; base et médias se sauvegardent et se restaurent de façon vérifiable ; les cinq images se construisent depuis le lockfile et tournent ensemble.

Ce qui empêche encore d'ouvrir le pilote à des citoyens :

1. **Canaux non éprouvés** : aucun message réel n'a été envoyé ; sans modèles Meta approuvés, WhatsApp ne peut joindre que les citoyens ayant écrit dans les 24 h ; le SMS dépend du compte de production. Un essai complet sur des numéros de test est indispensable.
2. **Consentement** : après migration, aucun citoyen existant n'a de consentement WhatsApp ; le recueil doit être organisé (D7, D8).
3. **Gouvernance** : D1, D2, D4, D10, D11, D12, D14 et D15 doivent être écrites et approuvées. Le circuit de rectificatif et de retrait est désormais développé (D11) ; reste à confirmer l'autorité qui le déclenche.
4. **Langues** : les messages en pulaar, wolof et soninké ne sont pas validés ; 37 textes n'existent qu'en français. La feuille de relecture est prête.
5. **Exploitation** : copie hors serveur des sauvegardes, astreinte reliée aux alertes, répétition des migrations sur une copie de la base réelle (script prêt, accès au serveur nécessaire).

**Recommandation** : procéder par étapes — (1) répétition du déploiement sur une copie des données ; (2) pilote interne avec opérateurs et sentinelles réels sur numéros de l'équipe, sans diffusion aux citoyens ; (3) exercice de bout en bout avec un groupe restreint de citoyens volontaires ayant donné leur accord, sur une commune, une fois les points 1 à 4 levés ; (4) élargissement progressif. Je ne recommande pas d'annoncer publiquement le service ni d'ouvrir l'inscription générale avant l'étape 3.

## 12. Préparation du pilote (15/10/2026)

| Élément | État | Preuve |
|---|---|---|
| Mode pilote — envoi | seuls les numéros de `PILOT_RECIPIENT_ALLOWLIST` reçoivent ; les autres sont tracés « hors liste autorisée » | pilot-ops |
| Mode pilote — consultation | application, USSD, bot, temps réel et radios réservés aux mêmes numéros ; « phase d'essai » affiché, jamais « aucune alerte » | pilot-consultation (8) |
| Mention « EXERCICE » | automatique en tête et en fin de chaque message diffusé en mode pilote, figée dans le texte envoyé | alert-messages.spec (3), pilot-ops |
| Radios partenaires | ne reçoivent plus le flux interne des alertes non diffusées (défaut trouvé en préparant le pilote) | pilot-consultation |
| Rectificatif et retrait (D11) | développés, tracés, visibles dans le tableau de bord ; un retrait interrompt un envoi en cours | pilot-ops |
| Suivi des remises | par envoi et par destinataire (numéros masqués), cloisonné par territoire | pilot-ops |
| État du système | `GET /system/info`, bandeau du tableau de bord, santé `diffusion`, métrique `olel_pilot_mode` | pilot-ops, supervision |
| Répétition sur copie | `scripts/rehearse-deploy.sh` : 17/17 sur production simulée | rapport `rehearsal-*.txt` |
| Traductions | feuille générée depuis le code (`pnpm i18n:review`) | `docs/traductions/` |
| Décisions et procédure | [DECISIONS_PILOTE.md](DECISIONS_PILOTE.md), [MISE_EN_SERVICE_PILOTE.md](MISE_EN_SERVICE_PILOTE.md) | — |

**Non fait, car hors de ma portée ou soumis à votre accord** : exécution de la répétition sur le serveur réel (aucun accès), déploiement, tout envoi réel, relecture des traductions, démarches Meta / Africa's Talking / CDP, signature des décisions.
