import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TerritoriesService } from './territories.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Territories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('territories')
export class TerritoriesController {
  constructor(private territories: TerritoriesService) {}

  @Get('regions')
  @ApiOperation({ summary: 'Liste des régions' })
  getRegions() { return this.territories.getRegions(); }

  @Get('departments')
  @ApiOperation({ summary: 'Liste des départements' })
  getDepartments() { return this.territories.getDepartments(); }

  @Get('municipalities')
  @ApiOperation({ summary: 'Liste des communes' })
  getMunicipalities() { return this.territories.getMunicipalities(); }

  @Get('regions/:id/departments')
  @ApiOperation({ summary: 'Départements d\'une région' })
  getByRegion(@Param('id') id: string) { return this.territories.getDepartmentsByRegion(id); }

  @Get('departments/:id/municipalities')
  @ApiOperation({ summary: 'Communes d\'un département' })
  getByDept(@Param('id') id: string) { return this.territories.getMunicipalitiesByDepartment(id); }

  @Post('regions')
  @Roles(Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Créer une région' })
  createRegion(@Body() dto: { name: string; code: string }) {
    return this.territories.createRegion(dto);
  }

  @Post('departments')
  @Roles(Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Créer un département' })
  createDepartment(@Body() dto: { name: string; code: string; regionId: string }) {
    return this.territories.createDepartment(dto);
  }

  @Post('municipalities')
  @Roles(Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Créer une commune' })
  createMunicipality(@Body() dto: { name: string; code: string; departmentId: string; latitude?: number; longitude?: number; radiusKm?: number }) {
    return this.territories.createMunicipality(dto);
  }
}
