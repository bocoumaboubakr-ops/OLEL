// Seed OLEL — Gouvernance v2 (un compte par rôle, territoire Matam, permissions)
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();
const hash = (pwd) => bcrypt.hash(pwd, 10);

// En production, les mots de passe par défaut (publics dans le repo) sont
// interdits : chaque compte sans SEED_*_PASSWORD reçoit un mot de passe
// aléatoire jetable (connexion possible uniquement après reset par un admin).
const IS_PROD = process.env.NODE_ENV === 'production';
const randomPwd = () => require('crypto').randomBytes(18).toString('base64url');
const seedPwd = (envValue, fallback) => envValue || (IS_PROD ? randomPwd() : fallback);

async function main() {
  // ── Territoire Matam ───────────────────────────────────────────────────────

  const region = await prisma.region.upsert({
    where: { code: 'SN-MT' },
    update: {},
    create: { code: 'SN-MT', name: 'Matam' },
  });

  const dept = await prisma.department.upsert({
    where: { code: 'SN-MT-DEPT' },
    update: {},
    create: { code: 'SN-MT-DEPT', name: 'Département Matam', regionId: region.id },
  });

  const municipalities = [
    { code: 'SN-MT-OUR', name: 'Ourossogui' },
    { code: 'SN-MT-KAN', name: 'Kanel' },
    { code: 'SN-MT-RAN', name: 'Ranérou' },
    { code: 'SN-MT-THI', name: 'Thilogne' },
    { code: 'SN-MT-ORE', name: 'Oréfondé' },
    { code: 'SN-MT-NAB', name: 'Nabadji Civol' },
  ];
  for (const m of municipalities) {
    await prisma.municipality.upsert({
      where: { code: m.code },
      update: {},
      create: { code: m.code, name: m.name, departmentId: dept.id, latitude: 15.6556, longitude: -13.2553, radiusKm: 15 },
    });
  }

  // ── Zone Prisma (compatible avec le reste du code) ─────────────────────────

  const matam = await prisma.zone.upsert({
    where: { code: 'SN-MT' },
    update: {},
    create: { code: 'SN-MT', name: 'Matam', region: 'Sénégal', latitude: 15.6556, longitude: -13.2553, radiusKm: 50 },
  });

  const sousZones = [
    { code: 'SN-MT-OUR', name: 'Ourossogui' },
    { code: 'SN-MT-KAN', name: 'Kanel' },
    { code: 'SN-MT-RAN', name: 'Ranérou' },
    { code: 'SN-MT-THI', name: 'Thilogne' },
    { code: 'SN-MT-ORE', name: 'Oréfondé' },
    { code: 'SN-MT-NAB', name: 'Nabadji Civol' },
  ];
  for (const sz of sousZones) {
    await prisma.zone.upsert({
      where: { code: sz.code },
      update: {},
      create: { code: sz.code, name: sz.name, region: 'Sénégal', latitude: matam.latitude, longitude: matam.longitude, radiusKm: 15, parentId: matam.id },
    });
  }

  // ── Comptes (un par rôle) ──────────────────────────────────────────────────

  const users = [
    { phone: '+221700000000', email: 'superadmin@olel.sn',       name: 'Super Administrateur',    role: 'SUPER_ADMIN',        pwd: seedPwd(process.env.SEED_SUPERADMIN_PASSWORD, 'SuperOlel2024!') },
    { phone: '+221700000001', email: 'admin@olel.sn',            name: 'Administrateur OLEL',     role: 'ADMIN',              pwd: seedPwd(process.env.SEED_ADMIN_PASSWORD, 'OlelAdmin2024!') },
    { phone: '+221700000002', email: 'superviseur@olel.sn',      name: 'Superviseur Régional',    role: 'SUPERVISEUR_REGIONAL', pwd: seedPwd(process.env.SEED_SUPERVISEUR_PASSWORD, 'Superviseur2024!') },
    { phone: '+221700000003', email: 'gouverneur@olel.sn',       name: 'Gouverneur Matam',        role: 'GOUVERNORAT',        pwd: seedPwd(process.env.SEED_GOUVERNEUR_PASSWORD, 'Gouv2024!') },
    { phone: '+221700000004', email: 'protection@olel.sn',       name: 'Agent Protection Civile', role: 'PROTECTION_CIVILE',  pwd: seedPwd(process.env.SEED_PCIVILE_PASSWORD, 'PCivile2024!') },
    { phone: '+221700000005', email: 'prefet@olel.sn',           name: 'Préfet Matam',            role: 'PREFECTURE',         pwd: seedPwd(process.env.SEED_PREFET_PASSWORD, 'Prefet2024!') },
    { phone: '+221700000006', email: 'mairie@olel.sn',           name: 'Agent Mairie Ourossogui', role: 'MAIRIE',             pwd: seedPwd(process.env.SEED_MAIRIE_PASSWORD, 'Mairie2024!') },
    { phone: '+221700000007', email: 'coordinateur@olel.sn',     name: 'Coordinateur Sentinelles',role: 'COORDINATEUR',       pwd: seedPwd(process.env.SEED_COORD_PASSWORD, 'Coord2024!') },
    { phone: '+221700000008', email: 'hydro@olel.sn',            name: 'Agent Hydrologie Matam',  role: 'HYDRO_METEO',        pwd: seedPwd(process.env.SEED_HYDRO_PASSWORD, 'Hydro2024!') },
    { phone: '+221700000009', email: 'radio@olel.sn',            name: 'Radio Communautaire FM',  role: 'RADIO_COMMUNAUTAIRE',pwd: seedPwd(process.env.SEED_RADIO_PASSWORD, 'Radio2024!') },
    { phone: '+221700000010', email: 'sentinelle@olel.sn',       name: 'Sentinelle Terrain',      role: 'SENTINELLE',         pwd: seedPwd(process.env.SEED_SENTINELLE_PASSWORD, 'Sent2024!') },
    { phone: '+221700000011', email: 'citoyen@olel.sn',          name: 'Citoyen Test',            role: 'CITOYEN',            pwd: seedPwd(process.env.SEED_CITOYEN_PASSWORD, 'Citoyen2024!') },
  ];

  // Libère les emails ciblés détenus par d'anciens enregistrements (réassignation
  // de rôles entre seeds successifs → évite la collision P2002 sur email).
  const managedEmails = users.map((u) => u.email);
  await prisma.user.updateMany({
    where: { email: { in: managedEmails } },
    data: { email: null },
  });

  for (const u of users) {
    await prisma.user.upsert({
      where: { phone: u.phone },
      update: {
        email: u.email,
        name: u.name,
        role: u.role,
        passwordHash: await hash(u.pwd),
        zoneId: matam.id,
        isActive: true,
      },
      create: {
        phone: u.phone,
        email: u.email,
        name: u.name,
        role: u.role,
        passwordHash: await hash(u.pwd),
        zoneId: matam.id,
        isActive: true,
      },
    });
  }

  // BOT système
  const botPhone = process.env.BOT_ACCOUNT_PHONE || '+221700000099';
  await prisma.user.upsert({
    where: { phone: botPhone },
    update: {},
    create: { phone: botPhone, name: 'BOT OLEL', role: 'ADMIN', isActive: true, zoneId: matam.id },
  });

  // ── Feature flags ──────────────────────────────────────────────────────────

  const flags = ['whatsapp_notifications', 'sms_notifications', 'ussd_enabled', 'ivr_enabled'];
  for (const name of flags) {
    await prisma.featureFlag.upsert({
      where: { name },
      update: {},
      create: { name, enabled: name.includes('whatsapp') || name.includes('sms') },
    });
  }

  // ── Modules de formation ───────────────────────────────────────────────────

  const trainingModules = [
    { title: 'Secourisme de base',              description: 'Gestes de premiers secours : RCP, arrêt hémorragie, PLS.', category: 'SECOURISME',     order: 1, isRequired: true,  durationMin: 45 },
    { title: 'Risques inondation — Région Matam', description: 'Crues du fleuve Sénégal, zones inondables, conduite à tenir.', category: 'RISQUE_LOCAL', order: 2, isRequired: true, durationMin: 60 },
    { title: 'Procédures d\'alerte OLEL',       description: 'Signaler, valider et diffuser dans le système OLEL.',        category: 'PROCEDURE',     order: 3, isRequired: true,  durationMin: 30 },
    { title: 'Sensibilisation communautaire',   description: 'Techniques de communication pour sensibiliser la population.', category: 'SENSIBILISATION', order: 4, isRequired: false, durationMin: 40 },
    { title: 'Évacuation et points de rassemblement', description: 'Plans d\'évacuation, points de rassemblement, logistique.', category: 'PROCEDURE', order: 5, isRequired: false, durationMin: 35 },
  ];

  for (const m of trainingModules) {
    const existing = await prisma.trainingModule.findFirst({ where: { title: m.title } });
    if (!existing) await prisma.trainingModule.create({ data: m });
  }

  console.log('✅ Seed terminé : territoire Matam, 12 comptes (un par rôle), feature flags et modules de formation créés.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
