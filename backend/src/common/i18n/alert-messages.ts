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
