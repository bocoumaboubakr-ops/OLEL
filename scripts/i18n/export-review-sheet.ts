/**
 * Feuille de relecture des traductions (décision D5).
 * Extrait tous les textes destinés aux citoyens et aux sentinelles dans les
 * quatre langues, pour validation par des locuteurs natifs.
 *
 *   pnpm i18n:review   (ou : node -r ./backend/node_modules/ts-node/register/transpile-only scripts/i18n/export-review-sheet.ts)
 *
 * Produit docs/traductions/relecture-traductions.csv (UTF-8, séparateur « ; »,
 * ouvrable dans Excel/LibreOffice). Statut « repli français » : le texte de la
 * langue est identique au français (traduction absente).
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DICT, RISK_LABELS } from '../../apps/bot/src/whatsapp/i18n';
import { THEMES } from '../../apps/bot/src/whatsapp/themes';
import { TEMPLATES } from '../../apps/bot/src/whatsapp/templates';
import { MOBILE_DICT } from '../../apps/mobile/src/lib/i18n';
import { I18N_REVIEW } from '../../backend/src/common/i18n/alert-messages';

type L4 = { fr: string; ff: string; wo: string; snk: string };
const rows: { domain: string; key: string; t: L4; note?: string }[] = [];
const LANGS = ['fr', 'ff', 'wo', 'snk'] as const;
const val = (v: unknown): string => (typeof v === 'function' ? (v as (...a: string[]) => string)(...Array.from({ length: (v as Function).length }, (_, i) => `{${i + 1}}`)) : String(v ?? ''));
const add = (domain: string, key: string, get: (l: typeof LANGS[number]) => unknown, note?: string) =>
  rows.push({ domain, key, t: { fr: val(get('fr')), ff: val(get('ff')), wo: val(get('wo')), snk: val(get('snk')) }, note });

// Messages d'alerte diffusés (backend)
for (const [k, v] of Object.entries(I18N_REVIEW.LEVEL_PREFIX)) add('Alerte diffusée', `Niveau ${k}`, (l) => (v as any)[l]);
for (const [k, v] of Object.entries(I18N_REVIEW.CERTAINTY_TAG)) if ((v as any).fr) add('Alerte diffusée', `Mention ${k}`, (l) => (v as any)[l], 'Mention de certitude en tête de message');
add('Alerte diffusée', 'Mention EXERCICE (mode pilote)', (l) => (I18N_REVIEW.EXERCISE_TAG as any)[l], 'En tête et en fin de chaque message diffusé pendant le pilote');
add('Alerte diffusée', 'Mot « Zone »', (l) => (I18N_REVIEW.ZONE_WORD as any)[l]);
add('Alerte diffusée', 'Consigne finale', (l) => (I18N_REVIEW.FOLLOW_INSTRUCTIONS as any)[l]);
// Bot WhatsApp
for (const key of Object.keys(DICT.fr)) add('Bot WhatsApp', key, (l) => (DICT as any)[l][key], typeof (DICT.fr as any)[key] === 'function' ? '{1}, {2}… = valeurs insérées automatiquement' : undefined);
for (const [k, v] of Object.entries(RISK_LABELS)) add('Bot — types de risque', k, (l) => (v as any)[l]);
for (const th of THEMES) {
  add('Bot — thématiques', th.key, (l) => (th as any).labels[l]);
  for (const o of th.options) add('Bot — sous-types', `${th.key} / ${o.id}`, (l) => (o as any).labels[l]);
}
// Modèles WhatsApp (à soumettre à Meta APRÈS validation)
for (const [key, byLang] of Object.entries(TEMPLATES)) {
  add('Modèles WhatsApp', `${key} — corps`, (l) => (byLang as any)[l]?.components?.body?.text, 'Texte soumis à Meta : toute correction exige une nouvelle approbation');
  if ((byLang as any).fr?.components?.header?.text) add('Modèles WhatsApp', `${key} — en-tête`, (l) => (byLang as any)[l]?.components?.header?.text);
}
// Application mobile
for (const key of Object.keys(MOBILE_DICT.fr)) add('Application mobile', key, (l) => (MOBILE_DICT as any)[l][key]);
// Canaux en français seulement : textes extraits directement du code source
// (USSD, SVI) pour que la feuille reste fidèle à ce qui est réellement envoyé.
const ROOT = join(__dirname, '..', '..');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const unescape = (raw: string) => raw.replace(/\\n/g, ' / ').replace(/\\'/g, "'").replace(/\$\{[^}]*\}/g, '{…}').replace(/\s+/g, ' ').trim();
const frOnly = (domain: string, key: string, fr: string, note = 'Canal en français seulement : pas encore traduit') =>
  rows.push({ domain: 'Français seulement', key: `${domain} — ${key}`, t: { fr, ff: '', wo: '', snk: '' }, note });
{
  let n = 0;
  for (const m of Array.from(src('backend/src/ussd/ussd.service.ts').matchAll(/(['`])(CON|END) ((?:\\.|(?!\1)[^\\])*)\1/g))) frOnly('USSD', `écran ${++n}`, unescape(m[3]));
  n = 0;
  const ivr = src('backend/src/ivr/ivr.controller.ts') + src('backend/src/notifications/channels/ivr.service.ts');
  for (const m of Array.from(ivr.matchAll(/say\(((?:'(?:\\.|[^'\\])*'\s*\+?\s*)+)\)/g))) frOnly('SVI', `message ${++n}`, unescape(Array.from(m[1].matchAll(/'((?:\\.|[^'\\])*)'/g)).map((x) => x[1]).join('')));
  for (const m of Array.from(ivr.matchAll(/<Say voice="fr-FR">([^<$]+)<\/Say>/g))) frOnly('SVI', `message ${++n}`, unescape(m[1]));
  const retract = /\|\| `(L'alerte[^`]*)`/.exec(src('backend/src/alerts/alerts.service.ts'));
  if (retract) frOnly('Alerte diffusée', 'texte de retrait par défaut', unescape(retract[1]), 'Texte par défaut du retrait d\'alerte : à traduire');
}

const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
const status = (r: typeof rows[number]) => {
  const fallback = (['ff', 'wo', 'snk'] as const).filter((l) => !r.t[l] || r.t[l] === r.t.fr);
  return fallback.length ? `repli français (${fallback.join(', ')})` : 'traduit — à valider';
};
const header = ['Domaine', 'Clé', 'Français (référence)', 'Pulaar (actuel)', 'Wolof (actuel)', 'Soninké (actuel)', 'Pulaar (validé)', 'Wolof (validé)', 'Soninké (validé)', 'Statut', 'Note', 'Commentaire du relecteur'];
const lines = [header.map(esc).join(';'), ...rows.map((r) => [r.domain, r.key, r.t.fr, r.t.ff, r.t.wo, r.t.snk, '', '', '', status(r), r.note ?? '', ''].map(esc).join(';'))];
const out = join(ROOT, 'docs', 'traductions', 'relecture-traductions.csv');
writeFileSync(out, '﻿' + lines.join('\r\n') + '\r\n', 'utf8');
const fb = rows.filter((r) => status(r).startsWith('repli')).length;
console.log(`${rows.length} textes exportés (${fb} avec repli français) → ${out}`);
