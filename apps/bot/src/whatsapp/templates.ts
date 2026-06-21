/**
 * Templates Meta WhatsApp pour OLEL — 8 modèles × 4 langues = 32 entrées.
 *
 * Pourquoi ce fichier
 * ───────────────────
 * Hors fenêtre de session 24 h (après le dernier message entrant du citoyen),
 * l'API WhatsApp Cloud REFUSE tout envoi texte libre. Seuls les « message
 * templates » pré-approuvés par Meta sont acceptés. Sans ça, OLEL ne peut PAS
 * pousser de bulletin hebdomadaire ni d'alerte de niveau 3 à un citoyen qui
 * n'a pas écrit récemment.
 *
 * Limitation langue Meta
 * ──────────────────────
 * L'API Meta n'a pas de code langue dédié pour le Pulaar (ff), le Wolof (wo)
 * ni le Soninké (snk). On contourne en enregistrant chaque template avec
 * `language=fr` mais le corps du message dans la langue cible. Meta valide
 * sur la base du contenu, pas du code (en pratique, ils refusent rarement si
 * le corps est cohérent).
 *
 * Naming Meta Business Manager
 * ────────────────────────────
 * Chaque template est enregistré séparément avec un nom suffixé par la langue :
 *   welcome_multi_fr · welcome_multi_ff · welcome_multi_wo · welcome_multi_snk
 *   alert_level_3_fr · alert_level_3_ff · alert_level_3_wo · alert_level_3_snk
 *   …
 *
 * ⚠️ Traductions ff/wo/snk à RELIRE par locuteurs natifs avant pilote ⚠️
 * Les textes ci-dessous sont une base de travail cohérente avec les autres
 * fichiers i18n du projet, mais ils n'ont PAS été validés par des natifs.
 * Sur une plateforme d'alerte, une formulation maladroite peut coûter une vie.
 *
 * Voir docs/META_TEMPLATES.md pour la procédure de soumission Meta.
 */

import type { Lang } from './i18n';

export type TemplateCategory = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
export type ButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';

export interface TemplateButton {
  type: ButtonType;
  text: string;
  url?: string;
  phoneNumber?: string;
}

export interface TemplateComponents {
  /** En-tête : texte court ≤60 chars, ou image (header_handle requis côté Meta) */
  header?: { type: 'TEXT' | 'IMAGE'; text?: string };
  /** Corps : ≤1024 chars, variables au format {{1}}, {{2}}, etc. */
  body: { text: string };
  /** Pied : ≤60 chars, pas de variable */
  footer?: { text: string };
  /** Boutons : max 3 quick-reply, ou 2 CTA (URL + PHONE) */
  buttons?: TemplateButton[];
}

export interface MetaTemplate {
  /** Nom enregistré dans Meta Business Manager (lowercase, snake_case) */
  name: string;
  /** Catégorie Meta : UTILITY (notif, confirmations), MARKETING (bulletins, opt-in) */
  category: TemplateCategory;
  /** Code langue Meta. Pour ff/wo/snk on déclare fr car non supportés. */
  metaLanguage: 'fr';
  /** Variables ordonnées : human-readable, mappées sur {{1}}, {{2}}, etc. */
  variables: string[];
  /** Structure du message */
  components: TemplateComponents;
}

/** 8 clés de templates × 4 langues. Indexer par key puis lang. */
export type TemplateKey =
  | 'welcome_multi'
  | 'signal_confirm'
  | 'alert_level_3'
  | 'alert_level_2'
  | 'bulletin_weekly'
  | 'vaccination_reminder'
  | 'feedback_security'
  | 'sentinelle_assigned';

const PROTECTION_CIVILE = '+221 33 869 19 20';

/* ─────────────────────────────────────────────────────────────────────────────
 * 1. welcome_multi — Premier contact citoyen
 * ───────────────────────────────────────────────────────────────────────── */
