# Relecture des traductions (décision D5)

Le fichier [`relecture-traductions.csv`](relecture-traductions.csv) réunit **tous les textes qu'OLEL envoie ou affiche aux citoyens et aux sentinelles** : messages d'alerte diffusés, bot WhatsApp, thématiques de signalement, modèles WhatsApp soumis à Meta, application mobile, et les canaux qui n'existent qu'en français (USSD, service vocal).

Aucune traduction en pulaar, wolof ou soninké n'a encore été validée par un locuteur natif.

## Ouvrir le fichier

LibreOffice Calc ou Excel : encodage UTF-8, séparateur point-virgule. Les caractères propres aux langues (ɓ, ɗ, ŋ, ƴ, ñ, à, ó…) doivent s'afficher correctement ; sinon, réimporter en choisissant UTF-8.

## Colonnes

| Colonne | Contenu |
|---|---|
| Domaine, Clé | où le texte apparaît (ne pas modifier) |
| Français (référence) | texte de référence |
| Pulaar / Wolof / Soninké (actuel) | traduction actuelle, **non validée** ; vide ou identique au français = pas encore traduit |
| Pulaar / Wolof / Soninké (validé) | **à remplir** par le relecteur : texte corrigé, ou recopie du texte actuel s'il est juste |
| Statut | « traduit — à valider » ou « repli français (langues) » |
| Note | contrainte à respecter |
| Commentaire du relecteur | libre |

## Règles à respecter

- `{1}`, `{2}`, `{…}` sont remplacés automatiquement (nom, nombre, référence…) : les garder tels quels, à la place qui convient dans la phrase.
- `*mot*` s'affiche en gras dans WhatsApp ; les émojis et les numéros de menu (1️⃣, 2️⃣…) sont à conserver.
- Les mots-commandes que le citoyen doit écrire (*STOP*, *ALERTES*, *menu*, *commune*) restent tels quels, sauf décision contraire : le bot ne reconnaît aujourd'hui que ces mots (et quelques variantes françaises). Proposer en commentaire un équivalent dans la langue si c'est utile : il pourra être ajouté.
- Les **mentions de certitude** (« NON CONFIRMÉE PAR L'AUTORITÉ », « RECTIFICATIF », « ALERTE ANNULÉE », « EXERCICE ») doivent rester sans ambiguïté : un citoyen doit comprendre immédiatement si l'alerte est confirmée, corrigée, annulée ou un exercice.
- **Modèles WhatsApp** : toute modification exige une nouvelle approbation par Meta (plusieurs jours). Les valider en dernier, une fois les autres textes stabilisés.
- USSD : 180 caractères par écran au plus, sans accents (limite des téléphones simples).

## Retour

Renvoyer le fichier complété. J'intègre les colonnes « validé » dans le code, je régénère la feuille pour contrôle (`pnpm i18n:review`) et je relance l'ensemble des tests.
