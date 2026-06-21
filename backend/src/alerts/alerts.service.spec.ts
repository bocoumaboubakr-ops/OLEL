import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { AlertsService } from './alerts.service';
import { AlertsGateway } from './alerts.gateway';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('AlertsService', () => {
  let service: AlertsService;
  let prisma: any;
  let queue: any;
  let gateway: any;

  const mockAlert = {
    id: 'alert-uuid',
    title: 'Inondation critique',
    description: 'Montée des eaux rapide',
    type: 'TEMPETE',
    status: 'PENDING',
    currentStep: 'SIGNALEMENT',
    severity: 3,
    zoneId: 'zone-uuid',
    zone: { name: 'Matam', code: 'SN-MT' },
    createdById: 'user-uuid',
    mediaUrls: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertsService,
        {
          provide: PrismaService,
          useValue: {
            alert: {
              findMany: jest.fn().mockResolvedValue([mockAlert]),
              count: jest.fn().mockResolvedValue(1),
              findUnique: jest.fn().mockResolvedValue(mockAlert),
              create: jest.fn().mockResolvedValue(mockAlert),
              update: jest.fn().mockResolvedValue(mockAlert),
            },
            validation: {
              create: jest.fn().mockResolvedValue({}),
              upsert: jest.fn().mockResolvedValue({}),
            },
            signalement: {
              create: jest.fn().mockResolvedValue({}),
            },
            user: {
              findUnique: jest.fn().mockResolvedValue({ zoneId: 'zone-uuid' }),
            },
            zone: {
              findFirst: jest.fn().mockResolvedValue({ id: 'zone-uuid' }),
            },
          },
        },
        {
          provide: getQueueToken('notifications'),
          useValue: { add: jest.fn() },
        },
        {
          provide: AlertsGateway,
          useValue: { broadcastAlert: jest.fn() },
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(AlertsService);
    prisma = module.get(PrismaService);
    queue = module.get(getQueueToken('notifications'));
    gateway = module.get(AlertsGateway);
  });

  describe('findAll', () => {
    it('should return paginated alerts', async () => {
      const result = await service.findAll({ page: 1, limit: 20 });
      expect(result.alerts).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('should return an alert by id', async () => {
      prisma.alert.findUnique.mockResolvedValue({ ...mockAlert, signalements: [], validations: [] });
      const result = await service.findOne('alert-uuid');
      expect(result.id).toBe('alert-uuid');
    });

    it('should throw NotFoundException if not found', async () => {
      prisma.alert.findUnique.mockResolvedValue(null);
      await expect(service.findOne('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create alert and queue notification', async () => {
      await service.create({ title: 'Test', description: 'Desc', type: 'SECHERESSE', zoneId: 'zone-uuid', severity: 2 }, 'user-uuid');
      expect(queue.add).toHaveBeenCalledWith('fanout', expect.any(Object), expect.any(Object));
      expect(gateway.broadcastAlert).toHaveBeenCalled();
    });
  });

  describe('advance', () => {
    it('should throw ForbiddenException on a terminal (CLOSED) alert', async () => {
      prisma.alert.findUnique.mockResolvedValue({ ...mockAlert, status: 'CLOSED', currentStep: 'CLOSED', signalements: [], validations: [] });
      await expect(
        service.advance('alert-uuid', { id: 'validator-uuid', role: 'ADMIN' as any }, { action: 'VALIDATED' as any }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject sentinelle validation without GPS/photo/gravity', async () => {
      prisma.alert.findUnique.mockResolvedValue({ ...mockAlert, status: 'PENDING', currentStep: 'SIGNALEMENT', signalements: [], validations: [] });
      await expect(
        service.advance('alert-uuid', { id: 'v', role: 'SENTINELLE' as any }, { action: 'VALIDATED' as any }),
      ).rejects.toThrow();
    });
  });
});
