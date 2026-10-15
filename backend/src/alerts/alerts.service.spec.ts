import { Test, TestingModule } from '@nestjs/testing';
import { AlertsService } from './alerts.service';
import { AlertsGateway } from './alerts.gateway';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TerritoryService } from '../common/territory/territory.service';
import { BroadcastDispatcher } from '../notifications/broadcast-dispatcher.service';
import { FlagsService } from '../flags/flags.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';

const module_territory = (svc: AlertsService) => (svc as any).territory as { isWithin: jest.Mock };

describe('AlertsService', () => {
  let service: AlertsService;
  let prisma: any;
  let audit: any;

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
        { provide: AlertsGateway, useValue: { alertChanged: jest.fn() } },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: TerritoryService, useValue: { isWithin: jest.fn().mockResolvedValue(true) } },
        { provide: BroadcastDispatcher, useValue: { kick: jest.fn() } },
        { provide: FlagsService, useValue: { isEnabled: jest.fn().mockResolvedValue(false) } },
      ],
    }).compile();

    service = module.get(AlertsService);
    prisma = module.get(PrismaService);
    audit = module.get(AuditService);
  });

  describe('findAll', () => {
    it('should return paginated alerts', async () => {
      const result = await service.findAll({ page: 1, limit: 20 }, { id: 'admin', role: 'SUPER_ADMIN' as any });
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

  describe('advance', () => {
    it('should throw ForbiddenException on a terminal (CLOSED) alert', async () => {
      prisma.alert.findUnique.mockResolvedValue({ ...mockAlert, status: 'CLOSED', currentStep: 'CLOSED', signalements: [], validations: [] });
      await expect(
        service.advance('alert-uuid', { id: 'validator-uuid', role: 'ADMIN' as any }, { action: 'VALIDATED' as any }),
      ).rejects.toThrow(ForbiddenException);
      // Le refus est tracé (audit F05)
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'alert.advance.denied' }));
    });

    it('refuse une alerte hors du territoire du validateur', async () => {
      prisma.alert.findUnique.mockResolvedValue({ ...mockAlert, alertLevel: 'JAUNE', status: 'PENDING', currentStep: 'SIGNALEMENT', signalements: [], validations: [] });
      (module_territory(service)).isWithin.mockResolvedValue(false);
      await expect(
        service.advance('alert-uuid', { id: 'v', role: 'SENTINELLE' as any, zoneId: 'autre' }, { action: 'VALIDATED' as any, latitude: 1, longitude: 1, gravity: 1, photoUrl: '/uploads/p.jpg' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject sentinelle validation without GPS/photo/gravity', async () => {
      prisma.alert.findUnique.mockResolvedValue({ ...mockAlert, alertLevel: 'JAUNE', status: 'PENDING', currentStep: 'SIGNALEMENT', signalements: [], validations: [] });
      await expect(
        service.advance('alert-uuid', { id: 'v', role: 'SENTINELLE' as any, zoneId: 'zone-uuid' }, { action: 'VALIDATED' as any }),
      ).rejects.toThrow(BadRequestException);
      // un vocal ne remplace pas la photo de preuve
      prisma.alert.findUnique.mockResolvedValue({ ...mockAlert, alertLevel: 'JAUNE', status: 'PENDING', currentStep: 'SIGNALEMENT', mediaUrls: ['/uploads/v.ogg'], signalements: [], validations: [] });
      await expect(
        service.advance('alert-uuid', { id: 'v', role: 'SENTINELLE' as any, zoneId: 'zone-uuid' }, { action: 'VALIDATED' as any, latitude: 15.6, longitude: -13.2, gravity: 2 }),
      ).rejects.toThrow(/Photo/);
    });
  });
});
