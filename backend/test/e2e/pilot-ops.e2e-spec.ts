/**
 * Mise en service progressive : mode pilote, rectificatif et retrait d'une
 * alerte (décision D11), suivi des remises. Fournisseurs simulés, données fictives.
 */
import { AlertStatus, AlertStep, Role } from '@prisma/client';
import { Ctx, api, bootApp, createUser, login, resetDb, seedZones } from './harness';
import { citizenIn, makeAlert, waitFinal } from './alert-fixtures';
import { WhatsappService } from '../../src/notifications/channels/whatsapp.service';
import { SmsService } from '../../src/notifications/channels/sms.service';

let ctx: Ctx;
let wa: jest.SpyInstance;
let seq = 0;

beforeAll(async () => { ctx = await bootApp(); });
afterAll(async () => { delete process.env.PILOT_RECIPIENT_ALLOWLIST; await ctx.prisma.$disconnect(); await ctx.app.close(); });
beforeEach(async () => {
  delete process.env.PILOT_RECIPIENT_ALLOWLIST;
  await resetDb(ctx.prisma);
  await seedZones(ctx);
  jest.restoreAllMocks();
  wa = jest.spyOn(ctx.app.get(WhatsappService), 'sendMessage').mockImplementation(async () => ({ simulated: false, providerMessageId: `wamid.P${++seq}` }));
  jest.spyOn(ctx.app.get(SmsService), 'sendSms').mockImplementation(async () => ({ simulated: false, providerMessageId: `ATXid_P${++seq}` }));
});

/** Alerte ORANGE diffusée par une mairie (MFA), prête pour rectificatif/retrait. */
async function diffused(opts: { citizens?: number } = {}) {
  const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.kanel);
  const maire = await createUser(ctx, Role.MAIRIE, ctx.zones.communeA, { mfa: true });
  // La mairie réside dans la zone : destinataire comme les habitants (avec son accord)
  await ctx.prisma.user.update({ where: { id: maire.id }, data: { lastWhatsappInboundAt: new Date(), consents: { create: { whatsappOptInAt: new Date() } } } });
  const citizens: { phone: string }[] = [{ phone: maire.phone }];
  for (let i = 0; i < (opts.citizens ?? 2); i++) citizens.push(await citizenIn(ctx, ctx.zones.communeA));
  const a = await makeAlert(ctx, { level: 'ORANGE' as any, zoneId: ctx.zones.communeA, createdById: auteur.id, step: AlertStep.MAIRIE });
  const t = await login(ctx, maire);
  const r = await api(ctx, 'POST', `/alerts/${a.id}/broadcast`, { token: t.accessToken, body: { message: 'Consigne initiale : éloignez-vous du fleuve.', channels: ['whatsapp'] } });
  expect(r.status).toBe(201);
  await waitFinal(ctx, r.body.broadcast.id);
  return { alert: a, maire, token: t.accessToken, citizens, primaryId: r.body.broadcast.id as string };
}

describe('Mode pilote — verrou serveur', () => {
  it('seuls les numéros autorisés reçoivent ; les autres sont « hors liste », visible dans le suivi', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.kanel);
    const maire = await createUser(ctx, Role.MAIRIE, ctx.zones.communeA, { mfa: true });
    const equipe = await citizenIn(ctx, ctx.zones.communeA);
    const habitant = await citizenIn(ctx, ctx.zones.communeA);
    process.env.PILOT_RECIPIENT_ALLOWLIST = `${equipe.phone}, +221700000000`;
    const a = await makeAlert(ctx, { level: 'ORANGE' as any, zoneId: ctx.zones.communeA, createdById: auteur.id, step: AlertStep.MAIRIE });
    const { accessToken } = await login(ctx, maire);
    const info = await api(ctx, 'GET', '/system/info', { token: accessToken });
    expect(info.body).toMatchObject({ pilotMode: true, allowlistSize: 2 });
    const r = await api(ctx, 'POST', `/alerts/${a.id}/broadcast`, { token: accessToken, body: { message: 'Exercice pilote', channels: ['whatsapp', 'sms'] } });
    const b = await waitFinal(ctx, r.body.broadcast.id);
    expect(wa.mock.calls.map((c) => c[0])).toEqual([equipe.phone]);
    const skipped = await ctx.prisma.broadcastDelivery.findMany({ where: { broadcastId: b.id, recipient: habitant.phone } });
    expect(skipped.length).toBe(2);
    expect(skipped.every((d) => d.status === 'SKIPPED' && /Mode pilote/.test(d.error!))).toBe(true);
    expect(b.status).toBe('PARTIAL');
    const health = await (await fetch(`${ctx.baseUrl}/health/diffusion`)).json();
    expect((health.details ?? health.checks?.details).providers.pilotMode).toBe(true);
  });

  it('sans liste, fonctionnement normal', async () => {
    const { citizens } = await diffused();
    expect(wa.mock.calls.map((c) => c[0]).sort()).toEqual(citizens.map((c) => c.phone).sort());
  });
});

