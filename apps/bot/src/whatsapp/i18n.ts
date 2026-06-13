/**
 * Messages du bot WhatsApp OLEL en 4 langues.
 *
 * ⚠️ À FAIRE RELIRE PAR DES LOCUTEURS NATIFS DE MATAM AVANT LE PILOTE.
 * Traductions Pulaar (ff), Wolof (wo), Soninké (snk) : base de travail non
 * validée par des natifs. Sur une plateforme d'alerte, à relire impérativement.
 */

export type Lang = 'fr' | 'ff' | 'wo' | 'snk';
export const LANGS: Lang[] = ['fr', 'ff', 'wo', 'snk'];
export const LANG_NAMES: Record<Lang, string> = {
  fr: 'Français', ff: 'Pulaar', wo: 'Wolof', snk: 'Soninké',
};

export function isLang(v?: string): v is Lang {
  return !!v && (LANGS as string[]).includes(v);
}

// Types de risque traduits (le menu numéroté reste universel)
export const RISK_LABELS: Record<string, Record<Lang, string>> = {
  INONDATION:           { fr: '🌊 Inondation',   ff: '🌊 Ilam',          wo: '🌊 Mbëkkte',      snk: '🌊 Jiyen' },
  SECHERESSE:           { fr: '☀️ Sécheresse',  ff: '☀️ Yoorande',      wo: '☀️ Naqar',        snk: '☀️ Bange' },
  INCENDIE:             { fr: '🔥 Incendie',     ff: '🔥 Jayngol',       wo: '🔥 Safara',       snk: '🔥 Yinba' },
  TEMPETE:              { fr: '🌪️ Tempête',     ff: '🌪️ Henndu mawndu', wo: '🌪️ Ngelaw lu mag', snk: '🌪️ Fooñe' },
  EPIDEMIE:             { fr: '🦠 Épidémie',     ff: '🦠 Nyawu',         wo: '🦠 Feebar',       snk: '🦠 Bagannde' },
  LOCUSTES:             { fr: '🦗 Criquets',     ff: '🦗 Njuuti',        wo: '🦗 Njéeréer',     snk: '🦗 Tonbo' },
  MOUVEMENT_DE_TERRAIN: { fr: '⛰️ Glissement',  ff: '⛰️ Yiltagol leydi', wo: '⛰️ Suuf si daanu', snk: '⛰️ Ñiiñe' },
  AUTRE:                { fr: '⚠️ Autre danger', ff: '⚠️ Bone goɗɗo',    wo: '⚠️ Yeneen musiba', snk: '⚠️ Tana doroni' },
};

type Dict = {
  chooseLang: string;
  menu: string;
  reportTypePrompt: string;
  describePrompt: (label: string) => string;
  severityPrompt: string;
  reportSaved: (label: string, sev: string) => string;
  reportError: string;
  alertsNone: string;
  alertsHeader: (n: number) => string;
  profile: (phone: string) => string;
  invalidOption: string;
  invalidNumber: (max: number) => string;
  invalidSeverity: string;
  sevLabels: [string, string, string]; // vigilance / alerte / urgence
  audioPrompt: string;
  audioReceived: string;
};

const fr: Dict = {
  chooseLang: '🌍 Choisissez votre langue / Suɓo ɗemngal / Tànnal sa làkk :\n\n1️⃣ Français\n2️⃣ Pulaar\n3️⃣ Wolof\n4️⃣ Soninké',
  menu: '🚨 *OLEL – Alerte Précoce*\n_Région de Matam_\n\n1️⃣ Signaler une situation\n2️⃣ Consulter les alertes\n3️⃣ Mon profil\n\nRépondez avec le numéro, ou *langue* pour changer de langue.',
  reportTypePrompt: '📋 *Type de risque :*',
  describePrompt: (l) => `${l} sélectionné.\n\nDécrivez la situation (lieu, ampleur, personnes touchées).\n\n💡 Vous pouvez aussi *envoyer un message vocal* dans votre langue.`,
  severityPrompt: 'Gravité :\n1. 🟢 Vigilance\n2. 🟡 Alerte\n3. 🔴 Urgence (danger immédiat)\n\nRépondez 1, 2 ou 3.',
  reportSaved: (l, s) => `✅ *Signalement enregistré !*\nType : ${l}\nGravité : ${s}\n\nLes autorités ont été notifiées. Merci pour votre vigilance.\n\nTapez *menu* pour recommencer.`,
  reportError: '❌ Erreur lors de l\'enregistrement. Réessayez.\nTapez *menu*.',
  alertsNone: '✅ Aucune alerte active dans votre zone.\n\nTapez *menu* pour revenir.',
  alertsHeader: (n) => `🚨 *Alertes actives (${n}) :*`,
  profile: (p) => `ℹ️ *Votre compte OLEL*\nNuméro : ${p}\n\nTapez *langue* pour changer de langue, *menu* pour revenir.`,
  invalidOption: '❓ Option non reconnue. Répondez *1*, *2* ou *3*, ou tapez *menu*.',
  invalidNumber: (m) => `Numéro invalide. Répondez de 1 à ${m}.`,
  invalidSeverity: 'Répondez 1, 2 ou 3.',
  sevLabels: ['🟢 Vigilance', '🟡 Alerte', '🔴 Urgence'],
  audioPrompt: '🎙️ Message vocal reçu. Décrivez aussi brièvement par écrit si possible, ou tapez *ok* pour valider.',
  audioReceived: '🎙️ Votre message vocal a bien été reçu et sera écouté par un agent.',
};

