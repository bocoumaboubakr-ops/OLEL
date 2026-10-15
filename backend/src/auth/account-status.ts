import { AccountStatus } from '@prisma/client';

/**
 * Source unique du cycle de vie d'un compte (audit F07, F19).
 *
 * - IN_TRAINING : peut s'authentifier, n'accède qu'aux routes marquées
 *   @AllowInTraining() (formations, profil). Aucune action opérationnelle.
 * - ACTIVE      : habilité selon son rôle.
 * - SUSPENDED   : aucune authentification, sur aucun parcours.
 *
 * `isActive` est conservé comme miroir de compatibilité (lu par des requêtes
 * existantes) et n'est écrit QUE par `accountStatusData`.
 */
export function accountStatusData(status: AccountStatus) {
  return { status, isActive: status !== AccountStatus.SUSPENDED };
}

export function canAuthenticate(status: AccountStatus | null | undefined): boolean {
  return status === AccountStatus.ACTIVE || status === AccountStatus.IN_TRAINING;
}

export function isOperational(status: AccountStatus | null | undefined): boolean {
  return status === AccountStatus.ACTIVE;
}