describe('D11 — rectificatif', () => {
  it('mêmes destinataires et canaux, mention RECTIFICATIF, texte approuvé exact ; rectificatifs successifs', async () => {
    const { alert, token, citizens } = await diffused();
    wa.mockClear();
    const r = await api(ctx, 'POST', `/alerts/${alert.id}/correction`, { token, body: { message: 'Rectificatif : le point de regroupement est l\'école, pas la mosquée.' } });
    expect(r.status).toBe(201);
    const b = await waitFinal(ctx, r.body.broadcast.id);
    expect(b.kind).toBe('CORRECTION');
    expect(b.status).toBe('DONE');
    const sent = wa.mock.calls.map((c) => c[1] as string);
    expect(sent.length).toBe(citizens.length);
    expect(sent[0]).toMatch(/RECTIFICATIF — remplace le message précédent/);
    expect(sent[0]).toContain('le point de regroupement est l\'école');
    const r2 = await api(ctx, 'POST', `/alerts/${alert.id}/correction`, { token, body: { message: 'Second rectificatif : horaires prolongés jusqu\'à 20 h.' } });
    expect(r2.status).toBe(201);
    expect((await ctx.prisma.broadcast.findMany({ where: { alertId: alert.id, kind: 'CORRECTION' } })).map((x) => x.sequence).sort()).toEqual([1, 2]);
  });

  it('refusé pour une alerte non diffusée, ou par un rôle insuffisant', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.kanel);
    const maire = await createUser(ctx, Role.MAIRIE, ctx.zones.communeA, { mfa: true });
    const coord = await createUser(ctx, Role.COORDINATEUR, ctx.zones.communeA);
    const a = await makeAlert(ctx, { level: 'ORANGE' as any, zoneId: ctx.zones.communeA, createdById: auteur.id });
    const tm = await login(ctx, maire);
    expect((await api(ctx, 'POST', `/alerts/${a.id}/correction`, { token: tm.accessToken, body: { message: 'Texte de rectificatif assez long' } })).status).toBe(403);
    const { alert } = await diffused();
    const tc = await login(ctx, coord);
    expect((await api(ctx, 'POST', `/alerts/${alert.id}/correction`, { token: tc.accessToken, body: { message: 'Texte de rectificatif assez long' } })).status).toBe(403);
  });
});

