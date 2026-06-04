import { Test, TestingModule } from '@nestjs/testing';
import { ZonesService } from './zones.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

const mockZone = {
  id: 'zone-1',
  name: 'Zone Conakry Sud',
  code: 'CKY-S',
  region: 'Conakry',
  isActive: true,
  latitude: 9.5,
  longitude: -13.7,
  radiusKm: 10,
  parentId: null,
  _count: { users: 5, alerts: 2 },
};

describe('ZonesService', () => {
  let service: ZonesService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ZonesService,
        {
          provide: PrismaService,
          useValue: {
            zone: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<ZonesService>(ZonesService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('retourne uniquement les zones actives', async () => {
      (prisma.zone.findMany as jest.Mock).mockResolvedValue([mockZone]);

      const result = await service.findAll();

      expect(result).toEqual([mockZone]);
      expect(prisma.zone.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('retourne la zone correspondant à l\'id', async () => {
      (prisma.zone.findUnique as jest.Mock).mockResolvedValue({
        ...mockZone,
        children: [],
      });

      const result = await service.findOne('zone-1');

      expect(result).toMatchObject({ id: 'zone-1', name: 'Zone Conakry Sud' });
      expect(prisma.zone.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'zone-1' } }),
      );
    });

    it('lève NotFoundException si la zone est absente', async () => {
      (prisma.zone.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('crée et retourne une nouvelle zone', async () => {
      const dto = {
        name: 'Zone Nord',
        code: 'NRD',
        region: 'Kindia',
        latitude: 10.0,
        longitude: -12.5,
        radiusKm: 15,
      };
      (prisma.zone.create as jest.Mock).mockResolvedValue({ id: 'zone-2', ...dto });

      const result = await service.create(dto);

      expect(prisma.zone.create).toHaveBeenCalledWith({ data: dto });
      expect(result).toMatchObject({ id: 'zone-2', name: 'Zone Nord' });
    });
  });
});
