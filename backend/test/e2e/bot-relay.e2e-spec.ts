/**
 * Non-régression — réception durable, consentement, livraison
 * (audit F22, F24, F25). Fournisseurs simulés, données fictives.
 */
import { AlertStatus, AlertStep, Role } from '@prisma/client';
import { Ctx, TEST_ENV, api, bootApp, createUser, login, resetDb, seedZones } from './harness';
import { citizenIn, makeAlert, setFlag, waitFinal } from './alert-fixtures';
import { WhatsappService } from '../../src/notifications/channels/whatsapp.service';
import { SmsService } from '../../src/notifications/channels/sms.service';

let ctx: Ctx;
let wa: jest.SpyInstance;
let waTpl: jest.SpyInstance;
let sms: jest.SpyInstance;
let seq = 0;
const bot = { 'x-bot-api-key': TEST_ENV.BOT_API_KEY };
const SECRET = 'secret-rappel-fournisseur-test-0123456789';

beforeAll(async () => { ctx = await bootApp(); process.env.AT_CALLBACK_SECRET = SECRET; });
afterAll(async () => { delete process.env.AT_CALLBACK_SECRET; await ctx.prisma.$disconnect(); await ctx.app.close(); });
beforeEach(async () => {
  await resetDb(ctx.prisma);
  await seedZones(ctx);
  jest.restoreAllMocks();
  wa = jest.spyOn(ctx.app.get(WhatsappService), 'sendMessage').mockImplementation(async () => ({ simulated: false, providerMessageId: `wamid.T${++seq}` }));
  waTpl = jest.spyOn(ctx.app.get(WhatsappService), 'sendTemplate').mockImplementation(async () => ({ simulated: false, providerMessageId: `wamid.TPL${++seq}` }));
  sms = jest.spyOn(ctx.app.get(SmsService), 'sendSms').mockImplementation(async () => ({ simulated: false, providerMessageId: `ATXid_${++seq}` }));
});

async function broadcastTo(zoneId: string, channels: string[] = ['whatsapp', 'sms'], level: 'ORANGE' | 'ROUGE' = 'ROUGE') {
  const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.kanel);
  const prefet = await createUser(ctx, Role.PREFECTURE, ctx.zones.kanel, { mfa: true });
  const a = await makeAlert(ctx, { level: level as any, zoneId, createdById: auteur.id, step: level === 'ROUGE' ? AlertStep.PREFECTURE : AlertStep.MAIRIE });
  const { accessToken } = await login(ctx, prefet);
  const r = await api(ctx, 'POST', `/alerts/${a.id}/broadcast`, { token: accessToken, body: { message: 'Rejoignez l\'école, consigne approuvée.', channels } });
  expect(r.status).toBe(201);
  return waitFinal(ctx, r.body.broadcast.id);
}

describe('F25 — réception durable et dédoublonnée', () => {
  it('un message Meta re-livré n\'est traité qu\'une fois ; un message non abouti peut être repris', async () => {
    const msg = { id: 'wamid.IN1', from: '221770001111', type: 'text', payload: { text: { body: 'bonjour' } } };
    const r1 = await api(ctx, 'POST', '/bot-relay/inbound', { headers: bot, body: msg });
    expect(r1.body.duplicate).toBe(false);
    // Non encore traité : une re-livraison doit pouvoir être retraitée
    expect((await api(ctx, 'POST', '/bot-relay/inbound', { headers: bot, body: msg })).body.duplicate).toBe(false);
    await api(ctx, 'PATCH', '/bot-relay/inbound/wamid.IN1', { headers: bot, body: { status: 'PROCESSED' } });
    expect((await api(ctx, 'POST', '/bot-relay/inbound', { headers: bot, body: msg })).body.duplicate).toBe(true);
    expect(await ctx.prisma.inboundMessage.count()).toBe(1);
  });

  it('messages reçus mais jamais traités : proposés à la reprise', async () => {
    await api(ctx, 'POST', '/bot-relay/inbound', { headers: bot, body: { id: 'wamid.IN2', from: '221770001112', type: 'text', payload: { text: { body: 'x' } } } });
    await ctx.prisma.inboundMessage.update({ where: { id: 'wamid.IN2' }, data: { receivedAt: new Date(Date.now() - 10 * 60_000) } });
    const p = await api(ctx, 'GET', '/bot-relay/inbound/pending', { headers: bot });
    expect(p.body.map((m: any) => m.id)).toEqual(['wamid.IN2']);
  });

  it('les conversations survivent (persistées) et expirent', async () => {
    await api(ctx, 'PUT', '/bot-relay/sessions/221770001113', { headers: bot, body: { state: { step: 'report_desc', lang: 'wo', data: {} } } });
    expect((await api(ctx, 'GET', '/bot-relay/sessions/221770001113', { headers: bot })).body.state.step).toBe('report_desc');
    await ctx.prisma.botSession.update({ where: { phone: '+221770001113' }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await api(ctx, 'GET', '/bot-relay/sessions/221770001113', { headers: bot })).body.state).toBeNull();
  });

  it('sans clé API du bot : refusé', async () => {
    expect((await api(ctx, 'POST', '/bot-relay/inbound', { body: { id: 'x', from: '221770000000', type: 'text', payload: { a: 1 } } })).status).toBe(401);
  });
});

