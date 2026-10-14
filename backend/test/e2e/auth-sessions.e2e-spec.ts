/**
 * Non-régression — droits, sessions, MFA (audit F01, F07, F10, F11, F19).
 * Chaque test exige le comportement SÉCURISÉ ; sur le commit audité
 * cfd68a5 ils échouaient (voir docs/AUDIT_REMEDIATION.md).
 */
import { AccountStatus, Role } from '@prisma/client';
import { authenticator } from 'otplib';
import { Ctx, api, bootApp, createUser, login, resetDb, seedZones, PASSWORD, TEST_ENV } from './harness';
import { validateEnv } from '../../src/common/config/env.validation';

let ctx: Ctx;

beforeAll(async () => { ctx = await bootApp(); });
afterAll(async () => { await ctx.prisma.$disconnect(); await ctx.app.close(); });
beforeEach(async () => { await resetDb(ctx.prisma); await seedZones(ctx); });

describe('F01 — élévation de privilèges', () => {
  it('un COORDINATEUR ne peut pas se promouvoir SUPER_ADMIN (refus serveur + trace)', async () => {
    const coord = await createUser(ctx, Role.COORDINATEUR, ctx.zones.communeA);
    const { accessToken } = await login(ctx, coord);

    const r = await api(ctx, 'PATCH', `/users/${coord.id}`, { token: accessToken, body: { role: Role.SUPER_ADMIN } });
    expect(r.status).toBe(403);
    const after = await ctx.prisma.user.findUnique({ where: { id: coord.id } });
    expect(after!.role).toBe(Role.COORDINATEUR);
    const trace = await ctx.prisma.auditLog.findFirst({ where: { action: 'user.update.denied', userId: coord.id } });
    expect(trace).not.toBeNull();
  });

  it('un COORDINATEUR ne peut promouvoir personne, ni gérer un pair', async () => {
    const coord = await createUser(ctx, Role.COORDINATEUR, ctx.zones.communeA);
    const sentinel = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const peer = await createUser(ctx, Role.COORDINATEUR, ctx.zones.communeA);
    const { accessToken } = await login(ctx, coord);

    expect((await api(ctx, 'PATCH', `/users/${sentinel.id}`, { token: accessToken, body: { role: Role.MAIRIE } })).status).toBe(403);
    expect((await api(ctx, 'PATCH', `/users/${peer.id}`, { token: accessToken, body: { status: 'SUSPENDED' } })).status).toBe(403);
  });

  it('SUPERVISEUR_REGIONAL ne peut créer ni SUPER_ADMIN, ni ADMIN, ni GOUVERNORAT', async () => {
    const sup = await createUser(ctx, Role.SUPERVISEUR_REGIONAL, ctx.zones.matam, { mfa: true });
    const { accessToken } = await login(ctx, sup);
    for (const role of [Role.SUPER_ADMIN, Role.ADMIN, Role.GOUVERNORAT]) {
      const r = await api(ctx, 'POST', '/users', { token: accessToken, body: { name: 'X', phone: `+22178${Math.floor(Math.random() * 1e7)}`, role, password: PASSWORD, zoneId: ctx.zones.matam } });
      expect(r.status).toBe(403);
    }
    const ok = await api(ctx, 'POST', '/users', { token: accessToken, body: { name: 'Maire', phone: '+221781112233', role: Role.MAIRIE, password: PASSWORD, zoneId: ctx.zones.communeA } });
    expect(ok.status).toBe(201);
  });

  it('après promotion, les anciens jetons sont refusés et le MFA est exigé', async () => {
    const coord = await createUser(ctx, Role.COORDINATEUR, ctx.zones.communeA);
    const admin = await createUser(ctx, Role.ADMIN, ctx.zones.matam, { mfa: true });
    const coordTokens = await login(ctx, coord);
    const adminTokens = await login(ctx, admin);

    const promo = await api(ctx, 'PATCH', `/users/${coord.id}`, { token: adminTokens.accessToken, body: { role: Role.MAIRIE } });
    expect(promo.status).toBe(200);

    expect((await api(ctx, 'GET', '/users/me', { token: coordTokens.accessToken })).status).toBe(401);
    expect((await api(ctx, 'POST', '/auth/refresh', { body: { refreshToken: coordTokens.refreshToken } })).status).toBe(401);
    const relog = await api(ctx, 'POST', '/auth/login', { body: { phone: coord.phone, password: PASSWORD } });
    expect(relog.status).toBe(200);
    expect(relog.body.accessToken).toBeUndefined();
    expect(relog.body.mfaSetupRequired).toBe(true);
  });

  it('défense en profondeur : une session sans MFA ne donne aucun accès à un rôle qui exige le MFA', async () => {
    const coord = await createUser(ctx, Role.COORDINATEUR, ctx.zones.communeA);
    const tokens = await login(ctx, coord);
    // Changement de rôle direct en base, SANS incrément de tokenVersion (chemin hors API)
    await ctx.prisma.user.update({ where: { id: coord.id }, data: { role: Role.MAIRIE } });

    expect((await api(ctx, 'GET', '/users/me', { token: tokens.accessToken })).status).toBe(401);
    const r = await api(ctx, 'POST', '/auth/refresh', { body: { refreshToken: tokens.refreshToken } });
    expect(r.status).toBe(401);
    expect(String(r.body.message)).toMatch(/double authentification/i);
  });

  it('le rôle et la zone sont relus en base, jamais pris dans le jeton', async () => {
    const sentinel = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const tokens = await login(ctx, sentinel);
    const me = await api(ctx, 'GET', '/users/me', { token: tokens.accessToken });
    expect(me.body.role).toBe(Role.SENTINELLE);
    // Un jeton forgé avec un autre rôle mais sans session valide est rejeté
    const { JwtService } = await import('@nestjs/jwt');
    const forged = new JwtService({ secret: TEST_ENV.JWT_SECRET }).sign({ sub: sentinel.id, role: Role.SUPER_ADMIN, typ: 'access', sid: 'inexistant', tv: 0 });
    expect((await api(ctx, 'GET', '/users', { token: forged })).status).toBe(401);
  });
});