describe('D11 — retrait d\'une fausse alerte', () => {
  it('alerte annulée (plus en vigueur), message ALERTE ANNULÉE aux mêmes destinataires, motif tracé', async () => {
    const { alert, token, citizens } = await diffused();
    wa.mockClear();
    expect((await api(ctx, 'POST', `/alerts/${alert.id}/retract`, { token, body: { reason: 'court' } })).status).toBe(403);
    const r = await api(ctx, 'POST', `/alerts/${alert.id}/retract`, { token, body: { reason: 'Fausse alerte : la montée des eaux était une vidange de barrage programmée.' } });
    expect(r.status).toBe(201);
    const b = await waitFinal(ctx, r.body.broadcast.id);
    expect(b.kind).toBe('RETRACTION');
    expect(b.status).toBe('DONE');
    const sent = wa.mock.calls.map((c) => c[1] as string);
    expect(sent.length).toBe(citizens.length);
    expect(sent[0]).toMatch(/^\[OLEL\] ALERTE ANNULÉE/);
    expect(sent[0]).not.toMatch(/PRÉ-ALERTE|URGENCE/);
    const after = await ctx.prisma.alert.findUnique({ where: { id: alert.id } });
    expect(after!.status).toBe(AlertStatus.CANCELLED);
    expect(after!.retractionReason).toMatch(/vidange/);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'alert.retract', resourceId: alert.id } })).toBe(1);
    // Plus listée comme alerte en vigueur (bot/USSD)
    const pub = await api(ctx, 'GET', '/alerts-bot/active', { headers: { 'x-bot-api-key': process.env.BOT_API_KEY! } });
    expect(pub.body.map((x: any) => x.id)).not.toContain(alert.id);
    // Un second retrait ou un rectificatif ensuite : refusés
    expect((await api(ctx, 'POST', `/alerts/${alert.id}/retract`, { token, body: { reason: 'Encore une fois, motif suffisamment long' } })).status).toBe(403);
    expect((await api(ctx, 'POST', `/alerts/${alert.id}/correction`, { token, body: { message: 'Rectificatif après retrait' } })).status).toBe(403);
  });

  it('un retrait pendant la diffusion principale interrompt les envois restants', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.kanel);
    const maire = await createUser(ctx, Role.MAIRIE, ctx.zones.communeA, { mfa: true });
    for (let i = 0; i < 45; i++) await citizenIn(ctx, ctx.zones.communeA);
    const a = await makeAlert(ctx, { level: 'ORANGE' as any, zoneId: ctx.zones.communeA, createdById: auteur.id, step: AlertStep.MAIRIE });
    let calls = 0;
    // Le fournisseur simulé est lent : le retrait arrive pendant l'envoi
    wa.mockImplementation(async () => { calls++; await new Promise((r) => setTimeout(r, 40)); return { simulated: false, providerMessageId: `wamid.S${calls}` }; });
    const { accessToken } = await login(ctx, maire);
    const r = await api(ctx, 'POST', `/alerts/${a.id}/broadcast`, { token: accessToken, body: { message: 'Consigne', channels: ['whatsapp'] } });
    for (let i = 0; i < 100 && calls < 5; i++) await new Promise((res) => setTimeout(res, 20));
    await api(ctx, 'POST', `/alerts/${a.id}/retract`, { token: accessToken, body: { reason: 'Fausse alerte confirmée par les services techniques' } });
    const primary = await waitFinal(ctx, r.body.broadcast.id, 30000);
    expect(primary.status).toBe('CANCELLED');
    expect(primary.lastError).toMatch(/interrompue après/);
    const sentPrimary = await ctx.prisma.broadcastDelivery.count({ where: { broadcastId: primary.id, status: 'SENT' } });
    expect(sentPrimary).toBeLessThan(45);
  });
});

describe('Suivi des remises (tableau de bord)', () => {
  it('diffusions par alerte avec répartition par canal et statut ; remises avec numéros masqués ; cloisonné', async () => {
    const { alert, token, primaryId, citizens } = await diffused();
    const rows = await api(ctx, 'GET', `/alerts/${alert.id}/broadcasts`, { token });
    expect(rows.status).toBe(200);
    const primary = rows.body.find((b: any) => b.id === primaryId);
    expect(primary.kind).toBe('PRIMARY');
    expect(primary.byChannel.whatsapp.SENT).toBe(citizens.length);
    const d = await api(ctx, 'GET', `/alerts/broadcasts/${primaryId}/deliveries`, { token });
    expect(d.body.total).toBe(citizens.length);
    expect(d.body.items[0].recipient).toMatch(/^\+\d{5}\*{4}\d{2}$/);
    expect(JSON.stringify(d.body)).not.toContain(citizens[0].phone);
    const voisin = await createUser(ctx, Role.MAIRIE, ctx.zones.communeB, { mfa: true });
    const tv = await login(ctx, voisin);
    expect((await api(ctx, 'GET', `/alerts/${alert.id}/broadcasts`, { token: tv.accessToken })).status).toBe(404);
    expect((await api(ctx, 'GET', `/alerts/broadcasts/${primaryId}/deliveries`, { token: tv.accessToken })).status).toBe(404);
  });

  it('les actions rectificatif et retrait sont annoncées par le serveur', async () => {
    const { alert, token } = await diffused();
    const detail = await api(ctx, 'GET', `/alerts/${alert.id}`, { token });
    expect(detail.body.actions.correction.allowed).toBe(true);
    expect(detail.body.actions.retract.allowed).toBe(true);
    expect(detail.body.actions.minRetractionReason).toBe(20);
  });
});