describe('F24 — consentement, désabonnement, fenêtre de 24 h', () => {
  it('sans consentement WhatsApp : WhatsApp non utilisé (motif visible), repli SMS', async () => {
    const c = await citizenIn(ctx, ctx.zones.communeA, 'fr', { waOptIn: false });
    const b = await broadcastTo(ctx.zones.communeA);
    expect(wa).not.toHaveBeenCalled();
    expect(sms.mock.calls.map((x) => x[0])).toContain(c.phone);
    const row = await ctx.prisma.broadcastDelivery.findFirst({ where: { broadcastId: b.id, recipient: c.phone, channel: 'whatsapp' } });
    expect(row!.status).toBe('SKIPPED');
    expect(row!.error).toMatch(/consentement/);
  });

  it('STOP via le bot : plus aucun message ; nouvel accord : de nouveau destinataire', async () => {
    const c = await citizenIn(ctx, ctx.zones.communeA);
    expect((await api(ctx, 'POST', '/bot-relay/consent', { headers: bot, body: { phone: c.phone, choice: 'OPT_OUT' } })).status).toBe(200);
    await broadcastTo(ctx.zones.communeA);
    expect(wa).not.toHaveBeenCalled();
    expect(sms).not.toHaveBeenCalled();
    await api(ctx, 'POST', '/bot-relay/consent', { headers: bot, body: { phone: c.phone, choice: 'OPT_IN_AGAIN' } });
    expect((await api(ctx, 'GET', `/bot-relay/consent?phone=${encodeURIComponent(c.phone)}`, { headers: bot })).body).toMatchObject({ optedOut: false, whatsappOptIn: true });
  });

  it('hors fenêtre de 24 h sans modèle activé : pas de texte libre WhatsApp, motif visible', async () => {
    const c = await citizenIn(ctx, ctx.zones.communeA, 'fr', { windowOpen: false });
    const b = await broadcastTo(ctx.zones.communeA, ['whatsapp']);
    expect(wa).not.toHaveBeenCalled();
    expect(waTpl).not.toHaveBeenCalled();
    const row = await ctx.prisma.broadcastDelivery.findFirst({ where: { broadcastId: b.id, recipient: c.phone } });
    expect(row!.error).toMatch(/24 h/);
    expect(b.status).toBe('FAILED');
    expect(b.lastError).toMatch(/sans canal autorisé/);
  });

  it('hors fenêtre, modèles activés : modèle approuvé avec les paramètres figés à la décision', async () => {
    const c = await citizenIn(ctx, ctx.zones.communeA, 'wo', { windowOpen: false });
    await setFlag(ctx, 'whatsapp_templates', true);
    const b = await broadcastTo(ctx.zones.communeA, ['whatsapp']);
    expect(wa).not.toHaveBeenCalled();
    const call = waTpl.mock.calls.find((x) => x[0] === c.phone)!;
    const frozen = (b.payload as any).templates.wo;
    expect(call[1]).toBe('alert_level_3_wo');
    expect(call[3]).toEqual(frozen.params);
    expect(frozen.params[2]).toContain('consigne approuvée');
  });

  it('un message entrant ouvre la fenêtre de 24 h du citoyen', async () => {
    const c = await citizenIn(ctx, ctx.zones.communeA, 'fr', { windowOpen: false });
    await api(ctx, 'POST', '/bot-relay/inbound', { headers: bot, body: { id: 'wamid.W1', from: c.phone.slice(1), type: 'text', payload: { text: { body: 'menu' } } } });
    const u = await ctx.prisma.user.findUnique({ where: { id: c.id } });
    expect(Date.now() - u!.lastWhatsappInboundAt!.getTime()).toBeLessThan(60_000);
  });
});

