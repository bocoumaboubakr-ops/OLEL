/**
 * Non-régression — chaîne de diffusion (audit F03, F04, F05, F17, F22, F23).
 * Vraie application, vrai worker Bull/Redis, fournisseurs SIMULÉS (espions) :
 * aucun message réel n'est envoyé.
 */
import { AlertLevel, AlertStatus, AlertStep, Role, SignalementStatus } from '@prisma/client';
import { Ctx, api, bootApp, createUser, login, resetDb, seedZones } from './harness';
import { citizenIn, makeAlert, setFlag, waitFinal } from './alert-fixtures';
import { AlertsService } from '../../src/alerts/alerts.service';
import { AlertsScheduler } from '../../src/common/scheduler/alerts.scheduler';
import { WhatsappService } from '../../src/notifications/channels/whatsapp.service';
import { SmsService } from '../../src/notifications/channels/sms.service';
import { BroadcastDispatcher } from '../../src/notifications/broadcast-dispatcher.service';

let ctx: Ctx;
let wa: jest.SpyInstance;
let sms: jest.SpyInstance;
let seq = 0;

beforeAll(async () => { ctx = await bootApp(); });
afterAll(async () => { await ctx.prisma.$disconnect(); await ctx.app.close(); });
beforeEach(async () => {
  await resetDb(ctx.prisma);
  await seedZones(ctx);
  jest.restoreAllMocks();
  // Fournisseurs simulés : capturent le texte exact, renvoient un identifiant fictif
  wa = jest.spyOn(ctx.app.get(WhatsappService), 'sendMessage').mockImplementation(async () => ({ simulated: false, providerMessageId: `wamid.test.${++seq}` }));
  sms = jest.spyOn(ctx.app.get(SmsService), 'sendSms').mockImplementation(async () => ({ simulated: false, providerMessageId: `ATX.test.${++seq}` }));
});

const primaryOf = (alertId: string) => ctx.prisma.broadcast.findFirst({ where: { alertId, kind: 'PRIMARY' } });

describe('F03 — aucune diffusion automatique d\'une alerte rejetée, annulée ou clôturée', () => {
  it('une alerte ROUGE rejetée n\'est jamais auto-escaladée, même indicateur activé', async () => {
    const maire = await createUser(ctx, Role.MAIRIE, ctx.zones.communeA);
    const prefet = await createUser(ctx, Role.PREFECTURE, ctx.zones.kanel, { mfa: true });
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: maire.id, step: AlertStep.MAIRIE, verifiedAt: new Date(Date.now() - 3600_000) });
    const { accessToken } = await login(ctx, prefet);
    expect((await api(ctx, 'POST', `/alerts/${a.id}/advance`, { token: accessToken, body: { action: 'REJECTED', comment: 'fausse alerte' } })).status).toBe(201);

    await setFlag(ctx, 'auto_escalation_red', true);
    expect(await ctx.app.get(AlertsService).autoEscalateStale()).toBe(0);
    expect((await ctx.prisma.alert.findUnique({ where: { id: a.id } }))!.status).toBe(AlertStatus.REJECTED);
    expect(await primaryOf(a.id)).toBeNull();
  });

  it('une alerte auto-clôturée passe à l\'étape CLOSED et n\'est jamais reprise', async () => {
    const maire = await createUser(ctx, Role.MAIRIE, ctx.zones.communeA);
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: maire.id, verifiedAt: new Date(Date.now() - 3 * 86400_000) });
    await ctx.prisma.$executeRaw`UPDATE alerts SET "updatedAt" = now() - interval '3 days' WHERE id = ${a.id}`;
    await ctx.app.get(AlertsScheduler).autoCloseStaleAlerts();
    const closed = await ctx.prisma.alert.findUnique({ where: { id: a.id } });
    expect(closed!.status).toBe(AlertStatus.CLOSED);
    expect(closed!.currentStep).toBe(AlertStep.CLOSED);

    await setFlag(ctx, 'auto_escalation_red', true);
    expect(await ctx.app.get(AlertsService).autoEscalateStale()).toBe(0);
    expect(await primaryOf(a.id)).toBeNull();
  });

  it('par défaut (indicateur désactivé) aucun automatisme ne diffuse', async () => {
    const maire = await createUser(ctx, Role.MAIRIE, ctx.zones.communeA);
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: maire.id, verifiedAt: new Date(Date.now() - 3600_000) });
    expect(await ctx.app.get(AlertsService).autoEscalateStale()).toBe(0);
    expect(await primaryOf(a.id)).toBeNull();
  });

  it('activée, l\'auto-escalade d\'une alerte éligible part UNE fois, marquée « non confirmée »', async () => {
    const maire = await createUser(ctx, Role.MAIRIE, ctx.zones.communeA);
    await citizenIn(ctx, ctx.zones.communeA);
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: maire.id, verifiedAt: new Date(Date.now() - 3600_000), validators: [maire.id] });
    await setFlag(ctx, 'auto_escalation_red', true);
    const svc = ctx.app.get(AlertsService);
    const [n1, n2] = await Promise.all([svc.autoEscalateStale(), svc.autoEscalateStale()]);
    expect(n1 + n2).toBe(1);
    expect(await ctx.prisma.broadcast.count({ where: { alertId: a.id, kind: 'PRIMARY' } })).toBe(1);
    const b = await primaryOf(a.id);
    expect(b!.certainty).toBe('UNCONFIRMED_AUTO');
    expect((b!.payload as any).fr).toMatch(/NON CONFIRMÉE PAR L'AUTORITÉ/);
    await waitFinal(ctx, b!.id);
    expect(wa.mock.calls[0][1]).toBe((b!.payload as any).fr);
  });
});

