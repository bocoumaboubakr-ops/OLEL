/**
 * Non-régression — cloisonnement et cohérence des parcours
 * (audit F08, F09, F14, F15, F18, F20, F21).
 */
import { AccountStatus, AlertStatus, AlertStep, Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Ctx, api, bootApp, createUser, login, resetDb, seedZones } from './harness';
import { makeAlert } from './alert-fixtures';

let ctx: Ctx;
beforeAll(async () => { ctx = await bootApp(); });
afterAll(async () => { await ctx.prisma.$disconnect(); await ctx.app.close(); });
beforeEach(async () => { await resetDb(ctx.prisma); await seedZones(ctx); });

const diffused = async (zoneId: string, createdById: string, title: string) => {
  const a = await makeAlert(ctx, { zoneId, createdById, status: AlertStatus.BROADCAST, step: AlertStep.BROADCAST });
  return ctx.prisma.alert.update({ where: { id: a.id }, data: { broadcastAt: new Date(), title } });
};

describe('F08 — lectures d\'alertes cloisonnées', () => {
  it('un opérateur ne voit ni ne lit les alertes d\'une commune voisine (404, pas 403)', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const opB = await createUser(ctx, Role.COORDINATEUR, ctx.zones.communeB);
    const prefet = await createUser(ctx, Role.PREFECTURE, ctx.zones.kanel, { mfa: true });
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: auteur.id, status: AlertStatus.PENDING, step: AlertStep.SIGNALEMENT });
    const tB = await login(ctx, opB);
    const list = await api(ctx, 'GET', '/alerts?limit=100', { token: tB.accessToken });
    expect(list.body.alerts.map((x: any) => x.id)).not.toContain(a.id);
    expect((await api(ctx, 'GET', `/alerts/${a.id}`, { token: tB.accessToken })).status).toBe(404);
    expect((await api(ctx, 'GET', `/alerts/${a.id}/history`, { token: tB.accessToken })).status).toBe(404);
    expect((await api(ctx, 'GET', `/alerts/${a.id}/context`, { token: tB.accessToken })).status).toBe(404);
    // Le département contient la commune : lecture autorisée
    const tK = await login(ctx, prefet);
    expect((await api(ctx, 'GET', `/alerts/${a.id}`, { token: tK.accessToken })).status).toBe(200);
  });

  it('un citoyen ne voit que les alertes diffusées concernant sa zone et ses propres signalements, en vue publique', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const citoyen = await createUser(ctx, Role.CITOYEN, ctx.zones.communeA);
    const pubA = await diffused(ctx.zones.communeA, auteur.id, 'Crue A');
    const pubB = await diffused(ctx.zones.communeB, auteur.id, 'Crue B');
    const pending = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: auteur.id, status: AlertStatus.PENDING, step: AlertStep.SIGNALEMENT });
    const mine = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: citoyen.id, status: AlertStatus.PENDING, step: AlertStep.SIGNALEMENT });
    const { accessToken } = await login(ctx, citoyen);
    const ids = (await api(ctx, 'GET', '/alerts?limit=100', { token: accessToken })).body.alerts.map((x: any) => x.id);
    expect(ids).toContain(pubA.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(pubB.id);
    expect(ids).not.toContain(pending.id);
    const detail = await api(ctx, 'GET', `/alerts/${pubA.id}`, { token: accessToken });
    expect(detail.status).toBe(200);
    expect(detail.body).not.toHaveProperty('validations');
    expect(detail.body).not.toHaveProperty('signalements');
    expect(detail.body).not.toHaveProperty('actions');
    expect((await api(ctx, 'GET', `/alerts/${pending.id}`, { token: accessToken })).status).toBe(404);
    expect((await api(ctx, 'GET', `/alerts/${pubA.id}/history`, { token: accessToken })).status).toBe(403);
  });

  it('une radio ne lit que les alertes diffusées de son territoire', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const radio = await createUser(ctx, Role.RADIO_COMMUNAUTAIRE, ctx.zones.kanel);
    const pub = await diffused(ctx.zones.communeA, auteur.id, 'Crue');
    const pending = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: auteur.id, status: AlertStatus.PENDING, step: AlertStep.SIGNALEMENT });
    const { accessToken } = await login(ctx, radio);
    const ids = (await api(ctx, 'GET', '/alerts', { token: accessToken })).body.alerts.map((x: any) => x.id);
    expect(ids).toEqual([pub.id]);
    expect(ids).not.toContain(pending.id);
  });

  it('l\'historique des diffusions est limité au territoire', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const maireB = await createUser(ctx, Role.MAIRIE, ctx.zones.communeB, { mfa: true });
    const a = await diffused(ctx.zones.communeA, auteur.id, 'Crue');
    await ctx.prisma.broadcast.create({ data: { alertId: a.id, authorId: auteur.id, kind: 'PRIMARY', certainty: 'CONFIRMED', message: 'm', payload: { fr: 'm' }, targetZoneIds: [ctx.zones.communeA], channels: ['sms'], idempotencyKey: 'k', status: 'DONE' } });
    const { accessToken } = await login(ctx, maireB);
    expect((await api(ctx, 'GET', '/alerts/broadcasts', { token: accessToken })).body).toEqual([]);
  });
});

