/**
 * Non-régression — supervision (audit F33).
 * Avant : santé limitée à la base, métriques assemblées à la main avec des
 * lignes d'histogramme mal formées, aucun indicateur de la chaîne d'alerte.
 */
import { Role } from '@prisma/client';
import { Ctx, TEST_ENV, bootApp, createUser, resetDb, seedZones } from './harness';
import { makeAlert } from './alert-fixtures';

let ctx: Ctx;
beforeAll(async () => { ctx = await bootApp(); });
afterAll(async () => { delete process.env.METRICS_TOKEN; await ctx.prisma.$disconnect(); await ctx.app.close(); });
beforeEach(async () => { await resetDb(ctx.prisma); await seedZones(ctx); delete process.env.METRICS_TOKEN; });

const get = (path: string, headers: Record<string, string> = {}) => fetch(`${ctx.baseUrl}${path}`, { headers });

/** Format d'exposition Prometheus 0.0.4 : chaque échantillon doit être bien formé. */
const SAMPLE = /^[a-zA-Z_:][a-zA-Z0-9_:]*(\{[a-zA-Z_][a-zA-Z0-9_]*="(?:[^"\\]|\\.)*"(,[a-zA-Z_][a-zA-Z0-9_]*="(?:[^"\\]|\\.)*")*\})? (-?[0-9.]+(e[+-]?[0-9]+)?|NaN|[+-]Inf)( [0-9]+)?$/;

describe('F33 — métriques Prometheus', () => {
  it('format valide, indicateurs de la chaîne d\'alerte présents et justes', async () => {
    const citoyen = await createUser(ctx, Role.CITOYEN, ctx.zones.communeA);
    const s = await ctx.prisma.signalement.create({ data: { userId: citoyen.id, type: 'INONDATION', text: 'eau', channel: 'whatsapp' } });
    await ctx.prisma.$executeRaw`UPDATE signalements SET "createdAt" = now() - interval '2 hours' WHERE id = ${s.id}`;
    // Une requête HTTP comptée (les refus de garde ne passent pas par l'intercepteur)
    await get('/alerts-bot/active', { 'x-bot-api-key': TEST_ENV.BOT_API_KEY });
    const r = await get('/metrics');
    expect(r.status).toBe(200);
    const text = await r.text();
    const bad = text.split('\n').filter((l) => l && !l.startsWith('#') && !SAMPLE.test(l));
    expect(bad).toEqual([]);
    const oldest = Number(/^olel_signalement_pending_oldest_age_seconds (\S+)$/m.exec(text)![1]);
    expect(oldest).toBeGreaterThan(7000);
    expect(text).toMatch(/^olel_queue_jobs\{state="redis_up"\} 1$/m);
    expect(text).toMatch(/^olel_http_request_duration_seconds_bucket\{le="0\.1",method="GET"\} \d+$/m);
    expect(text).toMatch(/^olel_channel_configured\{channel="whatsapp"\} 0$/m);
  });

  it('jeton exigé quand METRICS_TOKEN est défini', async () => {
    process.env.METRICS_TOKEN = 'jeton-metriques-test-0123456789';
    expect((await get('/metrics')).status).toBe(401);
    expect((await get('/metrics', { authorization: 'Bearer faux' })).status).toBe(401);
    expect((await get('/metrics', { authorization: 'Bearer jeton-metriques-test-0123456789' })).status).toBe(200);
  });
});

describe('F33 — santé de la chaîne de diffusion', () => {
  it('ready vérifie la base ET Redis', async () => {
    const r = await (await get('/health/ready')).json();
    expect(r.details.database.status).toBe('up');
    expect(r.details.redis.status).toBe('up');
  });

  it('une intention de diffusion restée en attente rend la chaîne « dégradée » (503) avec la cause', async () => {
    expect((await get('/health/diffusion')).status).toBe(200);
    const auteur = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: auteur.id });
    await ctx.prisma.broadcast.create({
      data: { alertId: a.id, authorId: auteur.id, kind: 'PRIMARY', certainty: 'CONFIRMED', message: 'm', payload: { fr: 'm' }, targetZoneIds: [], channels: ['sms'], idempotencyKey: 'k', status: 'PENDING', lastError: 'File indisponible : ECONNREFUSED', createdAt: new Date(Date.now() - 10 * 60_000) },
    });
    const r = await get('/health/diffusion');
    expect(r.status).toBe(503);
    const body = await r.json();
    expect(body.checks.error.broadcastQueue.status).toBe('down');
    expect(body.checks.error.broadcastQueue.lastError).toMatch(/ECONNREFUSED/);
  });

  it('messages entrants non traités depuis longtemps : dégradé', async () => {
    await ctx.prisma.inboundMessage.create({ data: { id: 'wamid.old', from: '+221770000001', type: 'text', payload: { a: 1 }, receivedAt: new Date(Date.now() - 30 * 60_000) } });
    const r = await get('/health/diffusion');
    expect(r.status).toBe(503);
    expect((await r.json()).checks.error.inbound.status).toBe('down');
  });
});