const welcome_multi: Record<Lang, MetaTemplate> = {
  fr: {
    name: 'welcome_multi_fr', category: 'UTILITY', metaLanguage: 'fr', variables: [],
    components: {
      body: { text: 'Bienvenue sur OLEL, le service d\'alerte précoce de la région de Matam. Répondez avec un message pour commencer.' },
      footer: { text: 'OLEL · Matam, Sénégal' },
    },
  },
  ff: {
    name: 'welcome_multi_ff', category: 'UTILITY', metaLanguage: 'fr', variables: [],
    components: {
      body: { text: 'Bienvenue e OLEL, golle reentaare bone diiwaan Matam. Jaabo e binndol ngam fuɗɗaade.' },
      footer: { text: 'OLEL · Matam, Senegal' },
    },
  },
  wo: {
    name: 'welcome_multi_wo', category: 'UTILITY', metaLanguage: 'fr', variables: [],
    components: {
      body: { text: 'Dalal jàmm ci OLEL, sistemu artu mu jëkk ci diiwaanu Matam. Tontu ak benn bataaxal ngir tàmbali.' },
      footer: { text: 'OLEL · Matam, Senegaal' },
    },
  },
  snk: {
    name: 'welcome_multi_snk', category: 'UTILITY', metaLanguage: 'fr', variables: [],
    components: {
      body: { text: 'An salaama OLEL na, xibaare tana golle Matam jamaane. Jaabi binndol ke a tuga.' },
      footer: { text: 'OLEL · Matam, Senegal' },
    },
  },
};

/* ─────────────────────────────────────────────────────────────────────────────
 * 2. signal_confirm — Confirmation de réception d'un signalement
 * Variables : {{1}} = type, {{2}} = lieu, {{3}} = référence
 * ───────────────────────────────────────────────────────────────────────── */
const signal_confirm: Record<Lang, MetaTemplate> = {
  fr: {
    name: 'signal_confirm_fr', category: 'UTILITY', metaLanguage: 'fr',
    variables: ['type', 'lieu', 'reference'],
    components: {
      body: { text: 'Votre signalement de *{{1}}* à *{{2}}* a été reçu (réf. {{3}}). Une sentinelle locale va vérifier sur place. Merci pour votre vigilance.' },
      footer: { text: 'OLEL · Alerte précoce' },
    },
  },
  ff: {
    name: 'signal_confirm_ff', category: 'UTILITY', metaLanguage: 'fr',
    variables: ['type', 'nokku', 'reference'],
    components: {
      body: { text: 'Bone maa *{{1}}* e *{{2}}* heɓaama (refer. {{3}}). Sentinelle ɓallinte ƴeewat. A jaaraama.' },
      footer: { text: 'OLEL · Reentaare' },
    },
  },
  wo: {
    name: 'signal_confirm_wo', category: 'UTILITY', metaLanguage: 'fr',
    variables: ['xeet', 'bérab', 'reference'],
    components: {
      body: { text: 'Sa yégle *{{1}}* ci *{{2}}* jot na (réf. {{3}}). Ab sentinelle dina seet ci bérab bi. Jërëjëf.' },
      footer: { text: 'OLEL · Artu' },
    },
  },
  snk: {
    name: 'signal_confirm_snk', category: 'UTILITY', metaLanguage: 'fr',
    variables: ['sifa', 'jamaane', 'reference'],
    components: {
      body: { text: 'An xibaare *{{1}}* na *{{2}}* di safani (refer. {{3}}). Sentinelle ke a yibo. I ni jaara.' },
      footer: { text: 'OLEL · Xibaare' },
    },
  },
};

/* ─────────────────────────────────────────────────────────────────────────────
 * 3. alert_level_3 — Push URGENCE (niveau 3 ROUGE)
 * Variables : {{1}} = titre, {{2}} = zone, {{3}} = consignes (≤120 chars)
 * 3 quick-replies : « J'ai besoin d'aide » / « Je suis en sécurité » / « Voir détails »
 * ───────────────────────────────────────────────────────────────────────── */