describe('F09 — signalements : territoire récursif, jamais les zones sœurs', () => {
  it('commune A voit ses signalements et les non localisés (racine), pas ceux de la commune B', async () => {
    const citA = await createUser(ctx, Role.CITOYEN, ctx.zones.communeA);
    const citB = await createUser(ctx, Role.CITOYEN, ctx.zones.communeB);
    const citRoot = await createUser(ctx, Role.CITOYEN, ctx.zones.matam);
    const maireA = await createUser(ctx, Role.MAIRIE, ctx.zones.communeA, { mfa: true });
    const mk = (userId: string, text: string) => ctx.prisma.signalement.create({ data: { userId, type: 'INONDATION', text, channel: 'whatsapp', latitude: 15.6, longitude: -13.2 } });
    const [sA, sB, sR] = [await mk(citA.id, 'A'), await mk(citB.id, 'B'), await mk(citRoot.id, 'racine')];
    const { accessToken } = await login(ctx, maireA);
    const ids = (await api(ctx, 'GET', '/signalements?limit=100', { token: accessToken })).body.items.map((x: any) => x.id);
    expect(ids).toEqual(expect.arrayContaining([sA.id, sR.id]));
    expect(ids).not.toContain(sB.id);
    expect((await api(ctx, 'PATCH', `/signalements/${sB.id}/status`, { token: accessToken, body: { status: 'VALIDATED' } })).status).toBe(403);
  });

  it('un signalement non localisé validé par la commune devient une alerte de la COMMUNE, pas régionale', async () => {
    const citRoot = await createUser(ctx, Role.CITOYEN, ctx.zones.matam);
    const maireA = await createUser(ctx, Role.MAIRIE, ctx.zones.communeA, { mfa: true });
    const s = await ctx.prisma.signalement.create({ data: { userId: citRoot.id, type: 'INONDATION', text: 'eau', channel: 'whatsapp', latitude: 15.6, longitude: -13.2 } });
    const { accessToken } = await login(ctx, maireA);
    const r = await api(ctx, 'PATCH', `/signalements/${s.id}/status`, { token: accessToken, body: { status: 'VALIDATED' } });
    expect(r.status).toBe(200);
    const alert = await ctx.prisma.alert.findUnique({ where: { id: r.body.alertId } });
    expect(alert!.zoneId).toBe(ctx.zones.communeA);
  });
});

describe('F09 — zone d\'abonnement du citoyen', () => {
  it('le citoyen choisit sa commune et reçoit alors les alertes de celle-ci ; un opérateur ne peut pas changer son territoire', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const citoyen = await createUser(ctx, Role.CITOYEN, ctx.zones.matam);
    const coord = await createUser(ctx, Role.COORDINATEUR, ctx.zones.communeA);
    const pubA = await diffused(ctx.zones.communeA, auteur.id, 'Crue A');
    const tC = await login(ctx, citoyen);
    // Rattaché à la région seulement : l'alerte communale n'est pas une alerte régionale pour lui… mais elle concerne sa région (zone descendante)
    const r = await api(ctx, 'PATCH', '/users/me', { token: tC.accessToken, body: { zoneId: ctx.zones.communeB } });
    expect(r.status).toBe(200);
    expect(r.body.zone.name).toBe('Commune B');
    const ids = (await api(ctx, 'GET', '/alerts', { token: tC.accessToken })).body.alerts.map((x: any) => x.id);
    expect(ids).not.toContain(pubA.id);
    await api(ctx, 'PATCH', '/users/me', { token: tC.accessToken, body: { zoneId: ctx.zones.communeA } });
    expect((await api(ctx, 'GET', '/alerts', { token: tC.accessToken })).body.alerts.map((x: any) => x.id)).toContain(pubA.id);
    const tO = await login(ctx, coord);
    expect((await api(ctx, 'PATCH', '/users/me', { token: tO.accessToken, body: { zoneId: ctx.zones.matam } })).status).toBe(403);
    expect((await ctx.prisma.user.findUnique({ where: { id: coord.id } }))!.zoneId).toBe(ctx.zones.communeA);
  });
});

