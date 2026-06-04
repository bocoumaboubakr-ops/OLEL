import { AlertStatus, AlertStep, Role } from '@prisma/client';

/**
 * Machine à états du cursus d'alerte OLEL — conforme à CURSUS_ALERTE.md
 *
 *   SIGNALEMENT → SENTINELLE → MAIRIE → PREFECTURE → BROADCAST → CLOSED
 *   (PENDING)    (UNDER_REVIEW)        (VALIDATED)  (BROADCAST)  (CLOSED)
 */

/** Niveau hiérarchique d'un rôle (plus haut = plus de pouvoir). */
export const ROLE_LEVEL: Record<Role, number> = {
  CITOYEN: 0,
  SENTINELLE: 1,
  MAIRIE: 2,
  PREFECTURE: 3,
  GOUVERNORAT: 4,
  PROTECTION_CIVILE: 4,
  ADMIN: 99,
  SUPER_ADMIN: 99,
};

export function hasLevel(role: Role, min: Role): boolean {
  return ROLE_LEVEL[role] >= ROLE_LEVEL[min];
}

/**
 * Définition d'une étape : rôle minimum qui peut la faire avancer,
 * et l'état résultant lorsqu'on valide vers l'étape suivante.
 */
interface StepDef {
  step: AlertStep;
  /** Rôle minimum requis pour AGIR (valider/avancer) depuis cette étape. */
  minRole: Role;
  /** Étape suivante en cas de validation. */
  next: AlertStep | null;
  /** Statut résultant sur l'alerte après validation vers l'étape suivante. */
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
    // Étape de validation finale : la sortie est le broadcast (action dédiée)
    step: AlertStep.PREFECTURE,
    minRole: Role.PREFECTURE,
    next: AlertStep.BROADCAST,
    nextStatus: AlertStatus.BROADCASTING,
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

/** L'utilisateur (par son rôle) peut-il faire avancer l'alerte à l'étape donnée ? */
export function canAdvance(role: Role, step: AlertStep): boolean {
  return hasLevel(role, WORKFLOW[step].minRole);
}

/** Un rôle peut-il créer une alerte ? (tous sauf personne) */
export function canCreate(role: Role): boolean {
  return ROLE_LEVEL[role] >= ROLE_LEVEL[Role.CITOYEN];
}

/** Un rôle peut-il diffuser (broadcast) ? */
export function canBroadcast(role: Role): boolean {
  return hasLevel(role, Role.PREFECTURE);
}

/** Un rôle peut-il clôturer une alerte ? */
export function canClose(role: Role): boolean {
  return hasLevel(role, Role.MAIRIE);
}

/** Libellé humain de l'étape. */
export const STEP_LABEL: Record<AlertStep, string> = {
  SIGNALEMENT: 'Signalement reçu',
  SENTINELLE: 'Vérification sentinelle',
  MAIRIE: 'Confirmation mairie',
  PREFECTURE: 'Validation préfecture',
  BROADCAST: 'Diffusion',
  CLOSED: 'Clôturée',
};
