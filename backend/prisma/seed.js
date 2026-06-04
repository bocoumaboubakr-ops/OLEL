// Seed en JavaScript pur — exécuté avec : node prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  // Zone : Région de Matam (Sénégal)
  const matam = await prisma.zone.upsert({
    where: { code: 'SN-MT' },
    update: {},
    create: {
      code: 'SN-MT',
      name: 'Matam',
      region: 'Sénégal',
      latitude: 15.6556,
      longitude: -13.2553,
      radiusKm: 50,
    },
  });

  // Sous-zones de Matam
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

  const hash = (pwd) => bcrypt.hash(pwd, 10);

  await prisma.user.upsert({
    where: { phone: '+221700000001' },
    update: {},
    create: { phone: '+221700000001', email: 'admin@olel.sn', name: 'Administrateur OLEL', role: 'ADMIN', passwordHash: await hash(process.env.SEED_ADMIN_PASSWORD || 'OlelAdmin2024!'), zoneId: matam.id, isActive: true },
  });

  await prisma.user.upsert({
    where: { phone: '+221700000002' },
    update: {},
    create: { phone: '+221700000002', email: 'prefet@olel.sn', name: 'Préfet Matam', role: 'PREFECTURE', passwordHash: await hash(process.env.SEED_PREFET_PASSWORD || 'Prefet2024!'), zoneId: matam.id, isActive: true },
  });

  await prisma.user.upsert({
    where: { phone: '+221700000003' },
    update: {},
    create: { phone: '+221700000003', name: 'Sentinelle Terrain', role: 'SENTINELLE', passwordHash: await hash(process.env.SEED_SENTINELLE_PASSWORD || 'Sent2024!'), zoneId: matam.id, isActive: true },
  });

  // ── Comptes de test couvrant chaque niveau du cursus (CURSUS_ALERTE.md) ──
  const testUsers = [
    { phone: '+221700000004', email: 'maire@olel.sn',      name: 'Maire Ourossogui',  role: 'MAIRIE',            pwd: 'Maire2024!' },
    { phone: '+221700000005', email: 'gouverneur@olel.sn', name: 'Gouverneur Matam',  role: 'GOUVERNORAT',       pwd: 'Gouv2024!' },
    { phone: '+221700000006', email: 'protection@olel.sn', name: 'Protection Civile', role: 'PROTECTION_CIVILE', pwd: 'Protec2024!' },
    { phone: '+221700000007', email: 'citoyen@olel.sn',    name: 'Citoyen Test',      role: 'CITOYEN',           pwd: 'Citoyen2024!' },
  ];
  for (const u of testUsers) {
    await prisma.user.upsert({
      where: { phone: u.phone },
      update: { role: u.role },
      create: { phone: u.phone, email: u.email, name: u.name, role: u.role, passwordHash: await hash(process.env[`SEED_${u.role}_PASSWORD`] || u.pwd), zoneId: matam.id, isActive: true },
    });
  }

  const botPhone = process.env.BOT_ACCOUNT_PHONE || '+221700000099';
  await prisma.user.upsert({
    where: { phone: botPhone },
    update: {},
    create: { phone: botPhone, name: 'BOT OLEL', role: 'ADMIN', isActive: true, zoneId: matam.id },
  });

  const flags = ['whatsapp_notifications', 'sms_notifications', 'ussd_enabled', 'ivr_enabled'];
  for (const name of flags) {
    await prisma.featureFlag.upsert({
      where: { name },
      update: {},
      create: { name, enabled: name.includes('whatsapp') || name.includes('sms') },
    });
  }

  console.log('✅ Seed terminé : zone Matam, sous-zones, utilisateurs et feature flags créés.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