describe('F07 — suspension appliquée à tous les parcours', () => {
  it('une sentinelle suspendue perd immédiatement accès (jeton, refresh, mot de passe, OTP)', async () => {
    const maire = await createUser(ctx, Role.MAIRIE, ctx.zones.communeA, { mfa: true });
    const sentinel = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const sTokens = await login(ctx, sentinel);
    const mTokens = await login(ctx, maire);

    expect((await api(ctx, 'PATCH', `/users/${sentinel.id}`, { token: mTokens.accessToken, body: { status: 'SUSPENDED' } })).status).toBe(200);

    expect((await api(ctx, 'GET', '/users/me', { token: sTokens.accessToken })).status).toBe(401);
    expect((await api(ctx, 'POST', '/auth/refresh', { body: { refreshToken: sTokens.refreshToken } })).status).toBe(401);
    expect((await api(ctx, 'POST', '/auth/login', { body: { phone: sentinel.phone, password: PASSWORD } })).status).toBe(401);
    const otp = await api(ctx, 'POST', '/auth/otp/request', { body: { phone: sentinel.phone } });
    const v = await api(ctx, 'POST', '/auth/otp/verify', { body: { phone: sentinel.phone, code: otp.body.dev_code } });
    expect(v.status).toBe(401);
    expect(v.body.accessToken).toBeUndefined();
  });

  it('un MAIRIE ne gère pas une sentinelle hors de son territoire', async () => {
    const maire = await createUser(ctx, Role.MAIRIE, ctx.zones.communeA, { mfa: true });
    const other = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeB);
    const { accessToken } = await login(ctx, maire);
    expect((await api(ctx, 'PATCH', `/users/${other.id}`, { token: accessToken, body: { status: 'SUSPENDED' } })).status).toBe(403);
    expect((await api(ctx, 'GET', `/users/${other.id}`, { token: accessToken })).status).toBe(404);
    const list = await api(ctx, 'GET', '/users', { token: accessToken });
    expect(list.body.users.map((u: any) => u.id)).not.toContain(other.id);
  });
});

describe('F19 — formation distincte de l\'habilitation', () => {
  it('une sentinelle invitée se forme mais n\'a aucun droit opérationnel, et la formation ne l\'habilite pas', async () => {
    const maire = await createUser(ctx, Role.MAIRIE, ctx.zones.communeA, { mfa: true });
    const { accessToken: mt } = await login(ctx, maire);
    const created = await api(ctx, 'POST', '/users/sentinelle', { token: mt, body: { name: 'Nouvelle', phone: '+221785556677' } });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe(AccountStatus.IN_TRAINING);

    const r = await api(ctx, 'POST', '/auth/login', { body: { phone: '+221785556677', password: created.body.tempPassword } });
    expect(r.status).toBe(200);
    const st = r.body.accessToken;
    expect((await api(ctx, 'GET', '/trainings', { token: st })).status).toBe(200);
    expect((await api(ctx, 'GET', '/users/me', { token: st })).status).toBe(200);
    expect((await api(ctx, 'GET', '/alerts', { token: st })).status).toBe(403);
    expect((await api(ctx, 'GET', '/signalements', { token: st })).status).toBe(403);

    const mod = await ctx.prisma.trainingModule.create({ data: { title: 'M1', description: 'd', isRequired: true } });
    expect((await api(ctx, 'POST', `/trainings/${mod.id}/complete`, { token: st, body: { score: 100 } })).status).toBe(201);
    const u = await ctx.prisma.user.findUnique({ where: { id: created.body.id } });
    expect(u!.status).toBe(AccountStatus.IN_TRAINING);
    expect(u!.trainingCompletedAt).not.toBeNull();

    // L'habilitation est une décision explicite d'un responsable
    expect((await api(ctx, 'PATCH', `/users/${created.body.id}`, { token: mt, body: { status: 'ACTIVE' } })).status).toBe(200);
    const h = await ctx.prisma.user.findUnique({ where: { id: created.body.id } });
    expect(h!.status).toBe(AccountStatus.ACTIVE);
    expect(h!.habilitatedById).toBe(maire.id);
  });

  it('une formation ne lève jamais une suspension', async () => {
    const s = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA, { status: AccountStatus.SUSPENDED });
    expect((await api(ctx, 'POST', '/auth/login', { body: { phone: s.phone, password: PASSWORD } })).status).toBe(401);
  });
});