const alert_level_3: Record<Lang, MetaTemplate> = {
  fr: {
    name: 'alert_level_3_fr', category: 'UTILITY', metaLanguage: 'fr',
    variables: ['titre', 'zone', 'consignes'],
    components: {
      header: { type: 'TEXT', text: '🚨 URGENCE OLEL' },
      body: { text: '*{{1}}* dans votre zone : *{{2}}*.\n\n{{3}}\n\nProtection civile : ' + PROTECTION_CIVILE },
      footer: { text: 'OLEL · Alerte précoce' },
      buttons: [
        { type: 'QUICK_REPLY', text: 'J\'ai besoin d\'aide' },
        { type: 'QUICK_REPLY', text: 'Je suis en sécurité' },
        { type: 'QUICK_REPLY', text: 'Voir détails' },
      ],
    },
  },
  ff: {
    name: 'alert_level_3_ff', category: 'UTILITY', metaLanguage: 'fr',
    variables: ['titre', 'nokku', 'jamirooje'],
    components: {
      header: { type: 'TEXT', text: '🚨 HEÑORDE OLEL' },
      body: { text: '*{{1}}* e nokku maa : *{{2}}*.\n\n{{3}}\n\nKisal yimɓe : ' + PROTECTION_CIVILE },
      footer: { text: 'OLEL · Reentaare' },
      buttons: [
        { type: 'QUICK_REPLY', text: 'Mi heɓii balla' },
        { type: 'QUICK_REPLY', text: 'Mi woni e kisal' },
        { type: 'QUICK_REPLY', text: 'Ƴeew faayiida' },
      ],
    },
  },
  wo: {
    name: 'alert_level_3_wo', category: 'UTILITY', metaLanguage: 'fr',
    variables: ['titer', 'gox', 'naal'],
    components: {
      header: { type: 'TEXT', text: '🚨 MUSIBA OLEL' },
      body: { text: '*{{1}}* ci sa gox : *{{2}}*.\n\n{{3}}\n\nKaaraange askan : ' + PROTECTION_CIVILE },
      footer: { text: 'OLEL · Artu' },
      buttons: [
        { type: 'QUICK_REPLY', text: 'Soxla naa ndimbal' },
        { type: 'QUICK_REPLY', text: 'Maa ngi ci kaaraange' },
        { type: 'QUICK_REPLY', text: 'Seet leeral' },
      ],
    },
  },
  snk: {
    name: 'alert_level_3_snk', category: 'UTILITY', metaLanguage: 'fr',
    variables: ['titre', 'jamaane', 'jamirooje'],
    components: {
      header: { type: 'TEXT', text: '🚨 TANPINTE OLEL' },
      body: { text: '*{{1}}* na *{{2}}* di.\n\n{{3}}\n\nSere kisi : ' + PROTECTION_CIVILE },
      footer: { text: 'OLEL · Xibaare' },
      buttons: [
        { type: 'QUICK_REPLY', text: 'N labenoxo balla' },
        { type: 'QUICK_REPLY', text: 'N kisi na' },
        { type: 'QUICK_REPLY', text: 'Yibo doroni' },
      ],
    },
  },
};

/* ─────────────────────────────────────────────────────────────────────────────
 * 4. alert_level_2 — Push VIGILANCE (niveau 2 ORANGE/JAUNE)
 * Variables : {{1}} = titre, {{2}} = zone
 * ───────────────────────────────────────────────────────────────────────── */
