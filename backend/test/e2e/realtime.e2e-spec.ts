/**
 * Non-régression — flux temps réel (audit F02).
 * Avant correction : connexion anonyme acceptée, abonnement libre à n'importe
 * quelle zone (`join:zone`), diffusion globale du contenu complet des alertes.
 */
import { AccountStatus, AlertStatus, AlertStep, Role } from '@prisma/client';
import { io, Socket } from 'socket.io-client';
import { JwtService } from '@nestjs/jwt';
import { Ctx, TEST_ENV, bootApp, createUser, resetDb, seedZones } from './harness';
import { makeAlert } from './alert-fixtures';
import { AlertsGateway } from '../../src/alerts/alerts.gateway';
import { SessionService } from '../../src/auth/session.service';
import { UsersService } from '../../src/users/users.service';

let ctx: Ctx;
let origin: string;
const sockets: Socket[] = [];

beforeAll(async () => {
  ctx = await bootApp();
  origin = ctx.baseUrl.replace('/api/v1', '');
});
afterAll(async () => { await ctx.prisma.$disconnect(); await ctx.app.close(); });
beforeEach(async () => { await resetDb(ctx.prisma); await seedZones(ctx); });
afterEach(() => { while (sockets.length) sockets.pop()!.close(); });

/** Jeton d'accès réel émis par le service de sessions (même chemin que /auth/login). */
async function tokenFor(userId: string, mfa = true) {
  const u = await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return (await ctx.app.get(SessionService).issue(u, mfa)).accessToken;
}

interface Probe { socket: Socket; events: { name: string; data: any }[]; disconnected: Promise<string> }

function connect(token?: string): Promise<Probe> {
  const socket = io(`${origin}/alerts`, { transports: ['websocket'], auth: token ? { token } : {}, reconnection: false, forceNew: true });
  sockets.push(socket);
  const events: Probe['events'] = [];
  socket.onAny((name, data) => events.push({ name, data }));
  const disconnected = new Promise<string>((r) => socket.on('disconnect', (reason) => r(reason)));
  return new Promise((resolve, reject) => {
    socket.on('connect', () => setTimeout(() => resolve({ socket, events, disconnected }), 150)); // laisser le serveur attribuer les salles
    socket.on('connect_error', reject);
  });
}

const settle = () => new Promise((r) => setTimeout(r, 300));
const gateway = () => ctx.app.get(AlertsGateway);

describe('F02 — connexion authentifiée', () => {
  it('sans jeton : connexion coupée par le serveur', async () => {
    const p = await connect();
    expect(await p.disconnected).toBe('io server disconnect');
  });

  it('jeton forgé (mauvaise clé) : connexion coupée', async () => {
    const u = await createUser(ctx, Role.MAIRIE, ctx.zones.communeA);
    const forged = new JwtService({ secret: 'pas-la-bonne-cle-0123456789-abcdefgh' })
      .sign({ sub: u.id, sid: 'x', tv: 0, typ: 'access', mfa: true });
    const p = await connect(forged);
    expect(await p.disconnected).toBe('io server disconnect');
  });

  it('jeton de rafraîchissement ou MFA intermédiaire refusé', async () => {
    const u = await createUser(ctx, Role.MAIRIE, ctx.zones.communeA);
    const pending = new JwtService({ secret: TEST_ENV.JWT_SECRET }).sign({ sub: u.id, tv: 0, typ: 'mfa_pending' });
    const p = await connect(pending);
    expect(await p.disconnected).toBe('io server disconnect');
  });
});