describe('F05 — règles de confirmation appliquées sur tous les chemins', () => {
  it('MAIRIE ne diffuse pas une alerte ROUGE confirmée (PRÉFECTURE minimum)', async () => {
    const maire = await createUser(ctx, Role.MAIRIE, ctx.zones.communeA, { mfa: true });
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: maire.id, step: AlertStep.PREFECTURE });
    const { accessToken } = await login(ctx, maire);
    const r = await api(ctx, 'POST', `/alerts/${a.id}/broadcast`, { token: accessToken, body: { message: 'Évacuez' } });
    expect(r.status).toBe(403);
    expect(await primaryOf(a.id)).toBeNull();
  });

  it('une alerte rejetée et sous revue médicale n\'est jamais diffusée', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const prefet = await createUser(ctx, Role.PREFECTURE, ctx.zones.kanel, { mfa: true });
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: auteur.id, step: AlertStep.PREFECTURE, status: AlertStatus.REJECTED, requiresMedicalReview: true, type: 'EPIDEMIE' });
    const { accessToken } = await login(ctx, prefet);
    expect((await api(ctx, 'POST', `/alerts/${a.id}/broadcast`, { token: accessToken, body: { message: 'x' } })).status).toBe(403);
    expect((await api(ctx, 'POST', `/alerts/${a.id}/emergency-bypass`, { token: accessToken, body: { justification: 'Situation critique constatée sur place par les pompiers' } })).status).toBe(403);
    expect(await primaryOf(a.id)).toBeNull();
  });

  it('abaisser ROUGE → ORANGE ne permet pas d\'éviter la confirmation', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const maire = await createUser(ctx, Role.MAIRIE, ctx.zones.communeA, { mfa: true });
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: auteur.id, step: AlertStep.MAIRIE, validators: [auteur.id] });
    const { accessToken } = await login(ctx, maire);
    const r = await api(ctx, 'POST', `/alerts/${a.id}/advance`, { token: accessToken, body: { action: 'VALIDATED', alertLevel: 'ORANGE' } });
    // MAIRIE peut proposer ORANGE, mais l'alerte passe quand même par la confirmation préfectorale
    expect(r.status).toBe(201);
    expect(r.body.currentStep).toBe(AlertStep.PREFECTURE);
    expect(r.body.status).toBe(AlertStatus.VALIDATED);
    const after = await ctx.prisma.alert.findUnique({ where: { id: a.id } });
    expect(after!.broadcastAt).toBeNull();
    expect(await primaryOf(a.id)).toBeNull();
  });

  it('une sentinelle ne peut pas rejeter une alerte en attente de confirmation préfectorale', async () => {
    const auteur = await createUser(ctx, Role.MAIRIE, ctx.zones.communeA);
    const sentinelle = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: auteur.id, step: AlertStep.PREFECTURE });
    const { accessToken } = await login(ctx, sentinelle);
    expect((await api(ctx, 'POST', `/alerts/${a.id}/advance`, { token: accessToken, body: { action: 'REJECTED' } })).status).toBe(403);
    expect((await ctx.prisma.alert.findUnique({ where: { id: a.id } }))!.status).toBe(AlertStatus.VALIDATED);
  });

  it('deux personnes distinctes : un validateur précédent ne peut pas déclencher la diffusion ROUGE', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const prefet1 = await createUser(ctx, Role.PREFECTURE, ctx.zones.kanel, { mfa: true });
    const prefet2 = await createUser(ctx, Role.PREFECTURE, ctx.zones.kanel, { mfa: true });
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: auteur.id, step: AlertStep.PREFECTURE, validators: [prefet1.id] });
    const t1 = await login(ctx, prefet1);
    const t2 = await login(ctx, prefet2);
    expect((await api(ctx, 'POST', `/alerts/${a.id}/broadcast`, { token: t1.accessToken, body: { message: 'Évacuez' } })).status).toBe(403);
    expect((await api(ctx, 'POST', `/alerts/${a.id}/broadcast`, { token: t2.accessToken, body: { message: 'Évacuez' } })).status).toBe(201);
  });

  it('épidémie : ni diffusion ni bypass tant que la revue médicale n\'est pas levée', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const maire = await createUser(ctx, Role.MAIRIE, ctx.zones.communeA, { mfa: true });
    const pc = await createUser(ctx, Role.PROTECTION_CIVILE, ctx.zones.matam, { mfa: true });
    const a = await makeAlert(ctx, { level: AlertLevel.ORANGE, zoneId: ctx.zones.communeA, createdById: auteur.id, step: AlertStep.MAIRIE, type: 'EPIDEMIE', requiresMedicalReview: true, validators: [auteur.id] });
    const tm = await login(ctx, maire);
    expect((await api(ctx, 'POST', `/alerts/${a.id}/advance`, { token: tm.accessToken, body: { action: 'VALIDATED' } })).status).toBe(403);
    expect((await api(ctx, 'POST', `/alerts/${a.id}/emergency-bypass`, { token: tm.accessToken, body: { justification: 'Cas groupés de diarrhée signalés au poste de santé' } })).status).toBe(403);
    const tp = await login(ctx, pc);
    expect((await api(ctx, 'POST', `/alerts/${a.id}/medical-clearance`, { token: tp.accessToken })).status).toBe(201);
    expect((await api(ctx, 'POST', `/alerts/${a.id}/advance`, { token: tm.accessToken, body: { action: 'VALIDATED' } })).status).toBe(201);
  });

  it('bypass : justification substantielle, mention « vérification en cours », revue par une autre personne', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const maire = await createUser(ctx, Role.MAIRIE, ctx.zones.communeA, { mfa: true });
    const prefet = await createUser(ctx, Role.PREFECTURE, ctx.zones.kanel, { mfa: true });
    await citizenIn(ctx, ctx.zones.communeA);
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: auteur.id, status: AlertStatus.PENDING, step: AlertStep.SIGNALEMENT });
    const tm = await login(ctx, maire);
    expect((await api(ctx, 'POST', `/alerts/${a.id}/emergency-bypass`, { token: tm.accessToken, body: { justification: 'urgent' } })).status).toBe(403);
    expect((await api(ctx, 'POST', `/alerts/${a.id}/emergency-bypass`, { token: tm.accessToken, body: { justification: 'Digue rompue constatée, eau dans les maisons' } })).status).toBe(201);
    const b = await primaryOf(a.id);
    expect(b!.certainty).toBe('EMERGENCY_BYPASS');
    expect((b!.payload as any).fr).toMatch(/VÉRIFICATION EN COURS/);

    const tp = await login(ctx, prefet);
    const queue = await api(ctx, 'GET', '/alerts/queue', { token: tp.accessToken });
    expect(queue.body.map((x: any) => x.id)).toContain(a.id);
    expect((await api(ctx, 'POST', `/alerts/${a.id}/bypass-review`, { token: tm.accessToken, body: { note: 'auto-revue interdite' } })).status).toBe(403);
    expect((await api(ctx, 'POST', `/alerts/${a.id}/bypass-review`, { token: tp.accessToken, body: { note: 'Constat confirmé par les pompiers' } })).status).toBe(201);
  });
});