const alert_level_2: Record<Lang, MetaTemplate> = {
  fr: {
    name: 'alert_level_2_fr', category: 'UTILITY', metaLanguage: 'fr',
    variables: ['titre', 'zone'],
    components: {
      header: { type: 'TEXT', text: '⚠️ VIGILANCE OLEL' },
      body: { text: 'Vigilance *{{1}}* dans votre zone : *{{2}}*. Restez attentif et suivez les consignes locales.' },
      footer: { text: 'OLEL · Alerte précoce' },
      buttons: [
        { type: 'QUICK_REPLY', text: 'Voir détails' },
        { type: 'QUICK_REPLY', text: 'Aucun risque ici' },
      ],
    },
  },
  ff: {
    name: 'alert_level_2_ff', category: 'UTILITY', metaLanguage: 'fr',
    variables: ['titre', 'nokku'],
    components: {
      header: { type: 'TEXT', text: '⚠️ REENTAARE OLEL' },
      body: { text: 'Reentaare *{{1}}* e nokku maa : *{{2}}*. Heedu, jokku jamirooje nokku.' },
      footer: { text: 'OLEL · Reentaare' },
      buttons: [
        { type: 'QUICK_REPLY', text: 'Ƴeew faayiida' },
        { type: 'QUICK_REPLY', text: 'Alaa bone ɗoo' },
      ],
    },
  },
  wo: {
    name: 'alert_level_2_wo', category: 'UTILITY', metaLanguage: 'fr',
    variables: ['titer', 'gox'],
    components: {
      header: { type: 'TEXT', text: '⚠️ MOYTABAL OLEL' },
      body: { text: 'Moytabal *{{1}}* ci sa gox : *{{2}}*. Topp jamiroo yi gox bi.' },
      footer: { text: 'OLEL · Artu' },
      buttons: [
        { type: 'QUICK_REPLY', text: 'Seet leeral' },
        { type: 'QUICK_REPLY', text: 'Amul musiba fi' },
      ],
    },
  },
  snk: {
    name: 'alert_level_2_snk', category: 'UTILITY', metaLanguage: 'fr',
    variables: ['titre', 'jamaane'],
    components: {
      header: { type: 'TEXT', text: '⚠️ KORINTE OLEL' },
      body: { text: 'Korinte *{{1}}* na *{{2}}* di. Yittan, an jamirooje raxen.' },
      footer: { text: 'OLEL · Xibaare' },
      buttons: [
        { type: 'QUICK_REPLY', text: 'Yibo doroni' },
        { type: 'QUICK_REPLY', text: 'Tana nta fi' },
      ],
    },
  },
};

/* ─────────────────────────────────────────────────────────────────────────────
 * 5. bulletin_weekly — Récap hebdomadaire (lundi 09:00)
 * Variables : {{1}} = semaine (ex. "S25"), {{2}} = région
 * ───────────────────────────────────────────────────────────────────────── */
const bulletin_weekly: Record<Lang, MetaTemplate> = {
  fr: {
    name: 'bulletin_weekly_fr', category: 'MARKETING', metaLanguage: 'fr',
    variables: ['semaine', 'region'],
    components: {
      header: { type: 'TEXT', text: 'Bulletin OLEL · {{1}}' },
      body: { text: 'Bonjour, voici le bulletin de la semaine pour *{{2}}* : météo, santé, services. Une note vocale détaillée suit.' },
      footer: { text: 'OLEL · Alerte précoce' },
      buttons: [
        { type: 'QUICK_REPLY', text: 'Plus de détails' },
        { type: 'QUICK_REPLY', text: 'Me désabonner' },
      ],
    },
  },
  ff: {
    name: 'bulletin_weekly_ff', category: 'MARKETING', metaLanguage: 'fr',
    variables: ['yontere', 'diiwaan'],
    components: {
      header: { type: 'TEXT', text: 'Konngol OLEL · {{1}}' },
      body: { text: 'Mballeen, ɗum ko konngol yontere e *{{2}}* : weeyo, cellal, golle. Konngol sawtuyaŋkol jokkan.' },
      footer: { text: 'OLEL · Reentaare' },
      buttons: [
        { type: 'QUICK_REPLY', text: 'Faayiida goɗɗo' },
        { type: 'QUICK_REPLY', text: 'Yaltu lim' },
      ],
    },
  },
  wo: {
    name: 'bulletin_weekly_wo', category: 'MARKETING', metaLanguage: 'fr',
    variables: ['ayubés', 'diiwaan'],
    components: {
      header: { type: 'TEXT', text: 'Bataaxalu OLEL · {{1}}' },
      body: { text: 'Asalaa maalekum, bataaxalu ayubés ngir *{{2}}* : asaman, wér-gi-yaram, ndimbal. Baat dina toftu.' },
      footer: { text: 'OLEL · Artu' },
      buttons: [
        { type: 'QUICK_REPLY', text: 'Leeral gën' },
        { type: 'QUICK_REPLY', text: 'Génn ci tëj' },
      ],
    },
  },
  snk: {
    name: 'bulletin_weekly_snk', category: 'MARKETING', metaLanguage: 'fr',
    variables: ['kafane', 'jamaane'],
    components: {
      header: { type: 'TEXT', text: 'Xibaare OLEL · {{1}}' },
      body: { text: 'An salaama, xibaare kafane *{{2}}* na : jamaane tana, tannan, golle. Audio jokki.' },
      footer: { text: 'OLEL · Xibaare' },
      buttons: [
        { type: 'QUICK_REPLY', text: 'Doroni doroni' },
        { type: 'QUICK_REPLY', text: 'N yanqa' },
      ],
    },
  },
};

