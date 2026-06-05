import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PrismaService } from '../common/prisma/prisma.service';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: jest.Mocked<PrismaService>;
  let jwt: jest.Mocked<JwtService>;

  const mockUser = {
    id: 'user-uuid',
    phone: '+221700000001',
    name: 'Test User',
    role: 'ADMIN' as any,
    passwordHash: '',
    isActive: true,
    totpSecret: null,
    totpEnabled: false,
  };

  beforeAll(async () => {
    mockUser.passwordHash = await bcrypt.hash('password123', 10);
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-token'),
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-secret') },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
    jwt = module.get(JwtService) as jest.Mocked<JwtService>;
  });

  describe('validateUser', () => {
    it('should return user on valid credentials', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      const result = await service.validateUser('+221700000001', 'password123');
      expect(result).toBeDefined();
      expect(result.phone).toBe('+221700000001');
    });

    it('should return null on wrong password', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      const result = await service.validateUser('+221700000001', 'wrong');
      expect(result).toBeNull();
    });

    it('should return null if user not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await service.validateUser('+221700000001', 'any');
      expect(result).toBeNull();
    });
  });

  describe('login', () => {
    it('should return tokens and user info', async () => {
      const result = await service.login(mockUser as any);
      expect(result.accessToken).toBe('mock-token');
      expect(result.refreshToken).toBe('mock-token');
      expect(result.user.phone).toBe('+221700000001');
    });
  });

  describe('refreshTokens', () => {
    it('should throw on invalid token', async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => { throw new Error('invalid'); });
      await expect(service.refreshTokens('bad-token')).rejects.toThrow('Token invalide');
    });
  });
});
