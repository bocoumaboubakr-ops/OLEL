/**
 * Non-régression — confirmations trompeuses (audit F06) et consultation (F16).
 * Avant correction : l'USSD affichait « autorités notifiées » avant toute
 * écriture (asynchrone, erreurs ignorées), le SVI annonçait « secours
 * alertés » sans rien enregistrer et lisait une alerte fictive.
 */
import { AlertStatus, AlertStep, Role } from '@prisma/client';
import { Ctx, api, bootApp, createUser, login, resetDb, seedZones } from './harness';
import { makeAlert, setFlag } from './alert-fixtures';
import { SignalementsService } from '../../src/signalements/signalements.service';
import { AlertsService } from '../../src/alerts/alerts.service';

const SECRET = 'secret-rappel-fournisseur-test-0123456789';
let ctx: Ctx;
let origin: string;

beforeAll(async () => {
  ctx = await bootApp();
  origin = ctx.baseUrl;
  process.env.AT_CALLBACK_SECRET = SECRET;
});
afterAll(async () => { delete process.env.AT_CALLBACK_SECRET; await ctx.prisma.$disconnect(); await ctx.app.close(); });
beforeEach(async () => { await resetDb(ctx.prisma); await seedZones(ctx); jest.restoreAllMocks(); });

/** Requête au format du fournisseur (application/x-www-form-urlencoded). */
async function provider(path: string, form: Record<string, string>, key: string | null = SECRET) {
  const res = await fetch(`${origin}${path}${key !== null ? `?key=${encodeURIComponent(key)}` : ''}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '196.201.214.10' },
    body: new URLSearchParams(form).toString(),
  });
  return { status: res.status, text: await res.text() };
}
const ussd = (sessionId: string, text: string, phoneNumber = '+221771112233', key?: string | null) =>
  provider('/ussd/session', { sessionId, phoneNumber, text, serviceCode: '*123#' }, key === undefined ? SECRET : key);

describe('F06 — USSD : confirmation seulement après enregistrement', () => {
  it('le signalement existe en base au moment où la confirmation est affichée, sans promesse d\'intervention', async () => {
    const r = await ussd('ATUid_1', '1*1*Eau dans les maisons quartier nord*3');
    expect(r.status).toBe(200);
    const s = await ctx.prisma.signalement.findUnique({ where: { sourceRef: 'ussd:ATUid_1' } });
    expect(s).not.toBeNull();
    expect(s!.channel).toBe('ussd');
    expect(s!.severity).toBe(3);
    expect(s!.text).toBe('Eau dans les maisons quartier nord');
    expect(r.text).toMatch(/^END Signalement recu par OLEL/);
    expect(r.text).toContain(`Ref: ${s!.id.slice(0, 8).toUpperCase()}`);
    expect(r.text).not.toMatch(/notifi|alert[ée]s|secours ont/i);
  });

  it('une session rejouée par le fournisseur ne crée qu\'un signalement', async () => {
    const [a, b] = await Promise.all([ussd('ATUid_2', '1*2*Puits a sec*1'), ussd('ATUid_2', '1*2*Puits a sec*1')]);
    await ussd('ATUid_2', '1*2*Puits a sec*1');
    expect(a.text).toBe(b.text);
    expect(await ctx.prisma.signalement.count({ where: { sourceRef: 'ussd:ATUid_2' } })).toBe(1);
  });

  it('en cas d\'échec d\'écriture, l\'utilisateur est informé que rien n\'a été reçu', async () => {
    jest.spyOn(ctx.app.get(SignalementsService), 'createFromChannel').mockRejectedValueOnce(new Error('base indisponible (simulé)'));
    const r = await ussd('ATUid_3', '1*3*Feu de brousse*2');
    expect(r.text).toMatch(/^END ECHEC/);
    expect(r.text).toMatch(/PAS ete recu/);
  });

  it('un choix invalide n\'enregistre rien et le dit', async () => {
    const r = await ussd('ATUid_4', '1*1*description*9');
    expect(r.text).toMatch(/Rien n'a ete enregistre/);
    expect(await ctx.prisma.signalement.count()).toBe(0);
  });

  it('rappel sans secret ou avec un secret faux : refusé, rien n\'est écrit', async () => {
    expect((await ussd('ATUid_5', '1*1*x*1', '+221771112233', null)).status).toBe(401);
    expect((await ussd('ATUid_5', '1*1*x*1', '+221771112233', 'mauvais')).status).toBe(401);
    expect(await ctx.prisma.signalement.count()).toBe(0);
  });
});

describe('F16 — USSD : « aucune alerte » distinct de « consultation indisponible »', () => {
  it('aucune alerte diffusée : message explicite', async () => {
    const r = await ussd('ATUid_6', '2');
    expect(r.text).toBe('END Aucune alerte en vigueur pour votre zone actuellement.');
  });

  it('alerte diffusée sur la zone du citoyen : listée ; alerte d\'une autre commune : non listée', async () => {
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    await ctx.prisma.user.create({ data: { phone: '+221779990000', name: 'Citoyen B', role: Role.CITOYEN, zoneId: ctx.zones.communeB } });
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: auteur.id, status: AlertStatus.BROADCAST, step: AlertStep.BROADCAST });
    await ctx.prisma.alert.update({ where: { id: a.id }, data: { broadcastAt: new Date(), title: 'Crue Commune A' } });
    const b = await makeAlert(ctx, { zoneId: ctx.zones.communeB, createdById: auteur.id, status: AlertStatus.BROADCAST, step: AlertStep.BROADCAST });
    await ctx.prisma.alert.update({ where: { id: b.id }, data: { broadcastAt: new Date(), title: 'Crue Commune B' } });
    const r = await ussd('ATUid_7', '2', '+221779990000');
    expect(r.text).toContain('Crue Commune B');
    expect(r.text).not.toContain('Crue Commune A');
  });

  it('base indisponible : « consultation indisponible », jamais « aucune alerte »', async () => {
    jest.spyOn(ctx.app.get(AlertsService), 'publicActiveFor').mockRejectedValueOnce(new Error('timeout (simulé)'));
    const r = await ussd('ATUid_8', '2');
    expect(r.text).toMatch(/Consultation indisponible/);
    expect(r.text).not.toMatch(/Aucune alerte/);
  });
});

describe('F06 — SVI', () => {
  const ivr = (form: Record<string, string>) => provider('/ivr/webhook', form);

  it('l\'invite par défaut ne lit aucune alerte fictive', async () => {
    const r = await ivr({ sessionId: 'ATVId_1', callerNumber: '+221775550000', isActive: '1' });
    expect(r.status).toBe(200);
    expect(r.text).not.toMatch(/Alerte en cours|Niveau alerte|Zone concernée/);
    expect(r.text).toContain('<GetDigits');
  });

  it('touche 2 : signalement enregistré (une seule fois) avant l\'annonce, sans promettre les secours', async () => {
    const r = await ivr({ sessionId: 'ATVId_2', callerNumber: '+221775550001', dtmfDigits: '2' });
    await ivr({ sessionId: 'ATVId_2', callerNumber: '+221775550001', dtmfDigits: '2' });
    expect(await ctx.prisma.signalement.count({ where: { sourceRef: 'ivr:ATVId_2', channel: 'ivr' } })).toBe(1);
    expect(r.text).toMatch(/reçu par OLEL/);
    expect(r.text).not.toMatch(/secours ont été alertés/);
  });

  it('touche 2 avec échec d\'écriture : l\'appelant est informé', async () => {
    jest.spyOn(ctx.app.get(SignalementsService), 'createFromChannel').mockRejectedValueOnce(new Error('base indisponible (simulé)'));
    const r = await ivr({ sessionId: 'ATVId_3', callerNumber: '+221775550002', dtmfDigits: '2' });
    expect(r.text).toMatch(/n'a pas pu être enregistré/);
  });

  it('l\'appel de test est refusé tant que le canal SVI est désactivé, et réservé aux administrateurs', async () => {
    const admin = await createUser(ctx, Role.SUPER_ADMIN, ctx.zones.matam, { mfa: true });
    const prefet = await createUser(ctx, Role.PREFECTURE, ctx.zones.kanel, { mfa: true });
    const ta = await login(ctx, admin);
    const tp = await login(ctx, prefet);
    expect((await api(ctx, 'POST', '/ivr/call', { token: tp.accessToken, body: { phoneNumber: '+221775550003' } })).status).toBe(403);
    expect((await api(ctx, 'POST', '/ivr/call', { token: ta.accessToken, body: { phoneNumber: '+221775550003' } })).status).toBe(409);
    await setFlag(ctx, 'ivr', true);
    const r = await api(ctx, 'POST', '/ivr/call', { token: ta.accessToken, body: { phoneNumber: '+221775550003' } });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('SIMULATED'); // jamais « appel initié » en simulation
  });
});
