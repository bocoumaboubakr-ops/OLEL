// Miroir frontend de backend/src/alerts/alert-workflow.ts + permissions.service.ts
// Source unique de vérité pour la gouvernance OLEL côté dashboard.

export type AlertLevel = 'BLEU' | 'JAUNE' | 'ORANGE' | 'ROUGE' | 'ROUGE_FONCE';

export const LEVEL_CONFIG: Record<AlertLevel, {
  label: string;
  color: string;
  bg: string;
  icon: string;
  description: string;
}> = {
  BLEU:        { label: 'Information', color: '#0EA5E9', bg: '#e0f2fe', icon: 'ℹ️',  description: 'Information' },
  JAUNE:       { label: 'Vigilance',   color: '#F59E0B', bg: '#fef9c3', icon: '⚠️',  description: 'Vigilance' },
  ORANGE:      { label: 'Pré-alerte',  color: '#F97316', bg: '#ffedd5', icon: '🔶',  description: 'Pré-alerte' },
  ROUGE:       { label: 'Urgence',     color: '#EF4444', bg: '#fee2e2', icon: '🚨',  description: 'Urgence' },
  ROUGE_FONCE: { label: 'Crise Majeure', color: '#7F1D1D', bg: '#fecaca', icon: '🔴', description: 'Crise Majeure' },
};

export const CRITICAL_LEVELS: AlertLevel[] = ['ORANGE', 'ROUGE', 'ROUGE_FONCE'];

export const ROLE_LEVEL: Record<string, number> = {
  CITOYEN: 0,
  SENTINELLE: 1,
  RADIO_COMMUNAUTAIRE: 1,
  COORDINATEUR: 2,
  MAIRIE: 3,
  HYDRO_METEO: 3,
  PREFECTURE: 4,
  GOUVERNORAT: 5,
  PROTECTION_CIVILE: 5,
  SUPERVISEUR_REGIONAL: 6,
  ADMIN: 99,
  SUPER_ADMIN: 99,
};

export const ROLE_LABELS: Record<string, string> = {
  CITOYEN: 'Citoyen',
  SENTINELLE: 'Sentinelle',
  RADIO_COMMUNAUTAIRE: 'Radio Communautaire',
  COORDINATEUR: 'Coordinateur Sentinelles',
  MAIRIE: 'Mairie',
  HYDRO_METEO: 'Hydrologie / Météo',
  PREFECTURE: 'Préfecture',
  GOUVERNORAT: 'Gouvernance',
  PROTECTION_CIVILE: 'Protection Civile',
  SUPERVISEUR_REGIONAL: 'Superviseur Régional',
  ADMIN: 'Administrateur',
  SUPER_ADMIN: 'Super Administrateur',
};

/** Étapes du cursus officiel (7 étapes + clôture). */
export const WORKFLOW_STEPS = [
  'SIGNALEMENT', 'SENTINELLE', 'COORDINATEUR', 'MAIRIE', 'PREFECTURE', 'GOUVERNANCE', 'BROADCAST', 'CLOSED',
] as const;

export const STEP_LABEL: Record<string, string> = {
  SIGNALEMENT:  'Signalement',
  SENTINELLE:   'Sentinelle',
  COORDINATEUR: 'Coordinateur',
  MAIRIE:       'Mairie',
  PREFECTURE:   'Préfecture',
  GOUVERNANCE:  'Gouvernance',
  BROADCAST:    'Diffusion',
  CLOSED:       'Clôture',
};

/** Rôle minimum (niveau) requis pour faire avancer chaque étape via advance(). */
export const STEP_MIN_LEVEL: Record<string, number> = {
  SIGNALEMENT:  1, // SENTINELLE
  SENTINELLE:   2, // COORDINATEUR
  COORDINATEUR: 3, // MAIRIE
  MAIRIE:       4, // PREFECTURE
  GOUVERNANCE:  5, // GOUVERNORAT (ROUGE_FONCE)
};

/** Catégorie de validation critique d'un rôle (null = ne peut pas valider). */
export function criticalCategory(role: string): 'SENTINELLE_CATEGORY' | 'AUTORITE_LOCALE' | 'AUTORITE_ADMIN' | null {
  if (role === 'SENTINELLE' || role === 'COORDINATEUR') return 'SENTINELLE_CATEGORY';
  if (role === 'MAIRIE' || role === 'PREFECTURE') return 'AUTORITE_LOCALE';
  if (role === 'GOUVERNORAT' || role === 'PROTECTION_CIVILE' || role === 'SUPERVISEUR_REGIONAL') return 'AUTORITE_ADMIN';
  return null;
}

export const CRITICAL_CATEGORY_LABEL: Record<string, string> = {
  SENTINELLE_CATEGORY: 'Sentinelle / Coordinateur',
  AUTORITE_LOCALE: 'Autorité locale (Mairie / Préfecture)',
  AUTORITE_ADMIN: 'Autorité admin (Gouvernance / Protection Civile)',
};

export function hasLevel(role: string, min: number): boolean {
  return (ROLE_LEVEL[role] ?? 0) >= min;
}

export function canCreate(role: string): boolean {
  return role in ROLE_LEVEL && role !== 'RADIO_COMMUNAUTAIRE';
}
