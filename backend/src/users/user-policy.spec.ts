import { AccountStatus, Role } from '@prisma/client';
import { ADMIN_RANK, GRANTABLE, MANAGEABLE, decideCreate, decideUpdate } from './user-policy';

const inT = { targetInTerritory: true, newZoneInTerritory: true };
const ALL = Object.values(Role) as Role[];

describe('user-policy (audit F01)', () => {
  it('personne ne modifie son propre rôle, statut ou zone', () => {
    for (const role of ALL) {
      const me = { id: 'me', role, zoneId: 'z' };
      expect(decideUpdate(me, me, { role: Role.SUPER_ADMIN }, inT).allowed).toBe(false);
      expect(decideUpdate(me, me, { status: AccountStatus.ACTIVE }, inT).allowed).toBe(false);
      expect(decideUpdate(me, me, { zoneId: 'y' }, inT).allowed).toBe(false);
      expect(decideUpdate(me, me, { name: 'n' }, inT).allowed).toBe(true);
    }
  });

  it('aucun rôle ne peut attribuer SUPER_ADMIN, ni un rôle de rang ≥ au sien', () => {
    for (const caller of ALL) {
      expect(GRANTABLE[caller]).not.toContain(Role.SUPER_ADMIN);
      for (const granted of GRANTABLE[caller]) expect(ADMIN_RANK[granted]).toBeLessThan(ADMIN_RANK[caller]);
      for (const managed of MANAGEABLE[caller]) expect(ADMIN_RANK[managed]).toBeLessThan(ADMIN_RANK[caller]);
    }
  });

  it('les autorités territoriales ne changent aucun rôle', () => {
    for (const caller of [Role.COORDINATEUR, Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.HYDRO_METEO]) {
      expect(GRANTABLE[caller]).toEqual([]);
      const c = { id: 'c', role: caller, zoneId: 'z' };
      const t = { id: 't', role: Role.SENTINELLE, zoneId: 'z' };
      expect(decideUpdate(c, t, { role: Role.COORDINATEUR }, inT).allowed).toBe(false);
    }
  });

  it('le contrôle territorial s\'applique hors ADMIN/SUPER_ADMIN', () => {
    const maire = { id: 'm', role: Role.MAIRIE, zoneId: 'A' };
    const s = { id: 's', role: Role.SENTINELLE, zoneId: 'B' };
    expect(decideUpdate(maire, s, { status: AccountStatus.SUSPENDED }, { targetInTerritory: false, newZoneInTerritory: true }).allowed).toBe(false);
    expect(decideUpdate(maire, { ...s, zoneId: 'A' }, { zoneId: 'B' }, { targetInTerritory: true, newZoneInTerritory: false }).allowed).toBe(false);
    const admin = { id: 'a', role: Role.ADMIN, zoneId: null };
    expect(decideUpdate(admin, s, { status: AccountStatus.SUSPENDED }, { targetInTerritory: false, newZoneInTerritory: false }).allowed).toBe(true);
  });

  it('création : SUPERVISEUR_REGIONAL borné, ADMIN ne crée pas d\'ADMIN', () => {
    const sup = { id: 's', role: Role.SUPERVISEUR_REGIONAL, zoneId: 'r' };
    expect(decideCreate(sup, Role.MAIRIE, { zoneInTerritory: true }).allowed).toBe(true);
    for (const r of [Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.ADMIN, Role.SUPER_ADMIN]) {
      expect(decideCreate(sup, r, { zoneInTerritory: true }).allowed).toBe(false);
    }
    expect(decideCreate({ id: 'a', role: Role.ADMIN }, Role.ADMIN, { zoneInTerritory: true }).allowed).toBe(false);
    expect(decideCreate({ id: 'a', role: Role.SUPER_ADMIN }, Role.SUPER_ADMIN, { zoneInTerritory: true }).allowed).toBe(false);
  });
});
