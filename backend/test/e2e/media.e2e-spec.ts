/**
 * Non-régression — médias (audit F12).
 * Avant correction : /uploads servi publiquement sans contrôle, type MIME du
 * client cru sur parole, extension du nom d'origine conservée, URL externes
 * acceptées dans les signalements.
 */
import { existsSync, readdirSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { Role } from '@prisma/client';
import { Ctx, TEST_ENV, api, bootApp, createUser, login, resetDb, seedZones } from './harness';
import { makeAlert } from './alert-fixtures';

let ctx: Ctx;
let origin: string;

// Contenus minimaux réels (signatures binaires)
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const OGG = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(64, 2)]);
const HTML = Buffer.from('<html><script>alert(document.cookie)</script></html>');

beforeAll(async () => { ctx = await bootApp(); origin = ctx.baseUrl.replace('/api/v1', ''); });
afterAll(async () => { await ctx.prisma.$disconnect(); await ctx.app.close(); });
beforeEach(async () => { await resetDb(ctx.prisma); await seedZones(ctx); });

async function upload(path: string, token: string | null, content: Buffer, name: string, type: string, headers: Record<string, string> = {}) {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(content)], { type }), name);
  const res = await fetch(`${ctx.baseUrl}${path}`, {
    method: 'POST', body: form,
    headers: { 'x-forwarded-for': `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
  });
  return { status: res.status, body: await res.json().catch(() => undefined) };
}

async function citizenToken() {
  const u = await createUser(ctx, Role.SENTINELLE, ctx.zones.communeA);
  return { user: u, token: (await login(ctx, u)).accessToken };
}

describe('F12 — dépôt : contenu vérifié, extension imposée', () => {
  it('le type et le nom fournis par le client sont ignorés : une image réelle nommée .html est stockée en .png', async () => {
    const { token } = await citizenToken();
    const r = await upload('/upload/photo', token, PNG, 'piege.html', 'text/html');
    expect(r.status).toBe(201);
    expect(r.body.filename).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(r.body.mimetype).toBe('image/png');
    expect(existsSync(`${TEST_ENV.UPLOAD_DIR}/${r.body.filename}`)).toBe(true);
  });

  it('un contenu HTML déclaré image/png est refusé et rien n\'est écrit', async () => {
    const { token } = await citizenToken();
    const before = readdirSync(TEST_ENV.UPLOAD_DIR).length;
    const r = await upload('/upload/photo', token, HTML, 'photo.png', 'image/png');
    expect(r.status).toBe(400);
    expect(readdirSync(TEST_ENV.UPLOAD_DIR).length).toBe(before);
  });

  it('un vocal déposé comme photo est refusé (une photo de preuve doit être une image)', async () => {
    const { token } = await citizenToken();
    expect((await upload('/upload/photo', token, OGG, 'p.jpg', 'image/jpeg')).status).toBe(400);
    expect((await upload('/upload/audio', token, OGG, 'v.ogg', 'audio/ogg')).status).toBe(201);
  });

  it('dépôt sans authentification refusé', async () => {
    expect((await upload('/upload/photo', null, PNG, 'p.png', 'image/png')).status).toBe(401);
  });
});

describe('F12 — lecture : plus d\'accès public, URL signée et expirante', () => {
  it('/uploads n\'est plus servi ; l\'URL signée renvoyée fonctionne ; une signature modifiée ou expirée est refusée', async () => {
    const { token } = await citizenToken();
    const r = await upload('/upload/photo', token, PNG, 'p.png', 'image/png');
    expect((await fetch(`${origin}/uploads/${r.body.filename}`)).status).toBe(404);

    const signed: string = r.body.url;
    expect(signed).toMatch(/\/api\/v1\/media\/[0-9a-f-]{36}\.png\?exp=\d+&sig=/);
    const ok = await fetch(signed.replace(/^https?:\/\/[^/]+/, origin));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/png');
    expect(ok.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await ok.arrayBuffer()).equals(PNG)).toBe(true);

    const tampered = signed.replace(/sig=.{4}/, 'sig=AAAA');
    expect((await fetch(tampered.replace(/^https?:\/\/[^/]+/, origin))).status).toBe(403);
    const past = Math.floor(Date.now() / 1000) - 10;
    const expired = signed.replace(/exp=\d+/, `exp=${past}`);
    expect((await fetch(expired.replace(/^https?:\/\/[^/]+/, origin))).status).toBe(403);
    // Sans signature : refus, même avec le nom exact du fichier
    expect((await fetch(`${origin}/api/v1/media/${r.body.filename}`)).status).toBe(403);
  });
});

describe('F12 — références de médias dans les signalements', () => {
  it('une URL externe est refusée ; l\'URL signée renvoyée par l\'API est stockée sous forme canonique', async () => {
    const { token } = await citizenToken();
    const base = { title: 'Crue', description: 'Eau dans la rue', type: 'INONDATION', zoneId: ctx.zones.communeA, latitude: 15.6, longitude: -13.2 };
    const ext = await api(ctx, 'POST', '/alerts', { token, body: { ...base, mediaUrls: ['https://tracker.example/pixel.png'] } });
    expect(ext.status).toBe(400);

    const up = await upload('/upload/photo', token, PNG, 'p.png', 'image/png');
    const created = await api(ctx, 'POST', '/alerts', { token, body: { ...base, mediaUrls: [up.body.url] } });
    expect(created.status).toBe(201);
    const stored = await ctx.prisma.alert.findUnique({ where: { id: created.body.id } });
    expect(stored!.mediaUrls).toEqual([`/uploads/${up.body.filename}`]);
    // La réponse authentifiée contient une URL signée, jamais la référence brute
    expect(created.body.mediaUrls[0]).toMatch(/\/api\/v1\/media\/.+\?exp=\d+&sig=/);
  });

  it('le dépôt par le bot (sans utilisateur) renvoie la référence canonique, acceptée par /signalements/bot', async () => {
    const r = await upload('/upload/bot-media', null, OGG, 'audio.bin', 'application/octet-stream', { 'x-bot-api-key': TEST_ENV.BOT_API_KEY });
    expect(r.status).toBe(201);
    expect(r.body.url).toBe(`/uploads/${r.body.filename}`);
    const s = await api(ctx, 'POST', '/signalements/bot', {
      headers: { 'x-bot-api-key': TEST_ENV.BOT_API_KEY },
      body: { type: 'INONDATION', phone: '+221770001122', description: 'vocal', mediaUrls: [r.body.url] },
    });
    expect(s.status).toBe(201);
  });
});

describe('F12 — médias antérieurs à la correction (production existante)', () => {
  it('une référence héritée (origine absolue, extension .jpeg) est signée et servie selon son contenu réel', async () => {
    const { user, token } = await citizenToken();
    const legacyOk = `${randomUUID()}.jpeg`;
    const legacyBad = `${randomUUID()}.jpg`;
    writeFileSync(`${TEST_ENV.UPLOAD_DIR}/${legacyOk}`, PNG);
    writeFileSync(`${TEST_ENV.UPLOAD_DIR}/${legacyBad}`, HTML);
    const a = await makeAlert(ctx, { zoneId: ctx.zones.communeA, createdById: user.id });
    await ctx.prisma.alert.update({ where: { id: a.id }, data: { mediaUrls: [`https://api.olel.app/uploads/${legacyOk}`, `https://api.olel.app/uploads/${legacyBad}`] } });
    const r = await api(ctx, 'GET', `/alerts/${a.id}`, { token });
    expect(r.status).toBe(200);
    const [okUrl, badUrl] = r.body.mediaUrls.map((u: string) => u.replace(/^https?:\/\/[^/]+/, origin));
    const ok = await fetch(okUrl);
    expect(ok.headers.get('content-type')).toBe('image/png');
    const bad = await fetch(badUrl);
    // Contenu non reconnu : jamais rendu dans la page
    expect(bad.headers.get('content-type')).toBe('application/octet-stream');
    expect(bad.headers.get('content-disposition')).toBe('attachment');
  });
});
