import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role, AlertStatus, AlertType } from '@prisma/client';

@ApiTags('Alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private alerts: AlertsService) {}

  @Get()
  @ApiOperation({ summary: 'Liste des alertes' })
  findAll(
    @Query('zoneId') zoneId?: string,
    @Query('status') status?: AlertStatus,
    @Query('type') type?: AlertType,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.alerts.findAll({ zoneId, status, type, page, limit });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.alerts.findOne(id);
  }

  @Post()
  @Roles(Role.SENTINELLE, Role.MAIRIE, Role.PREFECTURE, Role.ADMIN)
  @ApiOperation({ summary: 'Créer une alerte' })
  create(@Body() dto: any, @CurrentUser('id') userId: string) {
    return this.alerts.create(dto, userId);
  }

  @Post(':id/validate')
  @Roles(Role.MAIRIE, Role.PREFECTURE, Role.ADMIN)
  @ApiOperation({ summary: 'Valider/rejeter une alerte' })
  validate(
    @Param('id') id: string,
    @Body() dto: { approved: boolean; comment?: string },
    @CurrentUser('id') userId: string,
  ) {
    return this.alerts.validate(id, userId, dto.approved, dto.comment);
  }

  @Patch(':id/resolve')
  @Roles(Role.PREFECTURE, Role.ADMIN)
  @ApiOperation({ summary: 'Clôturer une alerte' })
  resolve(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.alerts.resolve(id, userId);
  }
}