describe('F04 — le texte, les zones et les canaux approuvés sont exactement ceux exécutés', () => {
  it('SMS seul vers la commune B : aucun WhatsApp, aucune autre zone, texte identique au texte figé', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const prefet = await createUser(ctx, Role.PREFECTURE, ctx.zones.kanel, { mfa: true });
    const inB = await citizenIn(ctx, ctx.zones.communeB, 'wo');
    const inA = await citizenIn(ctx, ctx.zones.communeA);
    const inC = await citizenIn(ctx, ctx.zones.communeC);
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: auteur.id, step: AlertStep.PREFECTURE });
    const { accessToken } = await login(ctx, prefet);
    const r = await api(ctx, 'POST', `/alerts/${a.id}/broadcast`, {
      token: accessToken,
      body: { message: 'Consigne approuvée : rejoignez l\'école de Commune B.', targetZoneIds: [ctx.zones.communeB], channels: ['sms'] },
    });
    expect(r.status).toBe(201);
    const b = await waitFinal(ctx, r.body.broadcast.id);
    expect(b.status).toBe('DONE');
    expect(wa).not.toHaveBeenCalled();
    const recipients = sms.mock.calls.map((c) => c[0]);
    expect(recipients).toContain(inB.phone);
    expect(recipients).not.toContain(inA.phone);
    expect(recipients).not.toContain(inC.phone);
    const sentText = sms.mock.calls.find((c) => c[0] === inB.phone)![1];
    expect(sentText).toBe((b.payload as any).wo);
    expect(sentText).toContain('Consigne approuvée : rejoignez l\'école de Commune B.');
  });

  it('zone cible hors territoire refusée ; canal non mis en œuvre refusé', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const prefet = await createUser(ctx, Role.PREFECTURE, ctx.zones.kanel, { mfa: true });
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: auteur.id, step: AlertStep.PREFECTURE });
    const { accessToken } = await login(ctx, prefet);
    expect((await api(ctx, 'POST', `/alerts/${a.id}/broadcast`, { token: accessToken, body: { message: 'x', targetZoneIds: [ctx.zones.communeC] } })).status).toBe(403);
    expect((await api(ctx, 'POST', `/alerts/${a.id}/broadcast`, { token: accessToken, body: { message: 'x', channels: ['ivr'] } })).status).toBe(400);
    expect(await primaryOf(a.id)).toBeNull();
  });
});

