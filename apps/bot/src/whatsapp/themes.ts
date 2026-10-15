/**
 * Organisation des risques en 6 thématiques métier — version bot WhatsApp.
 * Miroir de apps/mobile/src/lib/themes.ts (gardé synchronisé manuellement).
 *
 * Le menu WhatsApp se déroule en 2 niveaux :
 *   1. Choix de thématique (1–6)
 *   2. Choix d'option dans la thématique (1–N)
 *
 * Les options sans AlertType dédié (élevage, infrastructures) utilisent
 * AUTRE + préfixe dans la description pour rester triables côté ops.
 */

import type { Lang } from './i18n';

export type ThemeKey =
  | 'CLIMATIQUE'
  | 'SECURITE_CIVILE'
  | 'SANTE'
  | 'AGRICULTURE'
  | 'ELEVAGE'
  | 'INFRASTRUCTURES';

export type AlertTypeValue =
  | 'INONDATION' | 'SECHERESSE' | 'INCENDIE' | 'TEMPETE'
  | 'EPIDEMIE' | 'LOCUSTES' | 'ACCIDENT_INDUSTRIEL'
  | 'MOUVEMENT_DE_TERRAIN' | 'AUTRE';

export interface RiskOption {
  id: string;
  labels: Record<Lang, string>;
  icon: string;
  type: AlertTypeValue;
  descPrefix?: string;
}

export interface Theme {
  key: ThemeKey;
  labels: Record<Lang, string>;
  icon: string;
  options: RiskOption[];
}