/* ─────────────────────────────────────────────────────────────────────────────
 * 6. vaccination_reminder — Rappel campagne santé (variables: date, lieu)
 * ───────────────────────────────────────────────────────────────────────── */
const vaccination_reminder: Record<Lang, MetaTemplate> = {
  fr: {
    name: 'vaccination_reminder_fr', category: 'UTILITY', metaLanguage: 'fr',
    variables: ['date', 'lieu'],
    components: {
      header: { type: 'TEXT', text: 'Santé communautaire' },
      body: { text: 'Rappel : campagne de vaccination le *{{1}}* à *{{2}}*. Apportez le carnet de santé. Présence gratuite.' },
      footer: { text: 'OLEL · Avec votre poste de santé' },
    },
  },
  ff: {
    name: 'vaccination_reminder_ff', category: 'UTILITY', metaLanguage: 'fr',
    variables: ['nyalnde', 'nokku'],
    components: {
      header: { type: 'TEXT', text: 'Cellal jamaa' },
      body: { text: 'Anndinngo : vaksinasiyoŋ e *{{1}}* e *{{2}}*. Addu deftere cellal. Mi araani.' },
      footer: { text: 'OLEL · E poosto cellal mon' },
    },
  },
  wo: {
    name: 'vaccination_reminder_wo', category: 'UTILITY', metaLanguage: 'fr',
    variables: ['bés', 'bérab'],
    components: {
      header: { type: 'TEXT', text: 'Wér-gi-yaram askan' },
      body: { text: 'Fàttali : campagne vaksin ci *{{1}}* ci *{{2}}*. Indil sa kayitu wér. Du fey dara.' },
      footer: { text: 'OLEL · Ak sa poste de santé' },
    },
  },
  snk: {
    name: 'vaccination_reminder_snk', category: 'UTILITY', metaLanguage: 'fr',
    variables: ['kuna', 'jamaane'],
    components: {
      header: { type: 'TEXT', text: 'Tannan jamaa' },
      body: { text: 'Anniyaani : vaksen kafane *{{1}}* na *{{2}}* di. Adda tannan kitabe. Nta safa.' },
      footer: { text: 'OLEL · An post tannan na' },
    },
  },
};

/* ─────────────────────────────────────────────────────────────────────────────
 * 7. feedback_security — Demande de feedback post-alerte
 * ───────────────────────────────────────────────────────────────────────── */
