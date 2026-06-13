import { AlertLevel, AlertStatus, AlertStep, CriticalValidatorCategory, Role } from '@prisma/client';

/**
 * Machine à états OLEL — v3 (cursus court, urgence-first)
 *
 * RÉCEPTION → VÉRIFIÉE → [CONFIRMÉE] → DIFFUSÉE → CLÔTURÉE
 *
 * L'enum Prisma AlertStep est CONSERVÉ pour la rétrocompat ; on REDÉFINIT
 * la sémantique :
 *   SIGNALEMENT  = RÉCEPTION
 *   MAIRIE       = VÉRIFIÉE
 *   PREFECTURE   = CONFIRMÉE (uniquement ROUGE / ROUGE_FONCE)
 *   BROADCAST    = DIFFUSÉE
 *   CLOSED       = CLÔTURÉE
 * SENTINELLE/COORDINATEUR/GOUVERNANCE restent dans l'enum mais ne sont
 * plus des étapes intermédiaires — les anciennes alertes y stagnaient.
 *
 * Principes :
 *   1. Une seule autorité par étape (plus de séquence MAIRIE→PREFECTURE→
 *      GOUVERNANCE imposée). Les rôles supérieurs court-circuitent leurs
 *      subordonnés.
 *   2. BLEU/JAUNE/ORANGE : diffusion automatique dès qu'une MAIRIE+ vérifie
 *      (1 humain entre le signal et la diffusion).
 *   3. ROUGE/ROUGE_FONCE : 2 humains au lieu de 3+. MAIRIE vérifie, PRÉFECTURE/
 *      PROTECTION_CIVILE/GOUVERNORAT confirme et la diffusion part.
 *   4. Bypass urgence (MAIRIE+) : court-circuit complet vers DIFFUSION, avec
 *      justification obligatoire et notification de contrôle.
 *   5. Auto-escalade : une alerte VÉRIFIÉE ROUGE+ non confirmée après
 *      AUTO_ESCALATION_MINUTES bascule en DIFFUSÉE avec mention « non
 *      confirmée par l'autorité ».
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

/** Délai après lequel une alerte ROUGE/ROUGE_FONCE non confirmée est auto-diffusée. */
export const AUTO_ESCALATION_MINUTES = 15;

/** Étapes logiques (alias des valeurs Prisma). */
export const PHASE = {
  RECEPTION: AlertStep.SIGNALEMENT,
  VERIFIEE:  AlertStep.MAIRIE,
  CONFIRMEE: AlertStep.PREFECTURE,
  DIFFUSEE:  AlertStep.BROADCAST,
  CLOTUREE:  AlertStep.CLOSED,
} as const;

export const STEP_LABEL: Record<string, string> = {
  [AlertStep.SIGNALEMENT]:  'Reçue',
  [AlertStep.SENTINELLE]:   'Reçue',
  [AlertStep.COORDINATEUR]: 'Vérifiée',
  [AlertStep.MAIRIE]:       'Vérifiée',
  [AlertStep.PREFECTURE]:   'Confirmée',
  [AlertStep.GOUVERNANCE]:  'Confirmée',
  [AlertStep.BROADCAST]:    'Diffusée',
  [AlertStep.CLOSED]:       'Clôturée',
};

/** Normalise une alerte avec un ancien step vers les 5 phases. */
export function normalizePhase(step: AlertStep): AlertStep {
  if (step === AlertStep.SENTINELLE) return PHASE.RECEPTION;
  if (step === AlertStep.COORDINATEUR) return PHASE.VERIFIEE;
  if (step === AlertStep.GOUVERNANCE) return PHASE.CONFIRMEE;
  return step;
}

/** Rôle minimum pour vérifier (RECEPTION → VERIFIEE). */
export const MIN_ROLE_TO_VERIFY: Role = Role.MAIRIE;

/** Rôle minimum pour confirmer (VERIFIEE → CONFIRMEE/DIFFUSEE) selon le niveau. */
export function minRoleToConfirm(level: AlertLevel): Role {
  return level === AlertLevel.ROUGE_FONCE ? Role.GOUVERNORAT : Role.PREFECTURE;
}

/** Faut-il une étape CONFIRMATION supplémentaire après la VÉRIFICATION ? */
export function needsConfirmation(level: AlertLevel): boolean {
  return level === AlertLevel.ROUGE || level === AlertLevel.ROUGE_FONCE;
}

/** Prochaine étape selon le niveau et l'étape courante. null si terminale. */
export function nextStepFor(currentStep: AlertStep, level: AlertLevel): AlertStep | null {
  const phase = normalizePhase(currentStep);
  if (phase === PHASE.RECEPTION) return PHASE.VERIFIEE;
  if (phase === PHASE.VERIFIEE)  return needsConfirmation(level) ? PHASE.CONFIRMEE : PHASE.DIFFUSEE;
  if (phase === PHASE.CONFIRMEE) return PHASE.DIFFUSEE;
  return null;
}

