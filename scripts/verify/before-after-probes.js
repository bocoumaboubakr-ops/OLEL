/**
 * Sondes « avant / après » sur les défauts P0/P1 d'accès (audit F01, F02,
 * F07, F11, F12) : les MÊMES requêtes sont rejouées contre la version
 * auditée (cfd68a5) et contre la version corrigée, chacune sur sa propre
 * base de TEST (données fictives). Une sonde « reproduit » si le défaut se
 * manifeste ; la version corrigée doit le refuser.
 *
 * Usage : OLD=http://127.0.0.1:4100 OLD_DB=… NEW=http://127.0.0.1:4200 NEW_DB=… \
 *         TOTP_KEY=… node scripts/verify/before-after-probes.js
 */
const path = require('path');
const backendDir = path.join(__dirname, '..', '..', 'backend');
const req = (m) => require(require.resolve(m, { paths: [backendDir] }));
const { PrismaClient } = req('@prisma/client');
const bcrypt = req('bcrypt');
const { io } = req('socket.io-client');

const targets = [
  { name: 'auditée (cfd68a5)', base: process.env.OLD, db: process.env.OLD_DB },
  { name: 'corrigée', base: process.env.NEW, db: process.env.NEW_DB },
];
let ip = 1;
const call = async (base, method, p, { token, body } = {}) => {
  const r = await fetch(`${base}/api/v1${p}`, {
    method, headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.88.0.${ip++ % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};

/** SQL brut : commun aux deux schémas (auditée et corrigée). */
async function seed(prisma) {
  await prisma.$executeRawUnsafe('TRUNCATE users, zones, alerts, signalements RESTART IDENTITY CASCADE');
  const zone = async (name, code, parent) => (await prisma.$queryRawUnsafe(
    `INSERT INTO zones (id, name, code, region, "parentId", "isActive", "createdAt") VALUES (gen_random_uuid(), $1, $2, 'Matam', $3, true, now()) RETURNING id`, name, code, parent))[0].id;
  const root = await zone('Matam', 'MAT', null);
  const a = await zone('Commune A', 'A', root);
  const b = await zone('Commune B', 'B', root);
  const hash = await bcrypt.hash('Sonde-Mot-De-Passe-1', 4);
  const mk = async (phone, role, zoneId) => (await prisma.$queryRawUnsafe(
    `INSERT INTO users (id, phone, name, role, "zoneId", "isActive", "passwordHash", language, "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, $3::"Role", $4, true, $5, 'fr', now(), now()) RETURNING id, phone`, phone, `${role} sonde`, role, zoneId, hash))[0];
  return {
    zones: { a, b },
    coord: await mk('+221770900001', 'COORDINATEUR', a),
    victim: await mk('+221770900002', 'SENTINELLE', a),
    promoted: await mk('+221770900003', 'COORDINATEUR', a),
    suspended: await mk('+221770900004', 'COORDINATEUR', a),
    sentinel: await mk('+221770900005', 'SENTINELLE', a),
  };
}
const roleOf = async (prisma, id) => (await prisma.$queryRawUnsafe('SELECT role::text AS role FROM users WHERE id = $1', id))[0].role;
const login = async (base, phone) => (await call(base, 'POST', '/auth/login', { body: { phone, password: 'Sonde-Mot-De-Passe-1' } })).body;

async function probes(t) {
  const prisma = new PrismaClient({ datasources: { db: { url: t.db } } });
  const d = await seed(prisma);
  const out = [];

  // F01 — un COORDINATEUR élève un compte jusqu'à SUPER_ADMIN
  const c = await login(t.base, d.coord.phone);
  const esc = await call(t.base, 'PATCH', `/users/${d.victim.id}`, { token: c.accessToken, body: { role: 'SUPER_ADMIN' } });
  const finalRole = await roleOf(prisma, d.victim.id);
  out.push(['F01 élévation COORDINATEUR → SUPER_ADMIN', finalRole === 'SUPER_ADMIN', `HTTP ${esc.status}, rôle final ${finalRole}`]);

  // F02 — flux temps réel sans authentification, abonnement libre à une zone
  const anon = await new Promise((resolve) => {
    const events = [];
    const s = io(`${t.base}/alerts`, { transports: ['websocket'], reconnection: false, forceNew: true });
    let connected = false;
    s.on('connect', () => { connected = true; s.emit('join:zone', d.zones.b); s.emit('join:zone', d.zones.a); });
    s.onAny((name, data) => events.push({ name, data }));
    setTimeout(async () => {
      await call(t.base, 'POST', '/alerts', { token: c.accessToken, body: { title: 'Sonde F02', description: 'Contenu interne de test', type: 'INONDATION', zoneId: d.zones.a } });
      setTimeout(() => { const ok = connected && s.connected; s.close(); resolve({ ok, events }); }, 1500);
    }, 700);
  });
  const leaked = anon.events.filter((e) => /^alert:/.test(e.name) && JSON.stringify(e.data || '').includes('Contenu interne'));
  out.push(['F02 socket anonyme reçoit le contenu des alertes', anon.ok && leaked.length > 0, `connecté=${anon.ok}, événements reçus=${anon.events.map((e) => e.name).join(',') || 'aucun'}`]);

  // F07 — compte suspendu : l'ancien jeton reste valable
  const s4 = await login(t.base, d.suspended.phone);
  // Désactivation telle que la faisait la version auditée (isActive) — la version
  // corrigée lit le statut : on positionne les deux quand la colonne existe.
  await prisma.$executeRawUnsafe('UPDATE users SET "isActive" = false WHERE id = $1', d.suspended.id);
  await prisma.$executeRawUnsafe(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='status') THEN UPDATE users SET status='SUSPENDED' WHERE id='${d.suspended.id}'; END IF; END $$`);
  const me = await call(t.base, 'GET', '/users/me', { token: s4.accessToken });
  out.push(['F07 jeton d\'un compte suspendu encore accepté', me.status === 200, `GET /users/me → ${me.status}`]);

  // F11 — promotion vers un rôle exigeant le MFA : le refresh délivre un accès sans MFA
  const p = await login(t.base, d.promoted.phone);
  await prisma.$executeRawUnsafe(`UPDATE users SET role = 'MAIRIE' WHERE id = $1`, d.promoted.id);
  const rf = await call(t.base, 'POST', '/auth/refresh', { body: { refreshToken: p.refreshToken } });
  out.push(['F11 refresh contourne le MFA du nouveau rôle', rf.status === 200 && !!rf.body?.accessToken, `POST /auth/refresh → ${rf.status}`]);

  // F08 — lecture du détail d'une alerte d'une autre commune
  const alertB = (await prisma.$queryRawUnsafe(
    `INSERT INTO alerts (id, title, description, type, "alertLevel", status, "currentStep", severity, "zoneId", "createdById", "mediaUrls", "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), 'Alerte commune B', 'Détail interne B', 'INONDATION', 'ROUGE', 'VALIDATED', 'PREFECTURE', 3, $1, $2, '{}', now(), now()) RETURNING id`,
    d.zones.b, d.victim.id))[0].id;
  const readB = await call(t.base, 'GET', `/alerts/${alertB}`, { token: c.accessToken });
  out.push(['F08 coordinateur de A lit une alerte de B', readB.status === 200, `GET /alerts/:id → ${readB.status}`]);

  // F05 — une sentinelle rejette une alerte ROUGE en attente de confirmation préfectorale
  const sv = await login(t.base, d.sentinel.phone);
  const alertA = (await prisma.$queryRawUnsafe(
    `INSERT INTO alerts (id, title, description, type, "alertLevel", status, "currentStep", severity, "zoneId", "createdById", "mediaUrls", "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), 'Alerte A', 'x', 'INONDATION', 'ROUGE', 'VALIDATED', 'PREFECTURE', 3, $1, $2, '{}', now(), now()) RETURNING id`,
    d.zones.a, d.coord.id))[0].id;
  const rej = await call(t.base, 'POST', `/alerts/${alertA}/advance`, { token: sv.accessToken, body: { action: 'REJECTED', comment: 'sonde' } });
  const st = (await prisma.$queryRawUnsafe('SELECT status::text AS s FROM alerts WHERE id = $1', alertA))[0].s;
  out.push(['F05 sentinelle rejette une ROUGE à confirmer', st === 'REJECTED', `HTTP ${rej.status}, statut ${st}`]);

  // F12 — média servi publiquement sans contrôle
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(64).fill(1)])], { type: 'image/png' }), 'p.png');
  const up = await (await fetch(`${t.base}/api/v1/upload/photo`, { method: 'POST', body: form, headers: { authorization: `Bearer ${c.accessToken}`, 'x-forwarded-for': '10.88.1.1' } })).json().catch(() => ({}));
  const file = up.filename;
  const pub = file ? await fetch(`${t.base}/uploads/${file}`) : { status: 0 };
  out.push(['F12 média lisible sans authentification (/uploads)', pub.status === 200, `GET /uploads/<fichier> → ${pub.status}`]);

  await prisma.$disconnect();
  return out;
}

(async () => {
  const results = {};
  for (const t of targets) results[t.name] = await probes(t);
  const [o, n] = targets.map((t) => results[t.name]);
  let ok = true;
  console.log('Sonde'.padEnd(52), '| Version auditée'.padEnd(26), '| Version corrigée');
  for (let i = 0; i < o.length; i++) {
    const before = o[i][1] ? 'DÉFAUT REPRODUIT' : 'non reproduit';
    const afterTxt = n[i][1] ? 'DÉFAUT PRÉSENT' : 'refusé ✓';
    if (n[i][1]) ok = false;
    console.log(o[i][0].padEnd(52), '|', before.padEnd(24), '|', afterTxt, `  (${o[i][2]} / ${n[i][2]})`);
  }
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
