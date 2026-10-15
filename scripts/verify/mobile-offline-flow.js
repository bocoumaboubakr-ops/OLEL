/**
 * Vérification navigateur F13/F15 (données fictives, backend et base de test).
 *
 * Prérequis (voir docs/AUDIT_REMEDIATION.md, « Vérifications navigateur ») :
 *   scripts/test-services.sh reset
 *   backend : pnpm build puis `node dist/main.js` avec l'environnement de test
 *             (NODE_ENV=test, PORT=4000, ALLOWED_ORIGINS=http://localhost:3103, …)
 *   mobile  : pnpm build puis `next start -p 3103`
 *   PLAYWRIGHT_CORE=<chemin vers playwright-core>  CHROMIUM=<binaire Chromium>
 *   node scripts/verify/mobile-offline-flow.js
 * ATTENTION : vide les tables de la base de TEST indiquée par TEST_DATABASE_URL.
 * 1. hors ligne : signalement enregistré localement, rien côté serveur
 * 2. retour réseau : rejeu → exactement une alerte, provenance et sous-type
 * 3. téléphone partagé : un élément du compte A n'est jamais envoyé avec la session de B
 * 4. déconnexion : purge locale et révocation serveur
 * 5. jeton d'accès expiré : renouvellement automatique, pas de déconnexion
 */
const path = require('path');
const backendDir = path.join(__dirname, '..', '..', 'backend');
const fromBackend = (m) => require(require.resolve(m, { paths: [backendDir, require.resolve('@nestjs/jwt', { paths: [backendDir] })] }));
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const { PrismaClient } = fromBackend('@prisma/client');
const jwt = fromBackend('jsonwebtoken');
const DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://olel@127.0.0.1:55432/olel_test';
if (!/olel_test/.test(DB_URL)) { console.error('Refus : base non identifiée comme base de test'); process.exit(3); }

const API = 'http://localhost:4000/api/v1';
const APP = 'http://localhost:3103';
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'OK ' : 'ÉCHEC'} ${name}${detail ? ' — ' + detail : ''}`); };
let ipSeq = 1;
const post = async (path, body, token) => {
  const r = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.77.0.${ipSeq++}`, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
async function citizen(phone) {
  const req = await post('/auth/otp/request', { phone });
  const v = await post('/auth/otp/verify', { phone, code: req.body.dev_code });
  if (v.status !== 200) throw new Error('OTP ' + JSON.stringify(v.body));
  return v.body;
}
const idbItems = (page) => page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('olel_offline', 2);
  r.onsuccess = () => { const t = r.result.transaction('reports', 'readonly'); const q = t.objectStore('reports').getAll(); q.onsuccess = () => res(q.result); };
  r.onerror = () => res([]);
}));
const setSession = (page, s) => page.evaluate((s) => {
  localStorage.setItem('olel_token', s.accessToken); localStorage.setItem('olel_refresh', s.refreshToken); localStorage.setItem('olel_user', JSON.stringify(s.user));
}, s);
const waitFor = async (fn, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 250)); } return false; };

async function goReport(page) {
  await page.getByRole('button', { name: /Accueil/ }).click();
  await page.getByRole('button', { name: /Signaler/ }).last().click();
  await page.getByText('Risques climatiques').click();
  await page.getByText('Inondation', { exact: true }).click();
  await page.getByText('Envoyer le signalement').waitFor();
  await page.getByText(/Position GPS/).waitFor({ timeout: 10000 });
}

