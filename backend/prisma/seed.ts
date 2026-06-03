import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

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

  // Sous-zones de Matam (communes / arrondissements)
  const sousZonesMatam = [
    { code: 'SN-MT-OUR', name: 'Ourossogui' },
    { code: 'SN-MT-KAN', name: 'Kanel' },
    { code: 'SN-MT-RAN', name: 'Ranérou' },
    { code: 'SN-MT-THI', name: 'Thilogne' },
    { code: 'SN-MT-ORE', name: 'Oréfondé' },
    { code: 'SN-MT-NAB', name: 'Nabadji Civol' },
  ];
  for (const sz of sousZonesMatam) {
    await prisma.zone.upsert({
      where: { code: sz.code },
      update: {},
      create: {
        code: sz.code,
        name: sz.name,
        region: 'Sénégal',
        latitude: matam.latitude,
        longitude: matam.longitude,
        radiusKm: 15,
        parentId: matam.id,
      },
    });
  }

  const hash = (pwd: string) => bcrypt.hash(pwd, 10);

  // Compte admin
  await prisma.user.upsert({
    where: { phone: '+221700000001' },
    update: {},
    create: {
      phone: '+221700000001',
      email: 'admin@olel.sn',
      name: 'Administrateur OLEL',
      role: Role.ADMIN,
      passwordHash: await hash(process.env.SEED_ADMIN_PASSWORD || 'OlelAdmin2024!'),
      zoneId: matam.id,
      isActive: true,
    },
  });

  // Compte préfet
  await prisma.user.upsert({
    where: { phone: '+221700000002' },
    update: {},
    create: {
      phone: '+221700000002',
      email: 'prefet@olel.sn',
      name: 'Préfet Matam',
      role: Role.PREFECTURE,
      passwordHash: await hash(process.env.SEED_PREFET_PASSWORD || 'Prefet2024!'),
      zoneId: matam.id,
      isActive: true,
    },
  });

  // Compte sentinelle
  await prisma.user.upsert({
    where: { phone: '+221700000003' },
    update: {},
    create: {
      phone: '+221700000003',
      name: 'Sentinelle Terrain',
      role: Role.SENTINELLE,
      passwordHash: await hash(process.env.SEED_SENTINELLE_PASSWORD || 'Sent2024!'),
      zoneId: matam.id,
      isActive: true,
    },
  });

  // Compte bot système
  const botPhone = process.env.BOT_ACCOUNT_PHONE || '+221700000099';
  await prisma.user.upsert({
    where: { phone: botPhone },
    update: {},
    create: {
      phone: botPhone,
      name: 'BOT OLEL',
      role: Role.ADMIN,
      isActive: true,
      zoneId: matam.id,
    },
  });

  // Feature flags par défaut
  const flags = ['whatsapp_notifications', 'sms_notifications', 'ussd_enabled', 'ivr_enabled'];
  for (const name of flags) {
    await prisma.featureFlag.upsert({
      where: { name },
      update: {},
      create: { name, enabled: name.includes('whatsapp') || name.includes('sms') },
    });
  }

  console.log('Seed terminé : zone Matam, utilisateurs et feature flags créés.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
