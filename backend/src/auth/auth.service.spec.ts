import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AccountStatus } from '@prisma/client';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { SmsService } from '../notifications/channels/sms.service';
import { AuditService } from '../audit/audit.service';
import * as bcrypt from 'bcrypt';

const SECRETS: Record<string, string> = {
  JWT_SECRET: 'unit_jwt_secret_0123456789_abcdefghijklmn',
  JWT_REFRESH_SECRET: 'unit_refresh_secret_0123456789_abcdefghij',
  NODE_ENV: 'test',
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let sessions: { issue: jest.Mock; rotate: jest.Mock; revokeSession: jest.Mock };

  const mockUser: any = {
    id: 'user-uuid', phone: '+221700000001', name: 'Test', role: 'ADMIN',
    passwordHash: '', isActive: true, status: AccountStatus.ACTIVE, tokenVersion: 0,
    totpSecret: null, totpEnabled: false, loginFailures: 0, loginLockedUntil: null, deletedAt: null,
  };

  beforeAll(async () => { mockUser.passwordHash = await bcrypt.hash('password123', 4); });

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({ loginFailures: 1 }) } };
    sessions = { issue: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }), rotate: jest.fn(), revokeSession: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: new JwtService({ secret: SECRETS.JWT_SECRET }) },
        { provide: ConfigService, useValue: { get: (k: string) => SECRETS[k] } },
        { provide: SmsService, useValue: { sendSms: jest.fn() } },
        { provide: SessionService, useValue: sessions },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  describe('validateUser', () => {
    it('retourne l\'utilisateur sur identifiants valides', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      expect((await service.validateUser(mockUser.phone, 'password123'))!.phone).toBe(mockUser.phone);
    });

    it('retourne null sur mauvais mot de passe et compte l\'échec en base', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      expect(await service.validateUser(mockUser.phone, 'faux')).toBeNull();
      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { loginFailures: { increment: 1 } } }));
    });

    it('retourne null si l\'utilisateur est inconnu', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      expect(await service.validateUser('+221700000002', 'x')).toBeNull();
    });

    it('retourne null pour un compte suspendu, même avec le bon mot de passe', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, status: AccountStatus.SUSPENDED, isActive: false });
      expect(await service.validateUser(mockUser.phone, 'password123')).toBeNull();
    });

    it('verrouille le compte au 10e échec (verrou persisté)', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValueOnce({ loginFailures: 10 });
      await service.validateUser(mockUser.phone, 'faux');
      expect(prisma.user.update).toHaveBeenLastCalledWith(expect.objectContaining({
        data: expect.objectContaining({ loginLockedUntil: expect.any(Date) }),
      }));
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, loginLockedUntil: new Date(Date.now() + 60_000) });
      await expect(service.validateUser(mockUser.phone, 'password123')).rejects.toThrow(/verrouillé/);
    });
  });

  describe('login (MFA obligatoire pour MAIRIE+)', () => {
    it('exige l\'enrôlement TOTP au 1er login d\'un ADMIN sans TOTP', async () => {
      const r: any = await service.login(mockUser);
      expect(r.mfaSetupRequired).toBe(true);
      expect(r.mfaToken).toBeDefined();
      expect(r.accessToken).toBeUndefined();
      expect(sessions.issue).not.toHaveBeenCalled();
    });

    it('exige le code TOTP pour un ADMIN avec TOTP actif', async () => {
      const r: any = await service.login({ ...mockUser, totpEnabled: true });
      expect(r.mfaRequired).toBe(true);
      expect(r.accessToken).toBeUndefined();
    });

    it('ouvre une session sans MFA pour un CITOYEN ou une SENTINELLE', async () => {
      await service.login({ ...mockUser, role: 'CITOYEN' });
      await service.login({ ...mockUser, role: 'SENTINELLE' });
      expect(sessions.issue).toHaveBeenCalledTimes(2);
      expect(sessions.issue.mock.calls[0][1]).toBe(false);
    });

    it('refuse un compte suspendu', async () => {
      await expect(service.login({ ...mockUser, role: 'SENTINELLE', status: AccountStatus.SUSPENDED })).rejects.toThrow(/suspendu/);
    });
  });

  describe('jeton MFA intermédiaire', () => {
    it('n\'est pas accepté comme jeton de rafraîchissement', async () => {
      const real = new SessionService(prisma, new JwtService({ secret: SECRETS.JWT_SECRET }), { get: (k: string) => SECRETS[k] } as any);
      const { mfaToken } = (await service.login(mockUser)) as any;
      await expect(real.rotate(mfaToken)).rejects.toThrow();
    });

    it('n\'est pas accepté comme jeton d\'accès', async () => {
      const real = new SessionService(prisma, new JwtService({ secret: SECRETS.JWT_SECRET }), { get: (k: string) => SECRETS[k] } as any);
      const { mfaToken } = (await service.login(mockUser)) as any;
      const payload = new JwtService({ secret: SECRETS.JWT_SECRET }).verify(mfaToken);
      await expect(real.resolveAccess(payload)).rejects.toThrow();
    });
  });
});
