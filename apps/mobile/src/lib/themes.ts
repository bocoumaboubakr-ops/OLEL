/**
 * Organisation des risques en 6 thématiques métier
 * (Système Communautaire Intelligent de Résilience Territoriale).
 *
 * On ne touche PAS à l'enum AlertType en base : les options qui n'ont pas
 * de type dédié (élevage, infrastructures) utilisent AUTRE + un préfixe
 * dans la description pour rester triables côté ops.
 */

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
  /** Identifiant unique d'option (utilisé dans l'UI, pas en base) */
  id: string;
  label: string;
  icon: string;
  /** AlertType réel persisté en base */
  type: AlertTypeValue;
  /** Préfixe injecté dans la description pour distinguer les sous-types AUTRE */
  descPrefix?: string;
}

export interface Theme {
  key: ThemeKey;
  label: string;
  short: string;
  icon: string;
  color: string;
  options: RiskOption[];
}

export const THEMES: Theme[] = [
  {
    key: 'CLIMATIQUE',
    label: 'Risques climatiques',
    short: 'Climat',
    icon: '🌧️',
    color: '#0EA5E9',
    options: [
      { id: 'INONDATION', label: 'Inondation',           icon: '🌊', type: 'INONDATION' },
      { id: 'SECHERESSE', label: 'Sécheresse',           icon: '☀️', type: 'SECHERESSE' },
      { id: 'TEMPETE',    label: 'Tempête / vent fort',  icon: '🌪️', type: 'TEMPETE' },
    ],
  },
  {
    key: 'SECURITE_CIVILE',
    label: 'Sécurité civile',
    short: 'Sécurité',
    icon: '🛡️',
    color: '#DC2626',
    options: [
      { id: 'INCENDIE',             label: 'Incendie',                       icon: '🔥', type: 'INCENDIE' },
      { id: 'MOUVEMENT_DE_TERRAIN', label: 'Glissement de terrain',          icon: '⛰️', type: 'MOUVEMENT_DE_TERRAIN' },
      { id: 'ACCIDENT_INDUSTRIEL',  label: 'Accident industriel / chimique', icon: '🏭', type: 'ACCIDENT_INDUSTRIEL' },
    ],
  },
  {
    key: 'SANTE',
    label: 'Santé communautaire',
    short: 'Santé',
    icon: '🏥',
    color: '#EC4899',
    options: [
      { id: 'EPIDEMIE',     label: 'Épidémie / maladie humaine', icon: '🦠', type: 'EPIDEMIE' },
      { id: 'SANTE_AUTRE',  label: 'Autre problème de santé',     icon: '➕', type: 'AUTRE', descPrefix: '[SANTÉ] ' },
    ],
  },
  {
    key: 'AGRICULTURE',
    label: 'Agriculture',
    short: 'Agri',
    icon: '🌾',
    color: '#84CC16',
    options: [
      { id: 'LOCUSTES',    label: 'Criquets / nuisibles',         icon: '🦗', type: 'LOCUSTES' },
      { id: 'AGRI_AUTRE',  label: 'Autre problème agricole',      icon: '🌱', type: 'AUTRE', descPrefix: '[AGRICULTURE] ' },
    ],
  },
  {
    key: 'ELEVAGE',
    label: 'Élevage',
    short: 'Élevage',
    icon: '🐄',
    color: '#A16207',
    options: [
      { id: 'ELEVAGE_MALADIE', label: 'Maladie / mortalité du bétail', icon: '🐄', type: 'AUTRE', descPrefix: '[ÉLEVAGE — Maladie] ' },
      { id: 'ELEVAGE_AUTRE',   label: 'Autre problème d\'élevage',      icon: '🐑', type: 'AUTRE', descPrefix: '[ÉLEVAGE] ' },
    ],
  },
  {
    key: 'INFRASTRUCTURES',
    label: 'Infrastructures locales',
    short: 'Infra',
    icon: '🏗️',
    color: '#475569',
    options: [
      { id: 'INFRA_RESEAU', label: 'Coupure eau / électricité',  icon: '⚡', type: 'AUTRE', descPrefix: '[INFRASTRUCTURE — Réseau] ' },
      { id: 'INFRA_ROUTE',  label: 'Route / pont endommagé',     icon: '🛣️', type: 'AUTRE', descPrefix: '[INFRASTRUCTURE — Voirie] ' },
      { id: 'INFRA_AUTRE',  label: 'Autre dégradation',           icon: '🏗️', type: 'AUTRE', descPrefix: '[INFRASTRUCTURE] ' },
    ],
  },
];

export function findOption(optionId: string): { theme: Theme; option: RiskOption } | null {
  for (const theme of THEMES) {
    const option = theme.options.find((o) => o.id === optionId);
    if (option) return { theme, option };
  }
  return null;
}

/** Reconstruit le thème d'origine à partir d'un AlertType + description (pour l'affichage des alertes existantes). */
export function inferThemeFromAlert(type: AlertTypeValue, description?: string): Theme {
  if (type === 'AUTRE' && description) {
    if (description.startsWith('[ÉLEVAGE')) return THEMES.find((t) => t.key === 'ELEVAGE')!;
    if (description.startsWith('[INFRASTRUCTURE')) return THEMES.find((t) => t.key === 'INFRASTRUCTURES')!;
    if (description.startsWith('[AGRICULTURE]')) return THEMES.find((t) => t.key === 'AGRICULTURE')!;
    if (description.startsWith('[SANTÉ]')) return THEMES.find((t) => t.key === 'SANTE')!;
  }
  for (const theme of THEMES) {
    if (theme.options.some((o) => o.type === type && !o.descPrefix)) return theme;
  }
  return THEMES[1]; // fallback sécurité civile
}
