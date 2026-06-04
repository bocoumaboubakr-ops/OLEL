import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const mockUser = {
  id: 'user-1',
  name: 'Mamadou Diallo',
  phone: '+224600000001',
  email: 'mamadou@example.com',
  role: Role.CITOYEN,
  zoneId: 'zone-1',
  isActive: true,
  createdAt: new Date(),
};

describe('UsersService', () => {
  let service: UsersService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findMany: jest.fn(),
              count: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('retourne la liste paginée des utilisateurs', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([mockUser]);
      (prisma.user.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findAll(1, 20);

      expect(result.users).toEqual([mockUser]);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });
  });

  describe('create', () => {
    it('crée un utilisateur et hash le mot de passe', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue({
        id: mockUser.id,
        name: mockUser.name,
        phone: mockUser.phone,
        role: mockUser.role,
        createdAt: mockUser.createdAt,
      });

      const dto = {
        name: 'Mamadou Diallo',
        phone: '+224600000001',
        role: Role.CITOYEN,
        password: 'password123',
      };

      const result = await service.create(dto);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: dto.name,
            phone: dto.phone,
            role: dto.role,
          }),
        }),
      );
      // Vérifie que passwordHash est un hash bcrypt
      const createCall = (prisma.user.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.passwordHash).toBeDefined();
      const isHashed = await bcrypt.compare(dto.password, createCall.data.passwordHash);
      expect(isHashed).toBe(true);
      expect(result).toBeDefined();
    });

    it('lève ConflictException si le numéro de téléphone est déjà pris', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await expect(
        service.create({
          name: 'Test',
          phone: '+224600000001',
          role: Role.CITOYEN,
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findOne', () => {
    it('retourne l\'utilisateur correspondant à l\'id', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.findOne('user-1');

      expect(result).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
    });

    it('lève NotFoundException si l\'utilisateur est absent', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('met à jour les champs de l\'utilisateur', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue({ ...mockUser, name: 'Nouveau Nom' });

      const result = await service.update('user-1', { name: 'Nouveau Nom' });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: { name: 'Nouveau Nom' },
        }),
      );
      expect(result.name).toBe('Nouveau Nom');
    });
  });

  describe('remove', () => {
    it('désactive l\'utilisateur (isActive = false) sans le supprimer', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue({ ...mockUser, isActive: false });

      await service.remove('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { isActive: false },
      });
      // Ne doit pas appeler delete
      expect((prisma.user as any).delete).toBeUndefined();
    });
  });
});