(async () => {
  // Données fictives : une région et une commune
  await prisma.$executeRawUnsafe('TRUNCATE alerts, signalements, sessions, otp_requests, users, zones, broadcasts, broadcast_deliveries, validations, audit_logs RESTART IDENTITY CASCADE');
  const root = await prisma.zone.create({ data: { name: 'Matam', code: 'MAT', region: 'Matam' } });
  await prisma.zone.create({ data: { name: 'Commune A', code: 'KAN-A', region: 'Matam', parentId: root.id } });

  const A = await citizen('+221770000101');
  const B = await citizen('+221770000202');

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const ctx = await browser.newContext({ geolocation: { latitude: 15.62, longitude: -13.25, accuracy: 18 }, permissions: ['geolocation'] });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('dialog', (d) => d.accept());

  await page.goto(APP); await setSession(page, A); await page.reload();
  await page.getByText('Signaler un risque').waitFor({ timeout: 15000 });

  // 1. Hors ligne
  await goReport(page);
  await ctx.setOffline(true);
  await page.getByText('Envoyer le signalement').click();
  await page.getByText('Enregistré sur ce téléphone').waitFor({ timeout: 5000 });
  let items = await idbItems(page);
  check('hors ligne : écran « enregistré sur ce téléphone » (pas « transmis »)', true);
  check('hors ligne : un élément en file, rattaché au compte A', items.length === 1 && items[0].ownerId === A.user.id, JSON.stringify(items.map((i) => i.ownerId)));
  check('hors ligne : payload = contrat API (pas d\'id/queuedAt), clientRequestId présent', items[0] && !('id' in items[0].payload) && !('queuedAt' in items[0].payload) && !!items[0].payload.clientRequestId);
  check('hors ligne : rien côté serveur', (await prisma.alert.count()) === 0);

  // 2. Retour réseau → rejeu unique
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  const sent = await waitFor(async () => (await prisma.alert.count()) === 1);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await new Promise((r) => setTimeout(r, 1500));
  const alerts = await prisma.alert.findMany({ include: { signalements: true } });
  check('retour réseau : alerte créée exactement une fois', sent && alerts.length === 1, `count=${alerts.length}`);
  check('provenance DEVICE_GPS, sous-type INONDATION, auteur A', alerts[0]?.locationSource === 'DEVICE_GPS' && alerts[0]?.subtype === 'INONDATION' && alerts[0]?.createdById === A.user.id);
  check('dédoublonnage serveur : sourceRef app:<A>:<clientRequestId>', alerts[0]?.signalements[0]?.sourceRef === `app:${A.user.id}:${items[0].payload.clientRequestId}`);
  check('file vidée après réception', (await idbItems(page)).length === 0);

  // 3. Téléphone partagé : élément de A, session de B
  await goReport(page);
  await ctx.setOffline(true);
  await page.getByText('Envoyer le signalement').click();
  await page.getByText('Enregistré sur ce téléphone').waitFor();
  await setSession(page, B); // changement de compte sans déconnexion
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await new Promise((r) => setTimeout(r, 2500));
  items = await idbItems(page);
  check('téléphone partagé : l\'élément de A n\'est pas envoyé avec la session de B', (await prisma.alert.count()) === 1 && items.length === 1 && items[0].ownerId === A.user.id);

  // 4. Déconnexion de A : confirmation, purge, révocation serveur
  await setSession(page, A); await page.reload();
  await page.getByText('Signaler un risque').waitFor();
  await page.getByRole('button', { name: /Profil/ }).click();
  await page.getByText('Se déconnecter').click();
  await waitFor(async () => (await page.evaluate(() => localStorage.getItem('olel_token'))) === null);
  check('déconnexion : file du compte purgée', (await idbItems(page)).length === 0);
  check('déconnexion : stockage local purgé', (await page.evaluate(() => [localStorage.getItem('olel_token'), localStorage.getItem('olel_refresh'), localStorage.getItem('olel_user')].every((v) => v === null))));
  const reuse = await post('/auth/refresh', { refreshToken: A.refreshToken });
  check('déconnexion : session révoquée côté serveur (refresh refusé)', reuse.status === 401, `status=${reuse.status}`);

  // 5. Jeton d'accès expiré : renouvellement transparent
  const C = await citizen('+221770000303');
  const claims = jwt.decode(C.accessToken);
  const expired = jwt.sign({ sub: claims.sub, sid: claims.sid, tv: claims.tv, typ: 'access', mfa: claims.mfa, exp: Math.floor(Date.now() / 1000) - 60 }, 'test_jwt_secret_0123456789_abcdefghijklmnop');
  await setSession(page, { ...C, accessToken: expired });
  await page.reload();
  await page.getByText('Signaler un risque').waitFor({ timeout: 15000 });
  const renewed = await waitFor(async () => { const t = await page.evaluate(() => localStorage.getItem('olel_token')); return t && t !== expired; });
  check('jeton expiré : renouvelé automatiquement, utilisateur toujours connecté', renewed && (await page.getByText('Signaler un risque').isVisible()));
  check('aucune erreur JavaScript de page', pageErrors.length === 0, pageErrors.join(' | '));

  await browser.close();
  await prisma.$disconnect();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} vérifications réussies`);
  process.exit(failed ? 1 : 0);
})().catch(async (e) => { console.error('ERREUR', e); await prisma.$disconnect(); process.exit(2); });