// ⚠️ Traductions à relire par des natifs
const ff: Dict = {
  chooseLang: '🌍 Suɓo ɗemngal / Choisissez votre langue :\n\n1️⃣ Farayse\n2️⃣ Pulaar\n3️⃣ Wolof\n4️⃣ Sooninke',
  menu: '🚨 *OLEL – Reentaare*\n_Diiwaan Matam_\n\n1️⃣ Hollu bone\n2️⃣ Ƴeew reentaareeji\n3️⃣ Konngol am\n\nJaabo e llimol, walla winndu *ɗemngal* ngam waylude ɗemngal.',
  reportTypePrompt: '📋 *Sifaa bone on :*',
  describePrompt: (l) => `${l} suɓaama.\n\nSifo ko heɓii (nokku, mawnde, yimɓe nanngaaɓe).\n\n💡 Aɗa waawi *neldude konngol sawtuyaŋkol* e ɗemngal maa.`,
  severityPrompt: 'Mawnde bone:\n1. 🟢 Reentaare\n2. 🟡 Tonngol\n3. 🔴 Heñorde (bone jooni)\n\nJaabo 1, 2 walla 3.',
  reportSaved: (l, s) => `✅ *Bone on winndaama!*\nSifaa : ${l}\nMawnde : ${s}\n\nLaamu humpitaama. A jaaraama.\n\nWinndu *menu* ngam fuɗɗaade.`,
  reportError: '❌ Juumre waɗii. Eto goɗngol.\nWinndu *menu*.',
  alertsNone: '✅ Alaa reentaare e nokku maa.\n\nWinndu *menu*.',
  alertsHeader: (n) => `🚨 *Reentaareeji (${n}) :*`,
  profile: (p) => `ℹ️ *Konngol OLEL maa*\nNimero : ${p}\n\nWinndu *ɗemngal* ngam waylude, *menu* ngam ruttaade.`,
  invalidOption: '❓ Suɓngo ngalaa. Jaabo *1*, *2* walla *3*, walla winndu *menu*.',
  invalidNumber: (m) => `Limol ngalaa. Jaabo gila 1 haa ${m}.`,
  invalidSeverity: 'Jaabo 1, 2 walla 3.',
  sevLabels: ['🟢 Reentaare', '🟡 Tonngol', '🔴 Heñorde'],
  audioPrompt: '🎙️ Konngol sawtuyaŋkol heɓaama. Winndu seeɗa kadi so aɗa waawi, walla winndu *ok*.',
  audioReceived: '🎙️ Konngol maa sawtuyaŋkol heɓaama, gardiiɗo maa heɗoo ngol.',
};