/** Le rôle peut-il faire avancer l'alerte à partir de son étape courante ? */
export function canAdvanceAt(role: Role, currentStep: AlertStep, level: AlertLevel): boolean {
  const phase = normalizePhase(currentStep);
  if (role === Role.RADIO_COMMUNAUTAIRE || role === Role.CITOYEN) return false;
  if (phase === PHASE.RECEPTION) return hasLevel(role, Role.SENTINELLE);
  if (phase === PHASE.VERIFIEE)  return hasLevel(role, MIN_ROLE_TO_VERIFY);
  if (phase === PHASE.CONFIRMEE) return hasLevel(role, minRoleToConfirm(level));
  return false;
}

/** Qui peut déclencher la diffusion d'urgence (bypass complet) ? */
export function mayEmergencyBypass(role: Role): boolean {
  return hasLevel(role, Role.MAIRIE);
}

export function canCreate(role: Role): boolean {
  return ROLE_LEVEL[role] >= ROLE_LEVEL[Role.CITOYEN];
}

export function canBroadcast(role: Role): boolean {
  return hasLevel(role, Role.MAIRIE);
}

export function canClose(role: Role): boolean {
  return hasLevel(role, Role.MAIRIE);
}

/** Catégorie de co-signature (traçabilité, non bloquante). */
export function criticalCategory(role: Role): CriticalValidatorCategory | null {
  if (role === Role.SENTINELLE || role === Role.COORDINATEUR) {
    return CriticalValidatorCategory.SENTINELLE_CATEGORY;
  }
  if (role === Role.MAIRIE || role === Role.PREFECTURE) {
    return CriticalValidatorCategory.AUTORITE_LOCALE;
  }
  if (role === Role.GOUVERNORAT || role === Role.PROTECTION_CIVILE || role === Role.SUPERVISEUR_REGIONAL) {
    return CriticalValidatorCategory.AUTORITE_ADMIN;
  }
  return null;
}

/** Étape cible pour PROTECTION_CIVILE lors d'une création directe. */
export function protectionCivileEntryStep(_level: AlertLevel): { step: AlertStep; status: AlertStatus } {
  // En urgence, PROTECTION_CIVILE entre directement à CONFIRMEE → diffusion immédiate.
  return { step: PHASE.CONFIRMEE, status: AlertStatus.VALIDATED };
}

export const LEVEL_CONFIG: Record<AlertLevel, {
  label: string;
  color: string;
  icon: string;
  minBroadcastRole: Role;
  channels: string[];
  notifyCitizensFromStep: AlertStep;
}> = {
  BLEU: {
    label: 'Information', color: '#0EA5E9', icon: 'info',
    minBroadcastRole: Role.MAIRIE,
    channels: ['app', 'whatsapp'],
    notifyCitizensFromStep: PHASE.DIFFUSEE,
  },
  JAUNE: {
    label: 'Vigilance', color: '#F59E0B', icon: 'warning',
    minBroadcastRole: Role.MAIRIE,
    channels: ['app', 'whatsapp', 'ussd'],
    notifyCitizensFromStep: PHASE.DIFFUSEE,
  },
  ORANGE: {
    label: 'Pré-alerte', color: '#F97316', icon: 'alert-triangle',
    minBroadcastRole: Role.MAIRIE,
    channels: ['app', 'whatsapp', 'sms'],
    notifyCitizensFromStep: PHASE.DIFFUSEE,
  },
  ROUGE: {
    label: 'Urgence', color: '#EF4444', icon: 'alert-circle',
    minBroadcastRole: Role.PREFECTURE,
    channels: ['app', 'whatsapp', 'sms', 'ivr'],
    // Préventif : on prévient les citoyens dès la VÉRIFICATION pour les ROUGE
    notifyCitizensFromStep: PHASE.VERIFIEE,
  },
  ROUGE_FONCE: {
    label: 'Crise Majeure', color: '#7F1D1D', icon: 'alert-octagon',
    minBroadcastRole: Role.GOUVERNORAT,
    channels: ['app', 'whatsapp', 'sms', 'ivr', 'ussd'],
    notifyCitizensFromStep: PHASE.VERIFIEE,
  },
};

/** Compat : anciens noms toujours importés ailleurs. */
export const CRITICAL_LEVELS: AlertLevel[] = [AlertLevel.ORANGE, AlertLevel.ROUGE, AlertLevel.ROUGE_FONCE];
export const URGENCE_TYPES: string[] = ['INCENDIE', 'ACCIDENT_INDUSTRIEL'];
export const WORKFLOW = {} as any;
export function canAdvance(role: Role, _step: AlertStep): boolean {
  return hasLevel(role, Role.SENTINELLE) && role !== Role.RADIO_COMMUNAUTAIRE && role !== Role.CITOYEN;
}