const feedback_security: Record<Lang, MetaTemplate> = {
  fr: {
    name: 'feedback_security_fr', category: 'UTILITY', metaLanguage: 'fr', variables: [],
    components: {
      body: { text: 'Suite à l\'alerte récente dans votre zone, êtes-vous en sécurité ? Votre réponse aide les sentinelles à organiser les secours.' },
      footer: { text: 'OLEL · Alerte précoce' },
      buttons: [
        { type: 'QUICK_REPLY', text: 'Oui, en sécurité' },
        { type: 'QUICK_REPLY', text: 'J\'ai besoin d\'aide' },
        { type: 'QUICK_REPLY', text: 'Je veux signaler' },
      ],
    },
  },
  ff: {
    name: 'feedback_security_ff', category: 'UTILITY', metaLanguage: 'fr', variables: [],
    components: {
      body: { text: 'Caggal reentaare seeɗa e nokku maa, hara aɗa woni e kisal ? Jaabaago maa wallat sentinelles topgol balle.' },
      footer: { text: 'OLEL · Reentaare' },
      buttons: [
        { type: 'QUICK_REPLY', text: 'Eyyo, mi woni kisal' },
        { type: 'QUICK_REPLY', text: 'Mi heɓii balla' },
        { type: 'QUICK_REPLY', text: 'Miɗo yiɗi hollude' },
      ],
    },
  },
  wo: {
    name: 'feedback_security_wo', category: 'UTILITY', metaLanguage: 'fr', variables: [],
    components: {
      body: { text: 'Ginnaaw artu bi xew ci sa gox, ndax nga ngi ci kaaraange ? Sa tontu dina dimbali sentinelles yi.' },
      footer: { text: 'OLEL · Artu' },
      buttons: [
        { type: 'QUICK_REPLY', text: 'Waaw, ci kaaraange' },
        { type: 'QUICK_REPLY', text: 'Soxla naa ndimbal' },
        { type: 'QUICK_REPLY', text: 'Bëgg naa yégle' },
      ],
    },
  },
  snk: {
    name: 'feedback_security_snk', category: 'UTILITY', metaLanguage: 'fr', variables: [],
    components: {
      body: { text: 'Xibaare ke yibo an jamaane di kaayan, an kisi na ? Jaabi balla sentinelles ke labenoxo.' },
      footer: { text: 'OLEL · Xibaare' },
      buttons: [
        { type: 'QUICK_REPLY', text: 'Eyyo, n kisi' },
        { type: 'QUICK_REPLY', text: 'N labenoxo balla' },
        { type: 'QUICK_REPLY', text: 'N yibo doroni' },
      ],
    },
  },
};

/* ─────────────────────────────────────────────────────────────────────────────
 * 8. sentinelle_assigned — Info citoyen qu'une sentinelle est assignée
 * Variables : {{1}} = nom sentinelle, {{2}} = référence signalement
 * ───────────────────────────────────────────────────────────────────────── */
const sentinelle_assigned: Record<Lang, MetaTemplate> = {
  fr: {
    name: 'sentinelle_assigned_fr', category: 'UTILITY', metaLanguage: 'fr',
    variables: ['sentinelle_nom', 'reference'],
    components: {
      body: { text: 'La sentinelle *{{1}}* a été désignée pour vérifier votre signalement (réf. {{2}}). Elle vous contactera si besoin.' },
      footer: { text: 'OLEL · Alerte précoce' },
    },
  },
  ff: {
    name: 'sentinelle_assigned_ff', category: 'UTILITY', metaLanguage: 'fr',
    variables: ['sentinelle_inde', 'reference'],
    components: {
      body: { text: 'Sentinelle *{{1}}* suɓaama ngam ƴeewde bone maa (refer. {{2}}). O hollat ma so haaju woodi.' },
      footer: { text: 'OLEL · Reentaare' },
    },
  },
  wo: {
    name: 'sentinelle_assigned_wo', category: 'UTILITY', metaLanguage: 'fr',
    variables: ['sentinelle_tur', 'reference'],
    components: {
      body: { text: 'Sentinelle *{{1}}* tànnees na ngir seet sa yégle (réf. {{2}}). Dina la jokk soo soxlaa.' },
      footer: { text: 'OLEL · Artu' },
    },
  },
  snk: {
    name: 'sentinelle_assigned_snk', category: 'UTILITY', metaLanguage: 'fr',
    variables: ['sentinelle_tooxo', 'reference'],
    components: {
      body: { text: 'Sentinelle *{{1}}* tànnu an xibaare yibo na (refer. {{2}}). A xibara so a tana di.' },
      footer: { text: 'OLEL · Xibaare' },
    },
  },
};