describe('F17 — validations concurrentes et doubles requêtes', () => {
  it('deux diffusions simultanées : une seule réussit, une seule intention', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const p1 = await createUser(ctx, Role.PREFECTURE, ctx.zones.kanel, { mfa: true });
    const p2 = await createUser(ctx, Role.PREFECTURE, ctx.zones.kanel, { mfa: true });
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: auteur.id, step: AlertStep.PREFECTURE });
    const [t1, t2] = await Promise.all([login(ctx, p1), login(ctx, p2)]);
    const rs = await Promise.all([
      api(ctx, 'POST', `/alerts/${a.id}/broadcast`, { token: t1.accessToken, body: { message: 'A' } }),
      api(ctx, 'POST', `/alerts/${a.id}/broadcast`, { token: t2.accessToken, body: { message: 'B' } }),
    ]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await ctx.prisma.broadcast.count({ where: { alertId: a.id, kind: 'PRIMARY' } })).toBe(1);
  });

  it('rejouer la même clé d\'idempotence renvoie la diffusion existante, sans doublon', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const p = await createUser(ctx, Role.PREFECTURE, ctx.zones.kanel, { mfa: true });
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: auteur.id, step: AlertStep.PREFECTURE });
    const { accessToken } = await login(ctx, p);
    const r1 = await api(ctx, 'POST', `/alerts/${a.id}/broadcast`, { token: accessToken, body: { message: 'A', idempotencyKey: 'cle-1' } });
    const r2 = await api(ctx, 'POST', `/alerts/${a.id}/broadcast`, { token: accessToken, body: { message: 'A', idempotencyKey: 'cle-1' } });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r2.body.broadcast.id).toBe(r1.body.broadcast.id);
    expect(await ctx.prisma.broadcast.count({ where: { alertId: a.id, kind: 'PRIMARY' } })).toBe(1);
  });

  it('deux validations simultanées d\'un signalement ne créent qu\'une alerte', async () => {
    const citoyen = await citizenIn(ctx, ctx.zones.communeA);
    const m1 = await createUser(ctx, Role.PREFECTURE, ctx.zones.kanel, { mfa: true });
    const m2 = await createUser(ctx, Role.PREFECTURE, ctx.zones.kanel, { mfa: true });
    const sg = await ctx.prisma.signalement.create({ data: { userId: citoyen.id, type: 'INONDATION', text: 'eau', channel: 'whatsapp', latitude: 15.6, longitude: -13.2 } });
    const [t1, t2] = await Promise.all([login(ctx, m1), login(ctx, m2)]);
    const rs = await Promise.all([
      api(ctx, 'PATCH', `/signalements/${sg.id}/status`, { token: t1.accessToken, body: { status: 'VALIDATED' } }),
      api(ctx, 'PATCH', `/signalements/${sg.id}/status`, { token: t2.accessToken, body: { status: 'VALIDATED' } }),
    ]);
    expect(rs.filter((r) => r.status === 200).length).toBe(1);
    expect(await ctx.prisma.alert.count()).toBe(1);
    expect((await ctx.prisma.signalement.findUnique({ where: { id: sg.id } }))!.status).toBe(SignalementStatus.VALIDATED);
  });
});

