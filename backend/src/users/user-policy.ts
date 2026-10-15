import { AccountStatus, Role } from '@prisma/client';

/**
 * Politique de gestion des comptes — source unique (audit F01, F08).
 *
 * Règles appliquées côté serveur à toute création/modification de compte :
 *   1. Personne ne modifie son propre rôle, statut ou zone.
 *   2. L'appelant doit avoir un rang strictement supérieur au rôle actuel
 *      de la cible ET au rôle attribué.
 *   3. Le rôle actuel de la cible doit figurer dans MANAGEABLE[appelant].
 *   4. Un rôle ne peut être attribué que s'il figure dans GRANTABLE[appelant].
 *   5. Hors ADMIN/SUPER_ADMIN, la cible et la nouvelle zone doivent être dans
 *      le territoire de l'appelant (sa zone et ses descendants).
 *
 * Conséquences voulues : aucun rôle ne peut créer de SUPER_ADMIN par l'API
 * (seulement via seed/CLI) ; ADMIN ne crée pas d'ADMIN ; les autorités
 * territoriales gèrent les comptes de terrain sans pouvoir changer de rôle.
 *
 * ⚠ Les tables ci-dessous traduisent une décision de gouvernance (qui peut
 * habiliter qui). Défaut prudent, à valider par les responsables du
 * dispositif — voir docs/AUDIT_REMEDIATION.md, décision D2.
 */

export const ADMIN_RANK: Record<Role, number> = {
  CITOYEN: 0,
  SENTINELLE: 10,
  RADIO_COMMUNAUTAIRE: 10,
  COORDINATEUR: 20,
  MAIRIE: 30,
  HYDRO_METEO: 30,
  PREFECTURE: 40,
  GOUVERNORAT: 50,
  PROTECTION_CIVILE: 50,
  SUPERVISEUR_REGIONAL: 60,
  ADMIN: 90,
  SUPER_ADMIN: 100,
};

const ALL_ROLES = Object.values(Role) as Role[];
const FIELD_ROLES: Role[] = [Role.SENTINELLE, Role.RADIO_COMMUNAUTAIRE];

/** Rôles qu'un appelant peut attribuer (création ou changement de rôle). */
export const GRANTABLE: Record<Role, Role[]> = {
  SUPER_ADMIN: ALL_ROLES.filter((r) => r !== Role.SUPER_ADMIN),
  ADMIN: ALL_ROLES.filter((r) => r !== Role.ADMIN && r !== Role.SUPER_ADMIN),
  SUPERVISEUR_REGIONAL: [
    Role.CITOYEN, Role.SENTINELLE, Role.RADIO_COMMUNAUTAIRE, Role.COORDINATEUR,
    Role.MAIRIE, Role.HYDRO_METEO, Role.PREFECTURE,
  ],
  GOUVERNORAT: [],
  PROTECTION_CIVILE: [],
  PREFECTURE: [],
  MAIRIE: [],
  HYDRO_METEO: [],
  COORDINATEUR: [],
  RADIO_COMMUNAUTAIRE: [],
  SENTINELLE: [],
  CITOYEN: [],
};

/** Rôles des comptes qu'un appelant peut gérer (statut, zone, nom). */
export const MANAGEABLE: Record<Role, Role[]> = {
  SUPER_ADMIN: ALL_ROLES.filter((r) => r !== Role.SUPER_ADMIN),
  ADMIN: ALL_ROLES.filter((r) => r !== Role.ADMIN && r !== Role.SUPER_ADMIN),
  SUPERVISEUR_REGIONAL: GRANTABLE.SUPERVISEUR_REGIONAL,
  GOUVERNORAT: [...FIELD_ROLES, Role.COORDINATEUR],
  PREFECTURE: [...FIELD_ROLES, Role.COORDINATEUR],
  MAIRIE: [Role.SENTINELLE],
  COORDINATEUR: [Role.SENTINELLE],
  PROTECTION_CIVILE: [],
  HYDRO_METEO: [],
  RADIO_COMMUNAUTAIRE: [],
  SENTINELLE: [],
  CITOYEN: [],
};

/** Rôles dispensés du contrôle territorial (portée plateforme). */
export const TERRITORY_EXEMPT: Role[] = [Role.ADMIN, Role.SUPER_ADMIN];

export interface Caller { id: string; role: Role; zoneId?: string | null }
export interface Target { id: string; role: Role; zoneId?: string | null }
export interface UserChange {
  role?: Role;
  status?: AccountStatus;
  zoneId?: string;
  name?: string;
  email?: string;
}

export interface TerritoryFacts {
  /** La cible est-elle dans le territoire de l'appelant ? */
  targetInTerritory: boolean;
  /** La nouvelle zone (si fournie) est-elle dans le territoire ? */
  newZoneInTerritory: boolean;
}

export interface Decision { allowed: boolean; reason?: string }

const deny = (reason: string): Decision => ({ allowed: false, reason });

export function decideUpdate(caller: Caller, target: Target, change: UserChange, t: TerritoryFacts): Decision {
  const sensitive = change.role !== undefined || change.status !== undefined || change.zoneId !== undefined;

  if (caller.id === target.id) {
    return sensitive
      ? deny('Vous ne pouvez pas modifier votre propre rôle, statut ou zone')
      : { allowed: true };
  }
  if (ADMIN_RANK[caller.role] <= ADMIN_RANK[target.role] || !MANAGEABLE[caller.role].includes(target.role)) {
    return deny(`Le rôle ${caller.role} ne peut pas gérer un compte ${target.role}`);
  }
  if (change.role !== undefined && change.role !== target.role) {
    if (!GRANTABLE[caller.role].includes(change.role) || ADMIN_RANK[caller.role] <= ADMIN_RANK[change.role]) {
      return deny(`Le rôle ${caller.role} ne peut pas attribuer le rôle ${change.role}`);
    }
  }
  if (!TERRITORY_EXEMPT.includes(caller.role)) {
    if (!t.targetInTerritory) return deny('Ce compte est hors de votre territoire');
    if (change.zoneId !== undefined && !t.newZoneInTerritory) {
      return deny('La zone demandée est hors de votre territoire');
    }
  }
  return { allowed: true };
}

export function decideCreate(caller: Caller, role: Role, t: { zoneInTerritory: boolean }): Decision {
  if (!GRANTABLE[caller.role].includes(role) || ADMIN_RANK[caller.role] <= ADMIN_RANK[role]) {
    return deny(`Le rôle ${caller.role} ne peut pas créer un compte ${role}`);
  }
  if (!TERRITORY_EXEMPT.includes(caller.role) && !t.zoneInTerritory) {
    return deny('La zone demandée est hors de votre territoire');
  }
  return { allowed: true };
}

/** Un changement invalide-t-il les sessions existantes de la cible ? */
export function isSessionSensitive(change: UserChange): boolean {
  return change.role !== undefined || change.status !== undefined || change.zoneId !== undefined;
}