// ⚠️ Traductions à relire par des natifs
const wo: Dict = {
  chooseLang: '🌍 Tànnal sa làkk / Choisissez votre langue :\n\n1️⃣ Faraas\n2️⃣ Pulaar\n3️⃣ Wolof\n4️⃣ Sooninke',
  menu: '🚨 *OLEL – Artu*\n_Diiwaanu Matam_\n\n1️⃣ Yégle benn mbir\n2️⃣ Seet artu yi\n3️⃣ Sama profil\n\nTontu ak limu bi, walla bind *làkk* ngir soppi làkk.',
  reportTypePrompt: '📋 *Xeetu musiba :*',
  describePrompt: (l) => `${l} tànnees na.\n\nWax la xew (bérab, lu mu tollu, ñi mu jàpp).\n\n💡 Man ngaa *yónnee bataaxal buy baat* ci sa làkk.`,
  severityPrompt: 'Tolluwaayu musiba:\n1. 🟢 Moytabal\n2. 🟡 Artu\n3. 🔴 Jamono bu tàng (musiba léegi)\n\nTontu 1, 2 walla 3.',
  reportSaved: (l, s) => `✅ *Yégle bi nataal na!*\nXeet : ${l}\nTolluwaay : ${s}\n\nAutorités yi xamees nañu. Jërëjëf.\n\nBind *menu* ngir tàmbali.`,
  reportError: '❌ Njuumte am na. Jéemaat.\nBind *menu*.',
  alertsNone: '✅ Amul artu ci sa gox.\n\nBind *menu*.',
  alertsHeader: (n) => `🚨 *Artu yi (${n}) :*`,
  profile: (p) => `ℹ️ *Sa kont OLEL*\nNimero : ${p}\n\nBind *làkk* ngir soppi, *menu* ngir dellu.`,
  invalidOption: '❓ Tann gi baaxul. Tontu *1*, *2* walla *3*, walla bind *menu*.',
  invalidNumber: (m) => `Limu bi baaxul. Tontu 1 ba ${m}.`,
  invalidSeverity: 'Tontu 1, 2 walla 3.',
  sevLabels: ['🟢 Moytabal', '🟡 Artu', '🔴 Jamono bu tàng'],
  audioPrompt: '🎙️ Bataaxalu baat bi jot na. Bindal tuuti itam su manee, walla bind *ok*.',
  audioReceived: '🎙️ Sa bataaxalu baat jot na, ab agent dina ko déglu.',
};

// ⚠️ Traductions à relire par des natifs
const snk: Dict = {
  chooseLang: '🌍 Tànnal sa làkk / Choisissez :\n\n1️⃣ Faransi\n2️⃣ Pulaar\n3️⃣ Wolof\n4️⃣ Sooninke',
  menu: '🚨 *OLEL – Xibaare*\n_Matam jamaane_\n\n1️⃣ Xibaare tana\n2️⃣ Xibaarini ñan ŋa\n3️⃣ N profil\n\nJaabi nimero ŋa, walla safa *làkk* an làkk falle.',
  reportTypePrompt: '📋 *Tana sifa :*',
  describePrompt: (l) => `${l} tànnu.\n\nXibaare ke (jamaane, a gabe, sere ku nan).\n\n💡 An ŋa *audio nelli* an làkk di.`,
  severityPrompt: 'Tana gabe:\n1. 🟢 Korinte\n2. 🟡 Xibaare\n3. 🔴 Tanpinte (tana yiga)\n\nJaabi 1, 2 walla 3.',
  reportSaved: (l, s) => `✅ *Xibaare safani!*\nSifa : ${l}\nGabe : ${s}\n\nSaxuruyen xa toxo. I ni jaara.\n\nSafa *menu* a tuga.`,
  reportError: '❌ Filli wuto. Tagara koota.\nSafa *menu*.',
  alertsNone: '✅ Xibaare nta n jamaane di.\n\nSafa *menu*.',
  alertsHeader: (n) => `🚨 *Xibaarini (${n}) :*`,
  profile: (p) => `ℹ️ *N OLEL kont*\nNimero : ${p}\n\nSafa *làkk* an falle, *menu* a kompe.`,
  invalidOption: '❓ Tann nta ñiŋe. Jaabi *1*, *2* walla *3*, walla safa *menu*.',
  invalidNumber: (m) => `Nimero nta ñiŋe. Jaabi 1 ke ${m}.`,
  invalidSeverity: 'Jaabi 1, 2 walla 3.',
  sevLabels: ['🟢 Korinte', '🟡 Xibaare', '🔴 Tanpinte'],
  audioPrompt: '🎙️ Audio safani. Safa doroni an ŋa wuto, walla safa *ok*.',
  audioReceived: '🎙️ I audio safani, agent ke a yittan.',
};

export const DICT: Record<Lang, Dict> = { fr, ff, wo, snk };

export function t(lang: Lang): Dict {
  return DICT[lang] || DICT.fr;
}

/** Construit le menu numéroté des types de risque dans la langue donnée. */
export function riskMenu(lang: Lang): string {
  return Object.entries(RISK_LABELS)
    .map(([, labels], i) => `${i + 1}. ${labels[lang]}`)
    .join('\n');
}

export const RISK_ORDER = Object.keys(RISK_LABELS);