describe('F23 — panne de la file au moment de la décision', () => {
  it('l\'intention reste PENDING, est reprise par le balayage et exécutée une seule fois', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const p = await createUser(ctx, Role.PREFECTURE, ctx.zones.kanel, { mfa: true });
    const c = await citizenIn(ctx, ctx.zones.communeA);
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: auteur.id, step: AlertStep.PREFECTURE });
    const queue = (ctx.app.get(BroadcastDispatcher) as any).queue; // file réellement utilisée par le répartiteur
    const add = jest.spyOn(queue, 'add').mockRejectedValueOnce(new Error('Redis indisponible (simulé)'));
    const { accessToken } = await login(ctx, p);
    const r = await api(ctx, 'POST', `/alerts/${a.id}/broadcast`, { token: accessToken, body: { message: 'Évacuez' } });
    expect(r.status).toBe(201); // la décision est enregistrée
    const pending = await ctx.prisma.broadcast.findUnique({ where: { id: r.body.broadcast.id } });
    expect(pending!.status).toBe('PENDING');
    expect(pending!.lastError).toMatch(/indisponible/);

    add.mockRestore();
    await ctx.app.get(BroadcastDispatcher).sweep();
    const done = await waitFinal(ctx, r.body.broadcast.id);
    expect(done.status).toBe('DONE');
    expect(wa.mock.calls.filter((x) => x[0] === c.phone).length).toBe(1);
  });
});