describe('F02 — cloisonnement territorial et contenu minimal', () => {
  it('seuls les opérateurs du territoire reçoivent le résumé interne, sans description', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const opA = await createUser(ctx, Role.COORDINATEUR, ctx.zones.communeA);
    const opB = await createUser(ctx, Role.COORDINATEUR, ctx.zones.communeB);
    const prefet = await createUser(ctx, Role.PREFECTURE, ctx.zones.kanel, { mfa: true });
    const prefetAutre = await createUser(ctx, Role.PREFECTURE, ctx.zones.matamDept, { mfa: true });
    const citoyenA = await createUser(ctx, Role.CITOYEN, ctx.zones.communeA);
    const [pA, pB, pK, pM, pC] = await Promise.all([
      connect(await tokenFor(opA.id)), connect(await tokenFor(opB.id)), connect(await tokenFor(prefet.id)),
      connect(await tokenFor(prefetAutre.id)), connect(await tokenFor(citoyenA.id)),
    ]);

    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: auteur.id, status: AlertStatus.PENDING, step: AlertStep.SIGNALEMENT });
    await gateway().alertChanged(a.id);
    await settle();

    const changed = (p: Probe) => p.events.filter((e) => e.name === 'alert:changed');
    expect(changed(pA)).toHaveLength(1);
    expect(changed(pK)).toHaveLength(1); // le département contient la commune
    expect(changed(pB)).toHaveLength(0); // commune voisine
    expect(changed(pM)).toHaveLength(0); // autre département
    expect(pC.events).toHaveLength(0);   // citoyen : rien tant que non diffusée
    const summary = changed(pA)[0].data;
    expect(summary.id).toBe(a.id);
    expect(summary).not.toHaveProperty('description');
    expect(summary).not.toHaveProperty('latitude');
    expect(summary).not.toHaveProperty('mediaUrls');
    expect(summary).not.toHaveProperty('createdById');
  });

  it('un citoyen reçoit l\'alerte publique seulement si elle est diffusée sur sa zone', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const cA = await createUser(ctx, Role.CITOYEN, ctx.zones.communeA);
    const cB = await createUser(ctx, Role.CITOYEN, ctx.zones.communeB);
    const [pA, pB] = await Promise.all([connect(await tokenFor(cA.id)), connect(await tokenFor(cB.id))]);
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: auteur.id, status: AlertStatus.BROADCAST, step: AlertStep.BROADCAST });
    await ctx.prisma.alert.update({ where: { id: a.id }, data: { broadcastAt: new Date() } });
    await gateway().alertChanged(a.id);
    await settle();
    expect(pA.events.filter((e) => e.name === 'alert:public')).toHaveLength(1);
    expect(pB.events.filter((e) => e.name === 'alert:public')).toHaveLength(0);
    expect(pA.events.filter((e) => e.name === 'alert:changed')).toHaveLength(0);
  });

  it('l\'abonnement manuel à une autre zone est refusé', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const opB = await createUser(ctx, Role.COORDINATEUR, ctx.zones.communeB);
    const pB = await connect(await tokenFor(opB.id));
    pB.socket.emit('join:zone', ctx.zones.communeA);
    await settle();
    expect(pB.events.some((e) => e.name === 'error')).toBe(true);
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: auteur.id, status: AlertStatus.PENDING, step: AlertStep.SIGNALEMENT });
    await gateway().alertChanged(a.id);
    await settle();
    expect(pB.events.filter((e) => e.name === 'alert:changed')).toHaveLength(0);
  });

  it('un compte en formation est connecté mais ne reçoit aucun événement', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const novice = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA, { status: AccountStatus.IN_TRAINING });
    const p = await connect(await tokenFor(novice.id));
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: auteur.id, status: AlertStatus.PENDING, step: AlertStep.SIGNALEMENT });
    await gateway().alertChanged(a.id);
    await settle();
    expect(p.events.filter((e) => e.name.startsWith('alert:'))).toHaveLength(0);
  });
});

describe('F02/F07 — révocation', () => {
  it('après suspension, la revalidation coupe la connexion existante', async () => {
    const admin = await createUser(ctx, Role.SUPER_ADMIN, ctx.zones.matam, { mfa: true });
    const op = await createUser(ctx, Role.COORDINATEUR, ctx.zones.communeA);
    const p = await connect(await tokenFor(op.id));
    await ctx.app.get(UsersService).update(op.id, { status: AccountStatus.SUSPENDED } as any, { id: admin.id, role: Role.SUPER_ADMIN, zoneId: ctx.zones.matam } as any);
    await (gateway() as any).revalidateAll();
    expect(await p.disconnected).toBe('io server disconnect');
  });
});
