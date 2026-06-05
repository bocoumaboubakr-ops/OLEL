import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AlertsService } from './alerts.service';
import { CreateAlertDto } from './dto/create-alert.dto';
import { ValidateAlertDto, CloseAlertDto } from './dto/validate-alert.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ThrottleNormal } from '../common/decorators/throttle.decorator';
import { Role, AlertStatus, AlertStep, AlertType } from '@prisma/client';

@ApiTags('Alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private alerts: AlertsService) {}

  @Get('queue')
  @Roles(Role.SENTINELLE, Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'File d\'attente personnalisée par rôle (signalements à traiter)' })
  getQueue(@CurrentUser() user: { id: string; role: Role }) {
    return this.alerts.getQueue(user);
  }

  @Get()
  @ApiOperation({ summary: 'Liste des alertes' })
  findAll(
    @Query('zoneId') zoneId?: string,
    @Query('status') status?: AlertStatus,
    @Query('type') type?: AlertType,
    @Query('step') step?: AlertStep,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.alerts.findAll({ zoneId, status, type, step, page, limit });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.alerts.findOne(id);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Historique des validations d\'une alerte' })
  history(@Param('id') id: string) {
    return this.alerts.getHistory(id);
  }

  @Post()
  @ThrottleNormal()
  @Roles(Role.CITOYEN, Role.SENTINELLE, Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Créer une alerte (signalement)' })
  create(@Body() dto: CreateAlertDto, @CurrentUser() user: { id: string; role: Role }) {
    return this.alerts.create(dto, user.id, user.role);
  }

  @Post(':id/advance')
  @Roles(Role.SENTINELLE, Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Faire avancer une alerte dans le cursus (valider/rejeter/escalader)' })
  advance(@Param('id') id: string, @Body() dto: ValidateAlertDto, @CurrentUser() user: { id: string; role: Role }) {
    return this.alerts.advance(id, user, dto);
  }

  @Post(':id/broadcast')
  @Roles(Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Diffuser une alerte validée (multi-canal)' })
  broadcast(@Param('id') id: string, @CurrentUser() user: { id: string; role: Role }) {
    return this.alerts.broadcast(id, user);
  }

  @Post(':id/close')
  @Roles(Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Clôturer une alerte (raison obligatoire)' })
  close(@Param('id') id: string, @Body() dto: CloseAlertDto, @CurrentUser() user: { id: string; role: Role }) {
    return this.alerts.close(id, user, dto.reason);
  }

  @Post(':id/medical-clearance')
  @Roles(Role.PROTECTION_CIVILE, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Lever le blocage médical (EPIDEMIE) — Protection Civile uniquement' })
  medicalClearance(@Param('id') id: string, @CurrentUser() user: { id: string; role: Role }) {
    return this.alerts.medicalClearance(id, user);
  }
}