describe('F14 — les actions annoncées sont exactement celles que l\'API accepte', () => {
  const cases: Array<{ name: string; role: Role; zone: 'communeA' | 'kanel' | 'communeB'; step: AlertStep; level: 'ORANGE' | 'ROUGE' }> = [
    { name: 'MAIRIE, ORANGE vérifiée', role: Role.MAIRIE, zone: 'communeA', step: AlertStep.MAIRIE, level: 'ORANGE' },
    { name: 'MAIRIE, ROUGE vérifiée', role: Role.MAIRIE, zone: 'communeA', step: AlertStep.MAIRIE, level: 'ROUGE' },
    { name: 'MAIRIE, ROUGE à confirmer', role: Role.MAIRIE, zone: 'communeA', step: AlertStep.PREFECTURE, level: 'ROUGE' },
    { name: 'PRÉFECTURE, ROUGE à confirmer', role: Role.PREFECTURE, zone: 'kanel', step: AlertStep.PREFECTURE, level: 'ROUGE' },
    { name: 'COORDINATEUR, ORANGE vérifiée', role: Role.COORDINATEUR, zone: 'communeA', step: AlertStep.MAIRIE, level: 'ORANGE' },
    { name: 'MAIRIE voisine', role: Role.MAIRIE, zone: 'communeB', step: AlertStep.MAIRIE, level: 'ORANGE' },
  ];
  it.each(cases)('$name', async ({ role, zone, step, level }) => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const actor = await createUser(ctx, role, ctx.zones[zone], { mfa: role !== Role.COORDINATEUR });
    const mk = () => makeAlert(ctx, { level: level as any, zoneId: ctx.zones.communeA, createdById: auteur.id, step, validators: [auteur.id] });
    const { accessToken } = await login(ctx, actor);
    const probe = await mk();
    const detail = await api(ctx, 'GET', `/alerts/${probe.id}`, { token: accessToken });
    if (detail.status === 404) {
      expect(zone).toBe('communeB');
      return;
    }
    const actions = detail.body.actions;
    // Chaque action annoncée est confrontée à l'API réelle, sur une alerte identique et fraîche
    const tryIt = async (path: string, body: any) => (await api(ctx, 'POST', `/alerts/${(await mk()).id}${path}`, { token: accessToken, body })).status;
    const ok = (st: number) => st >= 200 && st < 300;
    expect(ok(await tryIt('/advance', { action: 'VALIDATED' }))).toBe(actions.validate.allowed);
    expect(ok(await tryIt('/advance', { action: 'REJECTED' }))).toBe(actions.reject.allowed);
    expect(ok(await tryIt('/broadcast', { message: 'Consigne' }))).toBe(actions.broadcast.allowed);
    expect(ok(await tryIt('/emergency-bypass', { justification: 'Justification suffisamment détaillée' }))).toBe(actions.emergencyBypass.allowed);
    if (!actions.validate.allowed) expect(actions.validate.reason).toBeTruthy();
  });

  it('la triple validation de l\'ancien circuit est retirée (410) et le recoupement n\'invente aucune mesure', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const maire = await createUser(ctx, Role.MAIRIE, ctx.zones.communeA, { mfa: true });
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: auteur.id });
    const { accessToken } = await login(ctx, maire);
    expect((await api(ctx, 'POST', `/alerts/${a.id}/critical-validate`, { token: accessToken, body: { comment: 'x' } })).status).toBe(410);
    const c = await api(ctx, 'GET', `/alerts/${a.id}/context`, { token: accessToken });
    expect(c.body.omvs.available).toBe(false);
    expect(c.body.omvs).not.toHaveProperty('riverLevelMeters');
  });
});

describe('F15 — rejeu hors connexion sans doublon', () => {
  it('un même clientRequestId renvoie la même alerte ; les champs internes de la file sont refusés', async () => {
    const citoyen = await createUser(ctx, Role.CITOYEN, ctx.zones.communeA);
    const { accessToken } = await login(ctx, citoyen);
    const body = { title: 'Crue', description: 'Eau', type: 'INONDATION', severity: 2, latitude: 15.6, longitude: -13.2, locationSource: 'DEVICE_GPS', clientRequestId: randomUUID() };
    const [r1, r2] = await Promise.all([api(ctx, 'POST', '/alerts', { token: accessToken, body }), api(ctx, 'POST', '/alerts', { token: accessToken, body })]);
    expect([r1.status, r2.status].every((s) => s === 201)).toBe(true);
    expect(r1.body.id).toBe(r2.body.id);
    expect(await ctx.prisma.alert.count()).toBe(1);
    // L'ancien rejeu envoyait id/queuedAt : refusé par la validation stricte (le client n'envoie plus que le contrat)
    expect((await api(ctx, 'POST', '/alerts', { token: accessToken, body: { ...body, clientRequestId: randomUUID(), id: 3, queuedAt: 'x' } })).status).toBe(400);
  });
});