/* ─────────────────────────────────────────────────────────────────────────────
 * Index principal
 * ───────────────────────────────────────────────────────────────────────── */
export const TEMPLATES: Record<TemplateKey, Record<Lang, MetaTemplate>> = {
  welcome_multi,
  signal_confirm,
  alert_level_3,
  alert_level_2,
  bulletin_weekly,
  vaccination_reminder,
  feedback_security,
  sentinelle_assigned,
};

/** Renvoie le template enregistré côté Meta pour une clé + langue donnée. */
export function getTemplate(key: TemplateKey, lang: Lang): MetaTemplate {
  return TEMPLATES[key][lang] || TEMPLATES[key].fr;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * sendTemplate — POST vers Meta Cloud API
 * ───────────────────────────────────────────────────────────────────────── */

import axios from 'axios';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

const logger = new Logger('MetaTemplates');

/**
 * Envoie un template WhatsApp pré-approuvé à un destinataire E.164.
 *
 * `variables` : valeurs ordonnées à substituer dans le template ; doit avoir
 * autant d'entrées que le template en déclare. Exemple pour signal_confirm :
 *
 *   await sendTemplate(cfg, '+221770000000', 'signal_confirm', 'fr', [
 *     'INONDATION', 'Soringho', 'OLEL-842',
 *   ]);
 */
export async function sendTemplate(
  cfg: ConfigService,
  to: string,
  key: TemplateKey,
  lang: Lang,
  variables: string[] = [],
): Promise<boolean> {
  const token = cfg.get<string>('WHATSAPP_TOKEN', '');
  const phoneId = cfg.get<string>('WHATSAPP_PHONE_ID', '');
  const tpl = getTemplate(key, lang);

  // Mode simulation si pas de token réel (dev local)
  if (!token || token.startsWith('EAAx')) {
    logger.log(`[SIMUL TEMPLATE → ${to}] ${tpl.name} vars=${JSON.stringify(variables)}`);
    return true;
  }

  if (variables.length !== tpl.variables.length) {
    logger.error(`Template ${tpl.name} : attendu ${tpl.variables.length} vars (${tpl.variables.join(', ')}), reçu ${variables.length}`);
    return false;
  }

  // Composer le payload Meta Cloud API v19
  const components: any[] = [];

  // HEADER avec variables (uniquement TEXT avec {{1}} possibles)
  if (tpl.components.header?.type === 'TEXT' && tpl.components.header.text?.includes('{{')) {
    const headerVars = extractVarIndexes(tpl.components.header.text);
    components.push({
      type: 'header',
      parameters: headerVars.map((i) => ({ type: 'text', text: variables[i - 1] || '' })),
    });
  }

  // BODY avec variables
  if (tpl.variables.length > 0) {
    components.push({
      type: 'body',
      parameters: variables.map((v) => ({ type: 'text', text: v })),
    });
  }

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: tpl.name,
      language: { code: tpl.metaLanguage },
      ...(components.length ? { components } : {}),
    },
  };

  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${phoneId}/messages`,
      payload,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
    );
    return true;
  } catch (err: any) {
    const meta = err?.response?.data?.error;
    logger.error(
      `Envoi template ${tpl.name} → ${to} échoué (HTTP ${err?.response?.status ?? '?'}) : ` +
      (meta ? `[${meta.code}] ${meta.message}` : err?.message ?? 'erreur inconnue'),
    );
    return false;
  }
}

/** Extrait les index des variables `{{N}}` présents dans une chaîne. */
function extractVarIndexes(s: string): number[] {
  const matches = s.matchAll(/\{\{(\d+)\}\}/g);
  return Array.from(matches, (m) => Number(m[1])).sort((a, b) => a - b);
}
