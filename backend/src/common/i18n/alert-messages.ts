/**
 * Messages d'alerte multilingues pour les notifications (WhatsApp/SMS).
 *
 * ⚠️ À FAIRE RELIRE PAR DES LOCUTEURS NATIFS DE MATAM AVANT LE PILOTE.
 * Les traductions Pulaar (ff), Wolof (wo) et Soninké (snk) ci-dessous sont
 * une base de travail produite sans validation native. Sur une plateforme
 * d'alerte, une formulation imprécise peut induire en erreur — la relecture
 * par des locuteurs de Wuro-Mamadou est OBLIGATOIRE.
 *
 * Codes langue : fr (Français, défaut), ff (Pulaar/Fulfulde), wo (Wolof), snk (Soninké).
 */

export type Lang = 'fr' | 'ff' | 'wo' | 'snk';
export const SUPPORTED_LANGS: Lang[] = ['fr', 'ff', 'wo', 'snk'];
export const LANG_LABEL: Record<Lang, string> = {
  fr: 'Français',
  ff: 'Pulaar',
  wo: 'Wolof',
  snk: 'Soninké',
};

export function normalizeLang(value?: string | null): Lang {
  const v = (value || '').toLowerCase();
  return (SUPPORTED_LANGS as string[]).includes(v) ? (v as Lang) : 'fr';
}

/** Préfixe officiel selon le niveau d'alerte, par langue. */
const LEVEL_PREFIX: Record<string, Record<Lang, string>> = {
  BLEU:        { fr: 'INFORMATION',   ff: 'KABARU',       wo: 'XIBAAR',        snk: 'XIBAARE' },
  JAUNE:       { fr: 'VIGILANCE',     ff: 'REENTAARE',    wo: 'MOYTABAL',      snk: 'KORINTE' },
  ORANGE:      { fr: 'PRE-ALERTE',    ff: 'REENTAARE MAWNDE', wo: 'ARTU',      snk: 'XIBAARE BELLE' },
  ROUGE:       { fr: 'URGENCE',       ff: 'HEÑORDE',      wo: 'JAMONO BU TANG', snk: 'TANPINTE' },
  ROUGE_FONCE: { fr: 'CRISE MAJEURE', ff: 'MUSIIBA MAWDO', wo: 'MUSIBA BU MAG', snk: 'MUSIIBA BELLE' },
};

/** Consigne « suivez les autorités », par langue. */
const FOLLOW_INSTRUCTIONS: Record<Lang, string> = {
  fr: 'Suivez les consignes des autorités locales.',
  ff: 'Ɗoftee yamirooje laamu nokku on.',
  wo: 'Toppleen ndigalu njiitu gox bi.',
  snk: 'Ti kanmu yittan saxuruyen wujje.',
};

const ZONE_WORD: Record<Lang, string> = { fr: 'Zone', ff: 'Nokku', wo: 'Goxu bi', snk: 'Jamaane' };
const NEW_REPORT: Record<Lang, string> = {
  fr: 'Nouveau signalement à vérifier',
  ff: 'Heɗo signaalemaa keso fa yiɗ ƴeewa',
  wo: 'Yégle bu bees bu ñu war a seet',
  snk: 'Xibaare kura ke a ñan manginɲe',
};
const CONNECT: Record<Lang, string> = {
  fr: 'Connectez-vous sur la plateforme OLEL.',
  ff: 'Naatu e OLEL.',
  wo: 'Duggal ci OLEL.',
  snk: 'Naxa OLEL di.',
};

export function levelPrefix(level: string, lang: Lang): string {
  return (LEVEL_PREFIX[level] && LEVEL_PREFIX[level][lang]) || LEVEL_PREFIX.BLEU[lang];
}

/** Message de diffusion officielle (broadcast → habitants). */
export function broadcastMessage(
  level: string, title: string, description: string, zoneName: string, lang: Lang,
): string {
  return `[OLEL] ${levelPrefix(level, lang)}\n${title}\n${description}\n${ZONE_WORD[lang]} : ${zoneName}\n${FOLLOW_INSTRUCTIONS[lang]}`;
}

/** Message interne (signalement → opérateurs). Toujours en français (agents). */
export function operatorMessage(type: string, title: string, zoneName: string): string {
  return `[OLEL] ${NEW_REPORT.fr}\nType : ${type}\n${title}\n${ZONE_WORD.fr} : ${zoneName}\n${CONNECT.fr}`;
}

// ── Diffusion figée (audit F04) ─────────────────────────────────────────────
// Le texte EXACT envoyé à chaque langue est calculé une fois, au moment de la
// décision, puis stocké dans Broadcast.payload. Le processeur l'envoie tel
// quel : aucune reconstruction ultérieure depuis le titre ou la description.