describe('F11 — sessions, OTP et second facteur', () => {
  it('rotation du refresh : la réutilisation d\'un jeton déjà tourné révoque toutes les sessions', async () => {
    const s = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const t1 = await login(ctx, s);
    const r1 = await api(ctx, 'POST', '/auth/refresh', { body: { refreshToken: t1.refreshToken } });
    expect(r1.status).toBe(200);
    // Simule un vol : le premier refresh est rejoué après la fenêtre de grâce
    await ctx.prisma.session.updateMany({ where: { userId: s.id, revokedReason: 'rotated' }, data: { revokedAt: new Date(Date.now() - 60_000) } });
    expect((await api(ctx, 'POST', '/auth/refresh', { body: { refreshToken: t1.refreshToken } })).status).toBe(401);
    expect((await api(ctx, 'POST', '/auth/refresh', { body: { refreshToken: r1.body.refreshToken } })).status).toBe(401);
    expect((await api(ctx, 'GET', '/users/me', { token: r1.body.accessToken })).status).toBe(401);
  });

  it('la déconnexion invalide le jeton d\'accès immédiatement', async () => {
    const s = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const t = await login(ctx, s);
    expect((await api(ctx, 'POST', '/auth/logout', { token: t.accessToken })).status).toBe(200);
    expect((await api(ctx, 'GET', '/users/me', { token: t.accessToken })).status).toBe(401);
  });

  it('les OTP sont aléatoires et stockés sous forme d\'empreinte, jamais en clair', async () => {
    const r = await api(ctx, 'POST', '/auth/otp/request', { body: { phone: '+221790000001' } });
    expect(r.status).toBe(200);
    const row = await ctx.prisma.otpRequest.findFirst({ where: { phone: '+221790000001' } });
    expect(row!.code).not.toBe(r.body.dev_code);
    expect(row!.code).toMatch(/^[0-9a-f]{64}$/);
  });

  it('RETURN_OTP_DEV_CODE est refusé en production', () => {
    expect(() => validateEnv({ ...TEST_ENV, NODE_ENV: 'production', RETURN_OTP_DEV_CODE: 'true' })).toThrow(/interdit en production/);
  });

  it('changer de facteur TOTP exige le code actuel et ne désactive jamais le facteur entre-temps', async () => {
    const maire = await createUser(ctx, Role.MAIRIE, ctx.zones.communeA, { mfa: true });
    const t = await login(ctx, maire);
    expect((await api(ctx, 'POST', '/auth/totp/setup', { token: t.accessToken, body: {} })).status).toBe(401);
    const ok = await api(ctx, 'POST', '/auth/totp/setup', { token: t.accessToken, body: { currentCode: authenticator.generate(maire.totpSecret!) } });
    expect(ok.status).toBe(201);
    const u = await ctx.prisma.user.findUnique({ where: { id: maire.id } });
    expect(u!.totpEnabled).toBe(true);
    expect(u!.totpPendingSecret).not.toBeNull();
  });

  it('5 codes TOTP erronés verrouillent le second facteur', async () => {
    const maire = await createUser(ctx, Role.MAIRIE, ctx.zones.communeA, { mfa: true });
    const r = await api(ctx, 'POST', '/auth/login', { body: { phone: maire.phone, password: PASSWORD } });
    for (let i = 0; i < 5; i++) {
      await ctx.prisma.otpRequest.deleteMany(); // isole du throttling par IP
      await api(ctx, 'POST', '/auth/totp/login', { body: { mfaToken: r.body.mfaToken, code: '000000' } });
    }
    const u = await ctx.prisma.user.findUnique({ where: { id: maire.id } });
    expect(u!.mfaLockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('F10 — limitation de débit effectivement appliquée', () => {
  it('au-delà de 5 tentatives de connexion par minute, le serveur répond 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      statuses.push((await api(ctx, 'POST', '/auth/login', {
        body: { phone: '+221700009999', password: 'faux' },
        headers: { 'x-forwarded-for': '203.0.113.77' },
      })).status);
    }
    expect(statuses).toContain(429);
  });
});