describe('F18 / F21 — provenance de la position et niveau découlant de la gravité déclarée', () => {
  it('un citoyen ne fixe pas le niveau officiel ; sous-type et provenance sont enregistrés', async () => {
    const citoyen = await createUser(ctx, Role.CITOYEN, ctx.zones.communeA);
    const { accessToken } = await login(ctx, citoyen);
    const r = await api(ctx, 'POST', '/alerts', {
      token: accessToken,
      body: { title: 'Bétail malade', description: 'Plusieurs bêtes', type: 'AUTRE', subtype: 'ELEVAGE_EPIZOOTIE', severity: 1, alertLevel: 'ROUGE_FONCE', latitude: 15.6, longitude: -13.2, locationSource: 'MANUAL' },
    });
    expect(r.status).toBe(201);
    const a = await ctx.prisma.alert.findUnique({ where: { id: r.body.id }, include: { signalements: true } });
    expect(a!.alertLevel).toBe('JAUNE');
    expect(a!.subtype).toBe('ELEVAGE_EPIZOOTIE');
    expect(a!.locationSource).toBe('MANUAL');
    expect(a!.signalements[0].locationSource).toBe('MANUAL');
  });

  it('coordonnées hors bornes refusées ; la provenance de la preuve terrain est conservée', async () => {
    const auteur = await createUser(ctx, Role.CITOYEN, ctx.zones.communeA);
    const sentinelle = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const s = await ctx.prisma.signalement.create({ data: { userId: auteur.id, type: 'INONDATION', text: 'eau', channel: 'whatsapp' } });
    const { accessToken } = await login(ctx, sentinelle);
    expect((await api(ctx, 'PATCH', `/signalements/${s.id}/field-verify`, { token: accessToken, body: { latitude: 915, longitude: -13.2 } })).status).toBe(400);
    const ok = await api(ctx, 'PATCH', `/signalements/${s.id}/field-verify`, { token: accessToken, body: { latitude: 15.61, longitude: -13.25, locationSource: 'DEVICE_GPS', locationAccuracyM: 12 } });
    expect(ok.status).toBe(200);
    const after = await ctx.prisma.signalement.findUnique({ where: { id: s.id } });
    expect(after!.fieldLocationSource).toBe('DEVICE_GPS');
    expect(after!.fieldLocationAccuracyM).toBe(12);
  });
});

describe('F20 — missions', () => {
  it('assignation réservée à un agent habilité du territoire ; statut de participation non écrasé', async () => {
    const maireA = await createUser(ctx, Role.MAIRIE, ctx.zones.communeA, { mfa: true });
    const sentA = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const sentB = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeB);
    const novice = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA, { status: AccountStatus.IN_TRAINING });
    const citoyen = await createUser(ctx, Role.CITOYEN, ctx.zones.communeA);
    const { accessToken } = await login(ctx, maireA);
    const m = await api(ctx, 'POST', '/missions', { token: accessToken, body: { title: 'Vérifier digue', description: 'Digue nord', zoneId: ctx.zones.communeA } });
    expect(m.status).toBe(201);
    expect((await api(ctx, 'POST', '/missions', { token: accessToken, body: { title: 'x', description: 'x', zoneId: ctx.zones.communeB } })).status).toBe(403);
    const assign = (sentinelId: string) => api(ctx, 'POST', `/missions/${m.body.id}/assign`, { token: accessToken, body: { sentinelId } });
    expect((await assign(citoyen.id)).status).toBe(400);
    expect((await assign(novice.id)).status).toBe(400);
    expect([400, 403]).toContain((await assign(sentB.id)).status);
    expect((await assign(sentA.id)).status).toBe(201);

    const tS = await login(ctx, sentA);
    expect((await api(ctx, 'POST', `/missions/${m.body.id}/accept`, { token: tS.accessToken })).status).toBe(201);
    const mine = await api(ctx, 'GET', '/missions/me', { token: tS.accessToken });
    expect(mine.body[0].status).toBe('IN_PROGRESS');
    expect(mine.body[0].missionStatus).toBe('IN_PROGRESS');
    // Un citoyen ne liste pas les missions
    const tC = await login(ctx, citoyen);
    expect((await api(ctx, 'GET', '/missions', { token: tC.accessToken })).status).toBe(403);
  });
});