export type Certainty = 'CONFIRMED' | 'UNCONFIRMED_AUTO' | 'EMERGENCY_BYPASS' | 'PREALERT' | 'INTERNAL';

/**
 * Mention du niveau de certitude, en tête de message.
 * ⚠️ ff / wo / snk : base de travail À FAIRE RELIRE par des locuteurs natifs
 * (même réserve que le reste de ce fichier — décision D5).
 */
const CERTAINTY_TAG: Record<Certainty, Record<Lang, string>> = {
  CONFIRMED: { fr: '', ff: '', wo: '', snk: '' },
  INTERNAL: { fr: '', ff: '', wo: '', snk: '' },
  UNCONFIRMED_AUTO: {
    fr: 'NON CONFIRMÉE PAR L\'AUTORITÉ',
    ff: 'LAAMU TEEŊTINAAKI',
    wo: 'NJIITU YI WÓORALUÑU KO',
    snk: 'SAXURUYEN NA A WÓORAL',
  },
  EMERGENCY_BYPASS: {
    fr: 'DIFFUSION D\'URGENCE — VÉRIFICATION EN COURS',
    ff: 'NELDUGOL HEÑORDE — ƳEEWGOL NO WAƊA',
    wo: 'YÓNNEE CI JAMONO BU TÀNG — SEET GI NGI CI KAW',
    snk: 'TANPINTE NELLI — MANGINƝE TI A DI',
  },
  PREALERT: {
    fr: 'PRÉ-ALERTE — INFORMATION NON CONFIRMÉE',
    ff: 'REENTAARE ADANNDE — KABARU TEEŊTINAAKI',
    wo: 'ARTU BU JIITU — XIBAAR BU ÑU WÓORALUL',
    snk: 'XIBAARE FOLLE — A NA WÓORAL',
  },
};

export interface FrozenPayloadInput {
  level: string;
  certainty: Certainty;
  /** Texte approuvé par l'autorité (s'il est fourni, il est envoyé tel quel, sans traduction automatique). */
  approvedText?: string;
  title: string;
  description: string;
  zoneNames: string[];
  type?: string;
}

/** Calcule le texte exact par langue, à figer dans Broadcast.payload. */
export function buildFrozenPayload(i: FrozenPayloadInput): Record<Lang, string> {
  const out = {} as Record<Lang, string>;
  for (const lang of SUPPORTED_LANGS) {
    if (i.certainty === 'INTERNAL') {
      out[lang] = operatorMessage(i.type || '', i.title, i.zoneNames.join(', '));
      continue;
    }
    const tag = CERTAINTY_TAG[i.certainty][lang];
    const header = `[OLEL] ${levelPrefix(i.level, lang)}${tag ? ` — ${tag}` : ''}`;
    const body = i.approvedText?.trim() || `${i.title}\n${i.description}`;
    out[lang] = `${header}\n${body}\n${ZONE_WORD[lang]} : ${i.zoneNames.join(', ')}\n${FOLLOW_INSTRUCTIONS[lang]}`;
  }
  return out;
}

/** Paramètres d'un modèle WhatsApp approuvé (hors fenêtre de 24 h). */
export interface TemplateCall { name: string; language: string; params: string[] }

/** Meta : pas de saut de ligne ni de longues suites d'espaces dans un paramètre, 1024 caractères au plus. */
const templateParam = (s: string) => s.replace(/\s*\n+\s*/g, ' — ').replace(/\s{4,}/g, '   ').slice(0, 1000);

/**
 * Appel de modèle figé avec le texte approuvé (audit F24) : catalogue
 * apps/bot/src/whatsapp/templates.ts. ROUGE+ : alert_level_3 (titre, zone,
 * consigne) ; autres niveaux : alert_level_2 (titre, zone). La mention de
 * certitude est portée dans le titre. Les modèles doivent être APPROUVÉS par
 * Meta avant activation de l'indicateur « whatsapp_templates ».
 */
export function buildTemplateCalls(i: FrozenPayloadInput): Record<Lang, TemplateCall> | null {
  if (i.certainty === 'INTERNAL') return null;
  const severe = i.level === 'ROUGE' || i.level === 'ROUGE_FONCE';
  const out = {} as Record<Lang, TemplateCall>;
  for (const lang of SUPPORTED_LANGS) {
    const tag = CERTAINTY_TAG[i.certainty][lang];
    const title = templateParam(tag ? `${tag} — ${i.title}` : i.title);
    const zones = templateParam(i.zoneNames.join(', '));
    out[lang] = severe
      ? { name: `alert_level_3_${lang}`, language: 'fr', params: [title, zones, templateParam(i.approvedText?.trim() || i.description)] }
      : { name: `alert_level_2_${lang}`, language: 'fr', params: [title, zones] };
  }
  return out;
}
