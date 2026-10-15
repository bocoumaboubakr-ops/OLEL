/**
 * Mode pilote — la CONSULTATION est verrouillée comme l'envoi.
 * Avant : PILOT_RECIPIENT_ALLOWLIST bloquait les messages sortants, mais une
 * alerte d'essai diffusée restait visible du public (application, USSD, bot,
 * temps réel, radios partenaires). Données fictives, aucun fournisseur réel.
 */
import { AlertStatus, AlertStep, Role } from '@prisma/client';
import { io, Socket } from 'socket.io-client';
import { Ctx, TEST_ENV, api, bootApp, createUser, login, resetDb, seedZones } from './harness';
import { makeAlert } from './alert-fixtures';
import { AlertsGateway } from '../../src/alerts/alerts.gateway';
import { SessionService } from '../../src/auth/session.service';

const SECRET = 'secret-rappels-at-test-0123456789';
let ctx: Ctx;
const sockets: Socket[] = [];

beforeAll(async () => { ctx = await bootApp(); process.env.AT_CALLBACK_SECRET = SECRET; });
afterAll(async () => {
  delete process.env.PILOT_RECIPIENT_ALLOWLIST;
  delete process.env.AT_CALLBACK_SECRET;
  await ctx.prisma.$disconnect();
  await ctx.app.close();
});
beforeEach(async () => { delete process.env.PILOT_RECIPIENT_ALLOWLIST; await resetDb(ctx.prisma); await seedZones(ctx); });
afterEach(() => { while (sockets.length) sockets.pop()!.close(); });

/** Une alerte d'exercice diffusée dans la commune A, et les personnes concernées. */
async function scenario() {
  const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
  const equipe = await createUser(ctx, Role.CITOYEN, ctx.zones.communeA);
  const habitant = await createUser(ctx, Role.CITOYEN, ctx.zones.communeA);
  const radio = await createUser(ctx, Role.RADIO_COMMUNAUTAIRE, ctx.zones.kanel);
  const maire = await createUser(ctx, Role.MAIRIE, ctx.zones.communeA, { mfa: true });
  const alert = await makeAlert(ctx, { level: 'ORANGE' as any, zoneId: ctx.zones.communeA, createdById: auteur.id, status: AlertStatus.BROADCAST, step: AlertStep.BROADCAST });
  await ctx.prisma.alert.update({ where: { id: alert.id }, data: { broadcastAt: new Date() } });
  // Le signalement du citoyen lui reste toujours visible
  const sien = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: habitant.id, status: AlertStatus.PENDING, step: AlertStep.SIGNALEMENT });
  return { alert, sien, equipe, habitant, radio, maire };
}

const list = async (u: { id: string; phone: string; role: Role }) => {
  const { accessToken } = await login(ctx, u as any);
  const r = await api(ctx, 'GET', '/alerts', { token: accessToken });
  expect(r.status).toBe(200);
  return r.body as { alerts: { id: string }[]; consultation: string };
};
const ids = async (u: { id: string; phone: string; role: Role }) => (await list(u)).alerts.map((a) => a.id);