/* eslint-disable max-len */
export const THEMES: Theme[] = [
  {
    key: 'CLIMATIQUE',
    labels: { fr: 'Risques climatiques', ff: 'Bone weeyo', wo: 'Musiba asaman', snk: 'Jamaane tana' },
    icon: '🌧️',
    options: [
      { id: 'INONDATION', icon: '🌊', type: 'INONDATION', labels: { fr: 'Inondation', ff: 'Ilam', wo: 'Mbëkkte', snk: 'Jiyen' } },
      { id: 'SECHERESSE', icon: '☀️', type: 'SECHERESSE', labels: { fr: 'Sécheresse', ff: 'Yoorande', wo: 'Naqar', snk: 'Bange' } },
      { id: 'TEMPETE',    icon: '🌪️', type: 'TEMPETE',    labels: { fr: 'Tempête / vent fort', ff: 'Henndu mawndu', wo: 'Ngelaw lu mag', snk: 'Fooñe' } },
    ],
  },
  {
    key: 'SECURITE_CIVILE',
    labels: { fr: 'Sécurité civile', ff: 'Kisal yimɓe', wo: 'Kaaraange askan', snk: 'Sere kisi' },
    icon: '🛡️',
    options: [
      { id: 'INCENDIE',             icon: '🔥', type: 'INCENDIE',             labels: { fr: 'Incendie', ff: 'Jayngol', wo: 'Safara', snk: 'Yinba' } },
      { id: 'MOUVEMENT_DE_TERRAIN', icon: '⛰️', type: 'MOUVEMENT_DE_TERRAIN', labels: { fr: 'Glissement de terrain', ff: 'Yiltagol leydi', wo: 'Suuf si daanu', snk: 'Ñiiñe' } },
      { id: 'ACCIDENT_INDUSTRIEL',  icon: '🏭', type: 'ACCIDENT_INDUSTRIEL',  labels: { fr: 'Accident industriel/chimique', ff: 'Aksidan ndema', wo: 'Aksidaŋ usine', snk: 'Usine tana' } },
    ],
  },
  {
    key: 'SANTE',
    labels: { fr: 'Santé communautaire', ff: 'Cellal jamaa', wo: 'Wér-gi-yaram', snk: 'Tannan' },
    icon: '🏥',
    options: [
      { id: 'EPIDEMIE',    icon: '🦠', type: 'EPIDEMIE', labels: { fr: 'Épidémie/maladie', ff: 'Nyawu', wo: 'Feebar', snk: 'Bagannde' } },
      { id: 'SANTE_AUTRE', icon: '➕', type: 'AUTRE', descPrefix: '[SANTÉ] ', labels: { fr: 'Autre problème de santé', ff: 'Caɗeele cellal goɗɗo', wo: 'Yeneen feebar', snk: 'Bagannde doroni' } },
    ],
  },
  {
    key: 'AGRICULTURE',
    labels: { fr: 'Agriculture', ff: 'Demal', wo: 'Mbey', snk: 'Sɔnkɔ' },
    icon: '🌾',
    options: [
      { id: 'LOCUSTES',   icon: '🦗', type: 'LOCUSTES', labels: { fr: 'Criquets / nuisibles', ff: 'Njuuti', wo: 'Njéeréer', snk: 'Tonbo' } },
      { id: 'AGRI_AUTRE', icon: '🌱', type: 'AUTRE', descPrefix: '[AGRICULTURE] ', labels: { fr: 'Autre problème agricole', ff: 'Caɗeele demal goɗɗo', wo: 'Yeneen mbir mbey', snk: 'Sɔnkɔ tana doroni' } },
    ],
  },
  {
    key: 'ELEVAGE',
    labels: { fr: 'Élevage', ff: 'Durngo', wo: 'Sàmm', snk: 'Naxani' },
    icon: '🐄',
    options: [
      { id: 'ELEVAGE_MALADIE', icon: '🐄', type: 'AUTRE', descPrefix: '[ÉLEVAGE — Maladie] ', labels: { fr: 'Maladie/mortalité du bétail', ff: 'Nyawu/maayde jawdi', wo: 'Feebar walla deeg jur', snk: 'Naxani bagannde walla faatu' } },
      { id: 'ELEVAGE_AUTRE',   icon: '🐑', type: 'AUTRE', descPrefix: '[ÉLEVAGE] ',           labels: { fr: 'Autre problème d\'élevage', ff: 'Caɗeele durngo goɗɗo', wo: 'Yeneen mbir sàmm', snk: 'Naxani tana doroni' } },
    ],
  },
  {
    key: 'INFRASTRUCTURES',
    labels: { fr: 'Infrastructures locales', ff: 'Pinal nokku', wo: 'Mbaaxal réew', snk: 'Jamaane raxen' },
    icon: '🏗️',
    options: [
      { id: 'INFRA_RESEAU', icon: '⚡', type: 'AUTRE', descPrefix: '[INFRASTRUCTURE — Réseau] ', labels: { fr: 'Coupure eau/électricité', ff: 'Taƴugol ndiyam/kuuraa', wo: 'Dog ndox/lekkat', snk: 'Jiyen/danba xaadi' } },
      { id: 'INFRA_ROUTE',  icon: '🛣️', type: 'AUTRE', descPrefix: '[INFRASTRUCTURE — Voirie] ', labels: { fr: 'Route/pont endommagé', ff: 'Laawol/jenngol bonɗo', wo: 'Yoon walla pon dafa yàqu', snk: 'Kille walla pon yeren' } },
      { id: 'INFRA_AUTRE',  icon: '🏗️', type: 'AUTRE', descPrefix: '[INFRASTRUCTURE] ',          labels: { fr: 'Autre dégradation', ff: 'Bone goɗɗo', wo: 'Yeneen yàq', snk: 'Yere doroni' } },
    ],
  },
];
/* eslint-enable max-len */

export function themeMenu(lang: Lang): string {
  return THEMES.map((t, i) => `${i + 1}. ${t.icon} ${t.labels[lang]}`).join('\n');
}

export function optionsMenu(theme: Theme, lang: Lang): string {
  return theme.options.map((o, i) => `${i + 1}. ${o.icon} ${o.labels[lang]}`).join('\n');
}

export function getTheme(index: number): Theme | null {
  return THEMES[index] ?? null;
}
