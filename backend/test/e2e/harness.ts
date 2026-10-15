/**
 * Harnais e2e OLEL : démarre la VRAIE application NestJS (AppModule +
 * configureApp, identique à main.ts) contre une base PostgreSQL et un Redis
 * de test (scripts/test-services.sh). Données 100 % fictives ; aucun
 * fournisseur réel n'est contacté (WHATSAPP_TOKEN vide = simulation tracée).
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, Role, AccountStatus } from '@prisma/client';
import { authenticator } from 'otplib';
import * as bcrypt from 'bcrypt';
import { AddressInfo } from 'net';

export const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://olel@127.0.0.1:55432/olel_test',
  REDIS_HOST: process.env.TEST_REDIS_HOST || '127.0.0.1',
  REDIS_PORT: process.env.TEST_REDIS_PORT || '56379',
  JWT_SECRET: 'test_jwt_secret_0123456789_abcdefghijklmnop',
  JWT_REFRESH_SECRET: 'test_refresh_secret_0123456789_abcdefghijkl',
  TOTP_ENCRYPTION_KEY: 'test_totp_encryption_key_0123456789_abcd',
  BOT_API_KEY: 'test-bot-api-key-0123456789',
  WHATSAPP_TOKEN: '',
  ALLOWED_ORIGINS: 'http://localhost:3000',
  UPLOAD_DIR: '/tmp/olel-e2e-uploads',
};
Object.assign(process.env, TEST_ENV);

export const PASSWORD = 'MotDePasse-Test-123';

export interface Ctx {
  app: INestApplication;
  baseUrl: string;
  prisma: PrismaClient;
  zones: Record<'matam' | 'kanel' | 'communeA' | 'communeB' | 'matamDept' | 'communeC', string>;
}

export async function bootApp(): Promise<Ctx> {
  // Import après process.env pour que ConfigModule lise l'environnement de test
  const { AppModule } = await import('../../src/app.module');
  const { configureApp } = await import('../../src/bootstrap');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app);
  await app.init();
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_ENV.DATABASE_URL } } });
  return { app, baseUrl: `http://127.0.0.1:${port}/api/v1`, prisma, zones: {} as any };
}

export async function resetDb(prisma: PrismaClient) {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  // Un worker peut encore terminer une diffusion du test précédent : en cas
  // d'interblocage avec le TRUNCATE, on réessaie (jamais de test sur base sale).
  for (let attempt = 1; ; attempt++) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
      return;
    } catch (e: any) {
      if (attempt >= 5 || !String(e?.message).includes('deadlock')) throw e;
      await new Promise((r) => setTimeout(r, 200 * attempt));
    }
  }
}

/**
 * Arborescence fictive :
 *   Matam (région)
 *   ├── Kanel (département) ── Commune A, Commune B
 *   └── Matam-Dept (département) ── Commune C
 */
export async function seedZones(ctx: Ctx) {
  const z = async (name: string, code: string, parentId?: string) =>
    (await ctx.prisma.zone.create({ data: { name, code, region: 'Matam', parentId } })).id;
  const matam = await z('Matam', 'MAT');
  const kanel = await z('Kanel', 'KAN', matam);
  const matamDept = await z('Matam Dept', 'MATD', matam);
  ctx.zones = {
    matam, kanel, matamDept,
    communeA: await z('Commune A', 'KAN-A', kanel),
    communeB: await z('Commune B', 'KAN-B', kanel),
    communeC: await z('Commune C', 'MATD-C', matamDept),
  };
}

let phoneSeq = 770000000;
export interface TestUser { id: string; phone: string; role: Role; totpSecret?: string }

export async function createUser(ctx: Ctx, role: Role, zoneId: string, opts: { status?: AccountStatus; mfa?: boolean } = {}): Promise<TestUser> {
  const phone = `+221${phoneSeq++}`;
  const totpSecret = opts.mfa ? authenticator.generateSecret() : undefined;
  // Le secret TOTP est stocké chiffré par l'app : on passe par le module de chiffrement réel
  const { encryptTotpSecret } = await import('../../src/auth/totp-crypto');
  const status = opts.status ?? AccountStatus.ACTIVE;
  const u = await ctx.prisma.user.create({
    data: {
      phone, name: `${role} test`, role, zoneId, status, isActive: status !== AccountStatus.SUSPENDED,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      ...(totpSecret ? { totpSecret: encryptTotpSecret(totpSecret, TEST_ENV.TOTP_ENCRYPTION_KEY), totpEnabled: true } : {}),
    },
  });
  return { id: u.id, phone, role, totpSecret };
}

let ipSeq = 1;
/** Chaque appel simule un client distinct derrière Nginx (sauf IP imposée). */
const nextIp = () => { ipSeq++; return `10.${(ipSeq >> 16) & 255}.${(ipSeq >> 8) & 255}.${ipSeq & 255}`; };

export async function api(ctx: Ctx, method: string, path: string, opts: { token?: string; body?: any; headers?: Record<string, string> } = {}) {
  const res = await fetch(`${ctx.baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': nextIp(),
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers || {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any; try { json = text ? JSON.parse(text) : undefined; } catch { json = text; }
  return { status: res.status, body: json };
}

/** Connexion complète (mot de passe + TOTP si exigé). */
export async function login(ctx: Ctx, u: TestUser): Promise<{ accessToken: string; refreshToken: string }> {
  const r = await api(ctx, 'POST', '/auth/login', { body: { phone: u.phone, password: PASSWORD } });
  if (r.status !== 200) throw new Error(`login ${u.role} → ${r.status} ${JSON.stringify(r.body)}`);
  if (r.body.accessToken) return r.body;
  if (!r.body.mfaRequired || !u.totpSecret) throw new Error(`MFA inattendu pour ${u.role}: ${JSON.stringify(r.body)}`);
  const t = await api(ctx, 'POST', '/auth/totp/login', { body: { mfaToken: r.body.mfaToken, code: authenticator.generate(u.totpSecret) } });
  if (t.status !== 200) throw new Error(`totp ${u.role} → ${t.status} ${JSON.stringify(t.body)}`);
  return t.body;
}