const ussd = async (phoneNumber: string, text: string) => {
  const res = await fetch(`${ctx.baseUrl}/ussd/session?key=${SECRET}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '196.201.214.10' },
    body: new URLSearchParams({ sessionId: `ATUid_${Math.random()}`, phoneNumber, text, serviceCode: '*123#' }).toString(),
  });
  return res.text();
};

const bot = (phone: string) => api(ctx, 'GET', `/alerts-bot/active?phone=${encodeURIComponent(phone)}`, { headers: { 'x-bot-api-key': TEST_ENV.BOT_API_KEY } });

async function socketFor(userId: string) {
  const u = await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const token = (await ctx.app.get(SessionService).issue(u, true)).accessToken;
  const socket = io(`${ctx.baseUrl.replace('/api/v1', '')}/alerts`, { transports: ['websocket'], auth: { token }, reconnection: false, forceNew: true });
  sockets.push(socket);
  const events: string[] = [];
  socket.onAny((name) => events.push(name));
  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => setTimeout(resolve, 150));
    socket.on('connect_error', reject);
  });
  return events;
}

describe('Mode pilote — consultation réservée aux numéros autorisés', () => {
  it('application : le citoyen hors liste ne voit plus l\'alerte d\'essai, mais garde ses signalements', async () => {
    const s = await scenario();
    process.env.PILOT_RECIPIENT_ALLOWLIST = s.equipe.phone;
    const ouvert = await list(s.equipe);
    expect(ouvert.alerts.map((a) => a.id)).toContain(s.alert.id);
    expect(ouvert.consultation).toBe('open');
    const ferme = await list(s.habitant);
    expect(ferme.alerts.map((a) => a.id)).not.toContain(s.alert.id);
    expect(ferme.alerts.map((a) => a.id)).toContain(s.sien.id);
    // L'application affiche « phase d'essai », pas « aucune alerte »
    expect(ferme.consultation).toBe('pilot_closed');
    // Lecture directe refusée comme une alerte inexistante
    const { accessToken } = await login(ctx, s.habitant);
    expect((await api(ctx, 'GET', `/alerts/${s.alert.id}`, { token: accessToken })).status).toBe(404);
  });

  it('radio partenaire hors liste : aucune alerte d\'essai à relayer ; inscrite : elle la voit', async () => {
    const s = await scenario();
    process.env.PILOT_RECIPIENT_ALLOWLIST = s.equipe.phone;
    expect(await ids(s.radio)).toEqual([]);
    process.env.PILOT_RECIPIENT_ALLOWLIST = `${s.equipe.phone},${s.radio.phone}`;
    expect(await ids(s.radio)).toEqual([s.alert.id]);
  });

  it('les opérateurs ne sont pas concernés (ils pilotent l\'exercice)', async () => {
    const s = await scenario();
    process.env.PILOT_RECIPIENT_ALLOWLIST = s.equipe.phone;
    const r = await list(s.maire);
    expect(r.alerts.map((a) => a.id)).toContain(s.alert.id);
    expect(r.consultation).toBe('open');
  });

  it('USSD : « phase d\'essai », jamais « aucune alerte » ; numéro autorisé : liste normale', async () => {
    const s = await scenario();
    process.env.PILOT_RECIPIENT_ALLOWLIST = s.equipe.phone;
    const ferme = await ussd(s.habitant.phone, '2');
    expect(ferme).toMatch(/^END Service OLEL en phase d'essai/);
    expect(ferme).not.toMatch(/Aucune alerte/);
    expect(await ussd(s.equipe.phone, '2')).toMatch(/Alertes en vigueur \(1\)/);
  });

  it('bot : 403 PILOT_CONSULTATION_CLOSED hors liste (le bot affiche « phase d\'essai ») ; autorisé : liste', async () => {
    const s = await scenario();
    process.env.PILOT_RECIPIENT_ALLOWLIST = s.equipe.phone;
    const ferme = await bot(s.habitant.phone);
    expect(ferme.status).toBe(403);
    expect(ferme.body.code).toBe('PILOT_CONSULTATION_CLOSED');
    expect((await api(ctx, 'GET', '/alerts-bot/active', { headers: { 'x-bot-api-key': TEST_ENV.BOT_API_KEY } })).status).toBe(403);
    const ouvert = await bot(s.equipe.phone);
    expect(ouvert.status).toBe(200);
    expect(ouvert.body.map((a: any) => a.id)).toEqual([s.alert.id]);
  });

  it('temps réel : l\'événement public ne parvient qu\'aux numéros autorisés', async () => {
    const s = await scenario();
    const radioInscrite = await createUser(ctx, Role.RADIO_COMMUNAUTAIRE, ctx.zones.kanel);
    process.env.PILOT_RECIPIENT_ALLOWLIST = `${s.equipe.phone},${radioInscrite.phone}`;
    const equipe = await socketFor(s.equipe.id);
    const habitant = await socketFor(s.habitant.id);
    const radio = await socketFor(s.radio.id);
    const radio2 = await socketFor(radioInscrite.id);
    await ctx.app.get(AlertsGateway).alertChanged(s.alert.id);
    await new Promise((r) => setTimeout(r, 300));
    expect(equipe).toContain('alert:public');
    expect(radio2).toContain('alert:public');
    expect(habitant).not.toContain('alert:public');
    expect(radio).not.toContain('alert:public');
  });

  it('hors mode pilote : consultation normale pour tous', async () => {
    const s = await scenario();
    expect(await ids(s.habitant)).toContain(s.alert.id);
    expect(await ids(s.radio)).toEqual([s.alert.id]);
    expect((await bot(s.habitant.phone)).status).toBe(200);
    expect(await ussd(s.habitant.phone, '2')).toMatch(/Alertes en vigueur \(1\)/);
  });
});

describe('Radios partenaires — jamais le flux interne', () => {
  it('une radio ne reçoit pas les résumés internes d\'alertes non diffusées, seulement l\'événement public', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const radio = await createUser(ctx, Role.RADIO_COMMUNAUTAIRE, ctx.zones.kanel);
    const events = await socketFor(radio.id);
    const pending = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: auteur.id, status: AlertStatus.PENDING, step: AlertStep.SIGNALEMENT });
    await ctx.app.get(AlertsGateway).alertChanged(pending.id);
    await new Promise((r) => setTimeout(r, 300));
    expect(events).not.toContain('alert:changed');
    const pub = await makeAlert(ctx, { level: 'ORANGE' as any, zoneId: ctx.zones.communeA, createdById: auteur.id, status: AlertStatus.BROADCAST, step: AlertStep.BROADCAST });
    await ctx.app.get(AlertsGateway).alertChanged(pub.id);
    await new Promise((r) => setTimeout(r, 300));
    expect(events).toContain('alert:public');
    expect(events).not.toContain('alert:changed');
  });
});