describe('F22 — « livré » et « lu » uniquement sur confirmation du fournisseur', () => {
  it('statuts WhatsApp : progression monotone, compteur livré mis à jour', async () => {
    const c = await citizenIn(ctx, ctx.zones.communeA);
    const b = await broadcastTo(ctx.zones.communeA, ['whatsapp']);
    expect(b.deliveredCount).toBe(0);
    const row = await ctx.prisma.broadcastDelivery.findFirst({ where: { broadcastId: b.id, recipient: c.phone } });
    const id = row!.providerMessageId!;
    const send = (status: string) => api(ctx, 'POST', '/bot-relay/whatsapp-statuses', { headers: bot, body: { statuses: [{ providerMessageId: id, status, timestamp: Math.floor(Date.now() / 1000) }] } });
    await send('delivered');
    await send('read');
    await send('delivered'); // re-livraison tardive : pas de retour en arrière
    const after = await ctx.prisma.broadcastDelivery.findUnique({ where: { id: row!.id } });
    expect(after!.status).toBe('READ');
    expect(after!.deliveredAt).not.toBeNull();
    expect(after!.readAt).not.toBeNull();
    expect((await ctx.prisma.broadcast.findUnique({ where: { id: b.id } }))!.deliveredCount).toBe(1);
  });

  it('rapport de remise SMS (Africa\'s Talking) : authentifié, livré ou échec avec motif', async () => {
    const c = await citizenIn(ctx, ctx.zones.communeA, 'fr', { waOptIn: false });
    const b = await broadcastTo(ctx.zones.communeA, ['sms']);
    const row = await ctx.prisma.broadcastDelivery.findFirst({ where: { broadcastId: b.id, recipient: c.phone, channel: 'sms' } });
    const form = (key: string | null, body: Record<string, string>) => fetch(`${ctx.baseUrl}/providers/sms/delivery-report${key ? `?key=${key}` : ''}`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '196.201.214.11' }, body: new URLSearchParams(body).toString(),
    });
    expect((await form(null, { id: row!.providerMessageId!, status: 'Success' })).status).toBe(401);
    expect((await form(SECRET, { id: row!.providerMessageId!, status: 'Failed', failureReason: 'AbsentSubscriber' })).status).toBe(200);
    const failed = await ctx.prisma.broadcastDelivery.findUnique({ where: { id: row!.id } });
    expect(failed!.status).toBe('FAILED');
    expect(failed!.error).toBe('AbsentSubscriber');
  });
});

describe('F16 — consultation WhatsApp cloisonnée par la zone du citoyen', () => {
  it('le bot ne liste que les alertes concernant la commune du citoyen', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const c = await citizenIn(ctx, ctx.zones.communeB);
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: auteur.id, status: AlertStatus.BROADCAST, step: AlertStep.BROADCAST });
    const bAlert = await makeAlert(ctx, { zoneId: ctx.zones.communeB, createdById: auteur.id, status: AlertStatus.BROADCAST, step: AlertStep.BROADCAST });
    const r = await api(ctx, 'GET', `/alerts-bot/active?phone=${encodeURIComponent(c.phone)}`, { headers: bot });
    expect(r.body.map((x: any) => x.id)).toEqual([bAlert.id]);
    expect(r.body.map((x: any) => x.id)).not.toContain(a.id);
  });
});
