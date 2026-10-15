import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SessionService } from '../auth/session.service';
import { TerritoryService } from '../common/territory/territory.service';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccountStatus, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const admin = { id: 'admin-1', role: Role.ADMIN, zoneId: 'root' };
const mockUser = {
  id: 'user-1', name: 'Mamadou Diallo', phone: '+221770000001', email: 'm@example.com',
  role: Role.CITOYEN, zoneId: 'zone-1', isActive: true, status: AccountStatus.ACTIVE, createdAt: new Date(),
};

describe('UsersService', () => {
  let service: UsersService;
  let prisma: any;
  let sessions: { revokeAllForUser: jest.Mock };

  beforeEach(async () => {
    sessions = { revokeAllForUser: jest.fn() };
    prisma = {
      user: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: SessionService, useValue: sessions },
        { provide: TerritoryService, useValue: { isWithin: jest.fn().mockResolvedValue(true), subtree: jest.fn().mockResolvedValue(['zone-1']) } },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  it('findAll pagine et borne la limite', async () => {
    prisma.user.findMany.mockResolvedValue([mockUser]);
    prisma.user.count.mockResolvedValue(1);
    const r = await service.findAll({ page: 1, limit: 500 }, admin);
    expect(r.limit).toBe(200);
    expect(r.users).toEqual([mockUser]);
  });

  it('create hache le mot de passe (bcrypt) et ne stocke jamais le clair', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'u' });
    await service.create({ name: 'A', phone: '+221770000002', role: Role.CITOYEN, password: 'password123' }, admin);
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.password).toBeUndefined();
    expect(await bcrypt.compare('password123', data.passwordHash)).toBe(true);
  });

  it('create : une sentinelle naît IN_TRAINING', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'u' });
    await service.create({ name: 'S', phone: '+221770000003', role: Role.SENTINELLE, password: 'password123', zoneId: 'zone-1' }, admin);
    expect(prisma.user.create.mock.calls[0][0].data.status).toBe(AccountStatus.IN_TRAINING);
  });

  it('create lève ConflictException si le numéro est déjà pris', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser);
    await expect(service.create({ name: 'T', phone: mockUser.phone, role: Role.CITOYEN, password: 'password123' }, admin))
      .rejects.toThrow(ConflictException);
  });

  it('create refuse un rôle non attribuable (ADMIN ne crée pas d\'ADMIN)', async () => {
    await expect(service.create({ name: 'T', phone: '+221770000004', role: Role.ADMIN, password: 'password123' }, admin))
      .rejects.toThrow(ForbiddenException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('findOne lève NotFoundException si absent', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
  });

  it('update d\'un nom seul ne révoque pas les sessions', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser);
    prisma.user.update.mockResolvedValue({ ...mockUser, name: 'Nouveau' });
    await service.update('user-1', { name: 'Nouveau' }, admin);
    expect(sessions.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('update d\'un rôle révoque toutes les sessions de la cible', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser);
    prisma.user.update.mockResolvedValue({ ...mockUser, role: Role.SENTINELLE });
    await service.update('user-1', { role: Role.SENTINELLE }, admin);
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith('user-1', 'account_changed', prisma);
  });

  it('remove suspend (statut SUSPENDED) sans supprimer, et révoque les sessions', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser);
    await service.remove('user-1', admin);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { status: AccountStatus.SUSPENDED, isActive: false } });
    expect(sessions.revokeAllForUser).toHaveBeenCalled();
    expect(prisma.user.delete).toBeUndefined();
  });
});
