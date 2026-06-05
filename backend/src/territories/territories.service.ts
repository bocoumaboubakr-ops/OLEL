import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class TerritoriesService {
  constructor(private prisma: PrismaService) {}

  getRegions() {
    return this.prisma.region.findMany({ orderBy: { name: 'asc' } });
  }

  getDepartments() {
    return this.prisma.department.findMany({
      include: { region: { select: { name: true, code: true } } },
      orderBy: { name: 'asc' },
    });
  }

  getMunicipalities() {
    return this.prisma.municipality.findMany({
      where: { isActive: true },
      include: { department: { include: { region: { select: { name: true } } } } },
      orderBy: { name: 'asc' },
    });
  }

  getDepartmentsByRegion(regionId: string) {
    return this.prisma.department.findMany({
      where: { regionId },
      include: { municipalities: { where: { isActive: true } } },
      orderBy: { name: 'asc' },
    });
  }

  getMunicipalitiesByDepartment(departmentId: string) {
    return this.prisma.municipality.findMany({
      where: { departmentId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  createRegion(dto: { name: string; code: string }) {
    return this.prisma.region.create({ data: dto });
  }

  createDepartment(dto: { name: string; code: string; regionId: string }) {
    return this.prisma.department.create({ data: dto });
  }

  createMunicipality(dto: { name: string; code: string; departmentId: string; latitude?: number; longitude?: number; radiusKm?: number }) {
    return this.prisma.municipality.create({ data: dto });
  }
}
