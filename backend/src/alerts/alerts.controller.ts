import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AlertsService } from './alerts.service';
import { CreateAlertDto } from './dto/create-alert.dto';
import { ValidateAlertDto, CloseAlertDto, BroadcastAlertDto } from './dto/validate-alert.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ThrottleNormal } from '../common/decorators/throttle.decorator';
import { Role, AlertStatus, AlertStep, AlertType, AlertLevel } from '@prisma/client';

@ApiTags('Alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private alerts: AlertsService) {}

  @Get('queue')
  @Roles(Role.SENTINELLE, Role.COORDINATEUR, Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.SUPERVISEUR_REGIONAL, Role.HYDRO_METEO, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'File d\'attente personnalisée par rôle' })
  getQueue(@CurrentUser() user: { id: string; role: Role }) {
    return this.alerts.getQueue(user);
  }

  @Get('broadcasts')
  @Roles(Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Historique des diffusions' })
  getBroadcasts(@Query('alertId') alertId?: string) {
    return this.alerts.getBroadcasts(alertId);
  }

  @Get()
  @ApiOperation({ summary: 'Liste des alertes' })
  findAll(
    @Query('zoneId') zoneId?: string,
    @Query('status') status?: AlertStatus,
    @Query('type') type?: AlertType,
    @Query('step') step?: AlertStep,
    @Query('alertLevel') alertLevel?: AlertLevel,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.alerts.findAll({ zoneId, status, type, step, alertLevel, page, limit });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.alerts.findOne(id);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Historique des validations' })
  history(@Param('id') id: string) {
    return this.alerts.getHistory(id);
  }

  @Get(':id/context')
  @ApiOperation({ summary: 'Recoupement : signalements proches + données OMVS' })
  context(
    @Param('id') id: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('windowHours') windowHours?: string,
  ) {
    return this.alerts.getContext(id, {
      radiusKm: radiusKm ? Number(radiusKm) : undefined,
      windowHours: windowHours ? Number(windowHours) : undefined,
    });
  }

  @Get(':id/critical-validations')
  @Roles(Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Statut des 3 validations critiques requises (ORANGE+)' })
  criticalStatus(@Param('id') id: string) {
    return this.alerts.getCriticalValidationStatus(id);
  }

  @Post()
  @ThrottleNormal()
  @Roles(Role.CITOYEN, Role.SENTINELLE, Role.COORDINATEUR, Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.HYDRO_METEO, Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Créer un signalement / alerte' })
  create(@Body() dto: CreateAlertDto, @CurrentUser() user: { id: string; role: Role }) {
    return this.alerts.create(dto, user.id, user.role);
  }

  @Post(':id/advance')
  @Roles(Role.SENTINELLE, Role.COORDINATEUR, Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Faire avancer une alerte (valider / rejeter / escalader)' })
  advance(@Param('id') id: string, @Body() dto: ValidateAlertDto, @CurrentUser() user: { id: string; role: Role }) {
    return this.alerts.advance(id, user, dto);
  }

  @Post(':id/critical-validate')
  @Roles(Role.SENTINELLE, Role.COORDINATEUR, Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Enregistrer une validation critique (ORANGE/ROUGE/ROUGE_FONCE)' })
  criticalValidate(
    @Param('id') id: string,
    @Body('comment') comment: string,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.alerts.addCriticalValidation(id, user, comment);
  }

  @Post(':id/broadcast')
  @Roles(Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Diffuser une alerte validée (multi-canal)' })
  broadcast(@Param('id') id: string, @Body() dto: BroadcastAlertDto, @CurrentUser() user: { id: string; role: Role }) {
    return this.alerts.broadcast(id, user, dto);
  }

  @Post(':id/emergency-bypass')
  @Roles(Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: "Diffusion d'urgence (court-circuit cursus, justification obligatoire)" })
  emergencyBypass(@Param('id') id: string, @Body() body: { justification: string }, @CurrentUser() user: { id: string; role: Role }) {
    return this.alerts.emergencyBypass(id, user, body);
  }

  @Post(':id/close')
  @Roles(Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Clôturer une alerte (raison obligatoire)' })
  close(@Param('id') id: string, @Body() dto: CloseAlertDto, @CurrentUser() user: { id: string; role: Role }) {
    return this.alerts.close(id, user, dto.reason);
  }

  @Post(':id/medical-clearance')
  @Roles(Role.PROTECTION_CIVILE, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Lever le blocage médical EPIDEMIE' })
  medicalClearance(@Param('id') id: string, @CurrentUser() user: { id: string; role: Role }) {
    return this.alerts.medicalClearance(id, user);
  }
}
