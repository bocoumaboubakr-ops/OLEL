# Templates Meta WhatsApp — Procédure d'enregistrement

## Pourquoi ?

L'API WhatsApp Cloud refuse l'envoi de texte libre **hors de la fenêtre de session 24 h** (24 h après le dernier message entrant du citoyen). Pour pousser un bulletin hebdomadaire, une alerte niveau 3, ou un rappel santé, il faut **pré-enregistrer le message** auprès de Meta sous forme de « template ». Meta valide ensuite chaque template manuellement sous **24-48 h**.

Sans ces 32 templates en place, **OLEL ne peut pas notifier proactivement les citoyens hors session**. C'est un bloquant pré-pilote.

## Catalogue OLEL — 8 modèles × 4 langues = 32 templates

| Clé | Catégorie Meta | Variables | Usage |
|---|---|---|---|
| `welcome_multi` | UTILITY | – | Premier contact citoyen |
| `signal_confirm` | UTILITY | type, lieu, ref | Confirmation de réception |
| `alert_level_3` | UTILITY | titre, zone, consignes | Push URGENCE niveau 3 |
| `alert_level_2` | UTILITY | titre, zone | Push VIGILANCE niveau 2 |
| `bulletin_weekly` | MARKETING | semaine, region | Récap hebdo lundi 9h00 |
| `vaccination_reminder` | UTILITY | date, lieu | Rappel santé |
| `feedback_security` | UTILITY | – | Demande post-alerte |
| `sentinelle_assigned` | UTILITY | nom, ref | Info sentinelle assignée |

Chaque modèle est décliné en 4 langues, suffixées dans le nom :
`welcome_multi_fr`, `welcome_multi_ff`, `welcome_multi_wo`, `welcome_multi_snk`, etc.

**Source de vérité du contenu** : `apps/bot/src/whatsapp/templates.ts`.

## Limitation langue Meta

L'API Meta ne supporte pas officiellement Pulaar (`ff`), Wolof (`wo`) ni Soninké (`snk`). On contourne ainsi :

- Tous les templates sont enregistrés avec **`language=fr`** côté Meta
- Le **corps du message** est rédigé dans la langue cible (pulaar, wolof, soninké)
- Meta valide sur le **contenu**, pas le code langue — en pratique ils refusent rarement si le corps est cohérent

Si Meta refuse pour « langue non conforme », solution de repli : enregistrer en `en_US` avec une mention `[FR/Pulaar]` en début de body.

## Procédure d'enregistrement (par template)

### 1. Aller dans Meta Business Manager

1. Connecte-toi à <https://business.facebook.com>
2. Sélectionne le compte business **OLEL Matam**
3. Menu de gauche → **WhatsApp Manager** → **Account tools** → **Message templates**
4. Bouton **« Create template »** en haut à droite

### 2. Remplir le formulaire — exemple `welcome_multi_fr`

| Champ Meta | Valeur |
|---|---|
| **Category** | `UTILITY` |
| **Name** | `welcome_multi_fr` (minuscules, snake_case, max 512 chars) |
| **Language** | `French` (`fr`) |
| **Header (optional)** | rien |
| **Body** | `Bienvenue sur OLEL, le service d'alerte précoce de la région de Matam. Répondez avec un message pour commencer.` |
| **Footer (optional)** | `OLEL · Matam, Sénégal` |
| **Buttons (optional)** | rien |

→ Bouton **« Submit »**. Statut passe à **« In review »**. Délai validation : **15 min à 48 h** selon la charge Meta.

### 3. Pour un template avec variables (ex. `signal_confirm_fr`)

| Champ Meta | Valeur |
|---|---|
| **Category** | `UTILITY` |
| **Name** | `signal_confirm_fr` |
| **Language** | `French` |
| **Body** | `Votre signalement de *{{1}}* à *{{2}}* a été reçu (réf. {{3}}). Une sentinelle locale va vérifier sur place. Merci pour votre vigilance.` |
| **Sample values** | `{{1}}` = `INONDATION`, `{{2}}` = `Soringho`, `{{3}}` = `OLEL-842` |
| **Footer** | `OLEL · Alerte précoce` |

Les **sample values** sont obligatoires sinon Meta refuse — ce sont les valeurs d'exemple qu'ils utilisent pour valider visuellement le rendu.

