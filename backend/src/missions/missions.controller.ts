import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { MissionsService } from './missions.service';
import { CreateMissionDto, AssignMissionDto, CompleteMissionDto } from './dto/mission.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Missions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('missions')
export class MissionsController {
  constructor(private missions: MissionsService) {}

  @Get()
  @ApiOperation({ summary: 'Liste des missions (filtrée par zone si zoneId fourni)' })
  @ApiQuery({ name: 'zoneId', required: false })
  findAll(@CurrentUser() user: { id: string; role: Role }, @Query('zoneId') zoneId?: string) {
    return this.missions.findAll(user, zoneId);
  }

  @Get('me')
  @ApiOperation({ summary: 'Mes missions assignées (sentinelle)' })
  myMissions(@CurrentUser('id') userId: string) {
    return this.missions.myMissions(userId);
  }

  @Post()
  @Roles(Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Créer une mission (mairie+)' })
  create(@Body() dto: CreateMissionDto, @CurrentUser('id') userId: string) {
    return this.missions.create(dto, userId);
  }

  @Post(':id/assign')
  @Roles(Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Assigner une mission à une sentinelle' })
  assign(@Param('id') id: string, @Body() dto: AssignMissionDto) {
    return this.missions.assign(id, dto.sentinelId);
  }

  @Post(':id/accept')
  @Roles(Role.SENTINELLE, Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Accepter et démarrer une mission assignée' })
  accept(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.missions.accept(id, userId);
  }

  @Post(':id/complete')
  @Roles(Role.SENTINELLE, Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Clôturer une mission avec compte-rendu' })
  complete(@Param('id') id: string, @Body() dto: CompleteMissionDto, @CurrentUser('id') userId: string) {
    return this.missions.complete(id, userId, dto.report);
  }

  @Post(':id/reject')
  @Roles(Role.SENTINELLE, Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Refuser une mission assignée (sentinelle)' })
  reject(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.missions.reject(id, userId);
  }
}
