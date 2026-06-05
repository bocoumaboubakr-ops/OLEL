import { AlertLevel, AlertStatus, AlertStep, CriticalValidatorCategory, Role } from '@prisma/client';

/**
 * Machine à états officielle OLEL — Gouvernance v2
 *
 * SIGNALEMENT → SENTINELLE → COORDINATEUR → MAIRIE → PREFECTURE → [GOUVERNANCE] → BROADCAST → CLOSED
 *
 * Alertes ORANGE / ROUGE / ROUGE_FONCE : blocage strict tri-catégorie avant broadcast.
 */

export const ROLE_LEVEL: Record<Role, number> = {
  CITOYEN:              0,
  SENTINELLE:           1,
  RADIO_COMMUNAUTAIRE:  1,
  COORDINATEUR:         2,
  MAIRIE:               3,
  HYDRO_METEO:          3,
  PREFECTURE:           4,
  GOUVERNORAT:          5,
  PROTECTION_CIVILE:    5,
  SUPERVISEUR_REGIONAL: 6,
  ADMIN:               99,
  SUPER_ADMIN:         99,
};

export function hasLevel(role: Role, min: Role): boolean {
  return ROLE_LEVEL[role] >= ROLE_LEVEL[min];
}

interface StepDef {
  step: AlertStep;
  minRole: Role;
  next: AlertStep | null;
  nextStatus: AlertStatus;
}

export const WORKFLOW: Record<AlertStep, StepDef> = {
  SIGNALEMENT: {
    step: AlertStep.SIGNALEMENT,
    minRole: Role.SENTINELLE,
    next: AlertStep.SENTINELLE,
    nextStatus: AlertStatus.UNDER_REVIEW,
  },
  SENTINELLE: {
    step: AlertStep.SENTINELLE,
    minRole: Role.COORDINATEUR,
    next: AlertStep.COORDINATEUR,
    nextStatus: AlertStatus.UNDER_REVIEW,
  },
  COORDINATEUR: {
    step: AlertStep.COORDINATEUR,
    minRole: Role.MAIRIE,
    next: AlertStep.MAIRIE,
    nextStatus: AlertStatus.UNDER_REVIEW,
  },
  MAIRIE: {
    step: AlertStep.MAIRIE,
    minRole: Role.PREFECTURE,
    next: AlertStep.PREFECTURE,
    nextStatus: AlertStatus.VALIDATED,
  },
  PREFECTURE: {
    step: AlertStep.PREFECTURE,
    minRole: Role.PREFECTURE,
    next: AlertStep.GOUVERNANCE,
    nextStatus: AlertStatus.VALIDATED,
  },
  GOUVERNANCE: {
    // Étape ROUGE_FONCE uniquement — sortie vers broadcast
    step: AlertStep.GOUVERNANCE,
    minRole: Role.GOUVERNORAT,
    next: AlertStep.BROADCAST,
    nextStatus: AlertStatus.VALIDATED,
  },
  BROADCAST: {
    step: AlertStep.BROADCAST,
    minRole: Role.MAIRIE,
    next: AlertStep.CLOSED,
    nextStatus: AlertStatus.CLOSED,
  },
  CLOSED: {
    step: AlertStep.CLOSED,
    minRole: Role.SUPER_ADMIN,
    next: null,
    nextStatus: AlertStatus.CLOSED,
  },
};

export function canAdvance(role: Role, step: AlertStep): boolean {
  return hasLevel(role, WORKFLOW[step].minRole);
}

export function canCreate(role: Role): boolean {
  return ROLE_LEVEL[role] >= ROLE_LEVEL[Role.CITOYEN];
}

export function canBroadcast(role: Role): boolean {
  return hasLevel(role, Role.PREFECTURE);
}

export function canClose(role: Role): boolean {
  return hasLevel(role, Role.MAIRIE);
}

/** Niveaux d'alerte nécessitant la triple validation avant broadcast. */
export const CRITICAL_LEVELS: AlertLevel[] = [
  AlertLevel.ORANGE,
  AlertLevel.ROUGE,
  AlertLevel.ROUGE_FONCE,
];

/** Types URGENCE auto-escalade : gravité 3 → skip jusqu'à PREFECTURE. */
export const URGENCE_TYPES = ['INCENDIE', 'ACCIDENT_INDUSTRIEL'];

/** Étape cible selon l'alertLevel pour PROTECTION_CIVILE (création directe). */
export function protectionCivileEntryStep(level: AlertLevel): { step: AlertStep; status: AlertStatus } {
  if (level === AlertLevel.ROUGE_FONCE) {
    return { step: AlertStep.GOUVERNANCE, status: AlertStatus.VALIDATED };
  }
  return { step: AlertStep.PREFECTURE, status: AlertStatus.VALIDATED };
}

/** Catégorie de validation critique pour un rôle donné. */
export function criticalCategory(role: Role): CriticalValidatorCategory | null {
  if (role === Role.SENTINELLE || role === Role.COORDINATEUR) {
    return CriticalValidatorCategory.SENTINELLE_CATEGORY;
  }
  if (role === Role.MAIRIE || role === Role.PREFECTURE) {
    return CriticalValidatorCategory.AUTORITE_LOCALE;
  }
  if (
    role === Role.GOUVERNORAT ||
    role === Role.PROTECTION_CIVILE ||
    role === Role.SUPERVISEUR_REGIONAL
  ) {
    return CriticalValidatorCategory.AUTORITE_ADMIN;
  }
  return null;
}

/** Libellés humains */
export const STEP_LABEL: Record<AlertStep, string> = {
  SIGNALEMENT:  'Signalement reçu',
  SENTINELLE:   'Vérification sentinelle',
  COORDINATEUR: 'Validation coordinateur',
  MAIRIE:       'Confirmation mairie',
  PREFECTURE:   'Validation préfecture',
  GOUVERNANCE:  'Validation gouvernance',
  BROADCAST:    'Diffusion',
  CLOSED:       'Clôturée',
};

export const LEVEL_CONFIG: Record<AlertLevel, {
  label: string;
  color: string;
  icon: string;
  minBroadcastRole: Role;
  channels: string[];
}> = {
  BLEU: {
    label: 'Information',
    color: '#0EA5E9',
    icon: 'info',
    minBroadcastRole: Role.SENTINELLE,
    channels: ['app', 'ussd'],
  },
  JAUNE: {
    label: 'Vigilance',
    color: '#F59E0B',
    icon: 'warning',
    minBroadcastRole: Role.COORDINATEUR,
    channels: ['app', 'whatsapp', 'ussd'],
  },
  ORANGE: {
    label: 'Pré-alerte',
    color: '#F97316',
    icon: 'alert-triangle',
    minBroadcastRole: Role.MAIRIE,
    channels: ['app', 'whatsapp', 'sms', 'radio'],
  },
  ROUGE: {
    label: 'Urgence',
    color: '#EF4444',
    icon: 'alert-circle',
    minBroadcastRole: Role.PREFECTURE,
    channels: ['app', 'whatsapp', 'sms', 'ivr', 'radio'],
  },
  ROUGE_FONCE: {
    label: 'Crise Majeure',
    color: '#7F1D1D',
    icon: 'alert-octagon',
    minBroadcastRole: Role.GOUVERNORAT,
    channels: ['app', 'whatsapp', 'sms', 'ivr', 'radio', 'ussd'],
  },
};