### 4. Pour un template avec boutons (ex. `alert_level_3_fr`)

| Champ Meta | Valeur |
|---|---|
| **Category** | `UTILITY` |
| **Name** | `alert_level_3_fr` |
| **Header** | `Text` → `🚨 URGENCE OLEL` |
| **Body** | `*{{1}}* dans votre zone : *{{2}}*.\n\n{{3}}\n\nProtection civile : +221 33 869 19 20` |
| **Sample values** | `{{1}}` = `Crue brutale`, `{{2}}` = `Kanel`, `{{3}}` = `Évacuez vers le point haut le plus proche. Restez avec votre famille.` |
| **Footer** | `OLEL · Alerte précoce` |
| **Buttons** | 3 × `Quick Reply` : `J'ai besoin d'aide`, `Je suis en sécurité`, `Voir détails` |

## Procédure rapide pour les 32 templates

L'enregistrement manuel des 32 entrées prend ~2 h. Optimisations :

1. **Crée les 8 modèles en français d'abord** (1 h). Vérifie qu'ils sont approuvés.
2. **Duplique chaque template français en 3 versions** (ff/wo/snk) via le bouton « Duplicate » de Meta, puis remplace uniquement le texte du body. Ça évite de redéfinir variables + boutons à chaque fois.
3. Le contenu exact à copier-coller est dans **`apps/bot/src/whatsapp/templates.ts`** — chaque template est documenté dans le code, copie le `text` de chaque `body`/`header`/`footer`.

## Statuts possibles côté Meta

| Statut | Action |
|---|---|
| `In review` | Attendre 15 min à 48 h |
| `Approved` | Template utilisable immédiatement via l'API |
| `Rejected` | Cliquer sur le template, voir la raison du refus (souvent : mention marketing dans une catégorie UTILITY, sample manquant, langue incohérente). Corriger et resoumettre. |
| `Paused` | Trop d'utilisateurs ont marqué comme spam — éditer pour préciser le consentement |
| `Disabled` | Template supprimé par Meta — recréer avec nouveau nom |

## Utilisation côté code

Une fois les templates approuvés côté Meta, le bot peut les envoyer :

```typescript
import { sendTemplate } from './templates';
import type { ConfigService } from '@nestjs/config';

// Confirmation d'un signalement après création
await sendTemplate(cfg, '+221770000000', 'signal_confirm', 'fr', [
  'INONDATION',   // {{1}} type
  'Soringho',     // {{2}} lieu
  'OLEL-842',     // {{3}} référence
]);

// Push d'urgence niveau 3
await sendTemplate(cfg, '+221770000000', 'alert_level_3', 'ff', [
  'Ilam mawnde',                                        // {{1}} titre en pulaar
  'Kanel',                                              // {{2}} zone
  'Yaltu nokku toownde. Heedu e ɓesngu maa.',          // {{3}} consignes
]);
```

## Checklist pré-pilote

- [ ] 8 templates français (`_fr`) créés et approuvés
- [ ] 8 templates pulaar (`_ff`) créés et approuvés
- [ ] 8 templates wolof (`_wo`) créés et approuvés
- [ ] 8 templates soninké (`_snk`) créés et approuvés
- [ ] **Traductions ff/wo/snk validées par des locuteurs natifs de Matam** (sans ça, mieux vaut ne PAS lancer en ces langues)
- [ ] Test d'envoi sur un numéro WhatsApp réel pour chaque catégorie

## En cas de refus systématique pour ff/wo/snk

Si Meta refuse les 24 templates langues locales pour « langue non conforme », plan B :

1. **Solution rapide** : enregistrer toutes les versions ff/wo/snk avec un préfixe `[Pulaar]` / `[Wolof]` / `[Soninké]` dans le body
2. **Solution moyenne** : utiliser `language=en_US` en code Meta avec le body en langue locale
3. **Solution dernier recours pilote** : n'utiliser que **le français pour les templates Meta**, et basculer en local lang uniquement DANS la fenêtre 24 h (où le texte libre est autorisé)

Le pilote peut démarrer avec uniquement les 8 templates `_fr` approuvés, en perdant la notification multilingue hors session. Les autres langues peuvent suivre en V1.1.