describe('F22 — échecs fournisseur visibles, reprises sans doublon, simulation distincte', () => {
  it('WhatsApp en échec puis SMS : statut par canal, pas de faux « livré »', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.kanel);
    const p = await createUser(ctx, Role.PREFECTURE, ctx.zones.kanel, { mfa: true });
    const c = await citizenIn(ctx, ctx.zones.communeA);
    wa.mockImplementation(async () => { throw new Error('131047 hors fenêtre 24 h'); });
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: auteur.id, step: AlertStep.PREFECTURE });
    const { accessToken } = await login(ctx, p);
    const r = await api(ctx, 'POST', `/alerts/${a.id}/broadcast`, { token: accessToken, body: { message: 'Évacuez', channels: ['whatsapp', 'sms'] } });
    const b = await waitFinal(ctx, r.body.broadcast.id);
    const rows = await ctx.prisma.broadcastDelivery.findMany({ where: { broadcastId: b.id, recipient: c.phone } });
    expect(rows.find((x) => x.channel === 'whatsapp')!.status).toBe('FAILED');
    expect(rows.find((x) => x.channel === 'whatsapp')!.error).toMatch(/131047/);
    expect(rows.find((x) => x.channel === 'sms')!.status).toBe('SENT');
    expect(b.sentCount).toBe(1);
    expect(b.deliveredCount).toBe(0); // accepté ≠ livré
  });

  it('une reprise ne recontacte jamais un destinataire déjà atteint', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.kanel);
    const c1 = await citizenIn(ctx, ctx.zones.communeA);
    const c2 = await citizenIn(ctx, ctx.zones.communeA);
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: auteur.id, status: AlertStatus.BROADCAST, step: AlertStep.BROADCAST });
    const b = await ctx.prisma.broadcast.create({
      data: { alertId: a.id, authorId: auteur.id, kind: 'PRIMARY', certainty: 'CONFIRMED', message: 'm', payload: { fr: 'm', ff: 'm', wo: 'm', snk: 'm' }, targetZoneIds: [ctx.zones.communeA], channels: ['whatsapp'], idempotencyKey: 'k', status: 'DISPATCHING' },
    });
    wa.mockImplementation(async (to: string) => { if (to === c2.phone) throw new Error('panne'); return { simulated: false, providerMessageId: 'x' }; });
    const { NotificationsProcessor } = await import('../../src/notifications/notifications.processor');
    const proc = ctx.app.get(NotificationsProcessor);
    const job = (attemptsMade: number) => ({ data: { broadcastId: b.id }, attemptsMade, opts: { attempts: 4 }, name: 'dispatch' }) as any;
    await expect(proc.handleDispatch(job(0))).rejects.toThrow(/reprise/);
    wa.mockImplementation(async () => ({ simulated: false, providerMessageId: 'y' }));
    await proc.handleDispatch(job(1));
    expect(wa.mock.calls.filter((x) => x[0] === c1.phone).length).toBe(1);
    expect(wa.mock.calls.filter((x) => x[0] === c2.phone).length).toBe(2);
    expect((await ctx.prisma.broadcast.findUnique({ where: { id: b.id } }))!.status).toBe('DONE');
  });

  it('échec persistant après la dernière tentative : statut FAILED visible avec la cause', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.kanel);
    await citizenIn(ctx, ctx.zones.communeA);
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: auteur.id, status: AlertStatus.BROADCAST, step: AlertStep.BROADCAST });
    const b = await ctx.prisma.broadcast.create({
      data: { alertId: a.id, authorId: auteur.id, kind: 'PRIMARY', certainty: 'CONFIRMED', message: 'm', payload: { fr: 'm' }, targetZoneIds: [ctx.zones.communeA], channels: ['whatsapp'], idempotencyKey: 'k2', status: 'DISPATCHING' },
    });
    wa.mockImplementation(async () => { throw new Error('jeton expiré'); });
    const { NotificationsProcessor } = await import('../../src/notifications/notifications.processor');
    await ctx.app.get(NotificationsProcessor).handleDispatch({ data: { broadcastId: b.id }, attemptsMade: 3, opts: { attempts: 4 }, name: 'dispatch' } as any);
    const f = await ctx.prisma.broadcast.findUnique({ where: { id: b.id } });
    expect(f!.status).toBe('FAILED');
    expect(f!.failedCount).toBe(1);
    expect(f!.lastError).toMatch(/non atteint/);
  });

  it('en simulation, rien n\'est compté comme envoyé', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.kanel);
    await citizenIn(ctx, ctx.zones.communeA);
    wa.mockRestore(); // service réel, sans jeton → simulation explicite
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: auteur.id, status: AlertStatus.BROADCAST, step: AlertStep.BROADCAST });
    const b = await ctx.prisma.broadcast.create({
      data: { alertId: a.id, authorId: auteur.id, kind: 'PRIMARY', certainty: 'CONFIRMED', message: 'm', payload: { fr: 'm' }, targetZoneIds: [ctx.zones.communeA], channels: ['whatsapp'], idempotencyKey: 'k3', status: 'DISPATCHING' },
    });
    const { NotificationsProcessor } = await import('../../src/notifications/notifications.processor');
    await ctx.app.get(NotificationsProcessor).handleDispatch({ data: { broadcastId: b.id }, attemptsMade: 0, opts: { attempts: 4 }, name: 'dispatch' } as any);
    const f = await ctx.prisma.broadcast.findUnique({ where: { id: b.id } });
    expect(f!.simulatedCount).toBe(1);
    expect(f!.sentCount).toBe(0);
  });

  it('une diffusion décidée puis l\'alerte rejetée avant exécution : annulée, rien n\'est envoyé', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    await citizenIn(ctx, ctx.zones.communeA);
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: auteur.id, status: AlertStatus.REJECTED, step: AlertStep.MAIRIE });
    const b = await ctx.prisma.broadcast.create({
      data: { alertId: a.id, authorId: auteur.id, kind: 'PRIMARY', certainty: 'CONFIRMED', message: 'm', payload: { fr: 'm' }, targetZoneIds: [ctx.zones.communeA], channels: ['whatsapp'], idempotencyKey: 'k4', status: 'DISPATCHING' },
    });
    const { NotificationsProcessor } = await import('../../src/notifications/notifications.processor');
    await ctx.app.get(NotificationsProcessor).handleDispatch({ data: { broadcastId: b.id }, attemptsMade: 0, opts: { attempts: 4 }, name: 'dispatch' } as any);
    expect((await ctx.prisma.broadcast.findUnique({ where: { id: b.id } }))!.status).toBe('CANCELLED');
    expect(wa).not.toHaveBeenCalled();
  });
});
