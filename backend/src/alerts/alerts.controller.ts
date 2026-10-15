import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AlertsService } from './alerts.service';
import { CreateAlertDto } from './dto/create-alert.dto';
import { ValidateAlertDto, CloseAlertDto, BroadcastAlertDto, EmergencyBypassDto, BypassReviewDto, CorrectionDto, RetractionDto } from './dto/validate-alert.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ThrottleNormal } from '../common/decorators/throttle.decorator';
import { Role, AlertStatus, AlertStep, AlertType, AlertLevel } from '@prisma/client';

/** Utilisateur résolu par JwtStrategy (identité relue en base à chaque requête). */
type Reader = { id: string; role: Role; zoneId?: string | null };

@ApiTags('Alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private alerts: AlertsService) {}

  @Get('queue')
  @Roles(Role.SENTINELLE, Role.COORDINATEUR, Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.SUPERVISEUR_REGIONAL, Role.HYDRO_METEO, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'File d\'attente personnalisée par rôle' })
  getQueue(@CurrentUser() user: Reader) {
    return this.alerts.getQueue(user);
  }

  @Get('broadcasts')
  @Roles(Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Historique des diffusions' })
  getBroadcasts(@CurrentUser() user: Reader, @Query('alertId') alertId?: string) {
    return this.alerts.getBroadcasts(user, alertId);
  }

  @Get('broadcasts/:broadcastId/deliveries')
  @Roles(Role.SENTINELLE, Role.COORDINATEUR, Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.SUPERVISEUR_REGIONAL, Role.HYDRO_METEO, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Remises d\'une diffusion (numéros masqués)' })
  deliveries(@Param('broadcastId') broadcastId: string, @CurrentUser() user: Reader, @Query('page') page?: number, @Query('limit') limit?: number) {
    return this.alerts.deliveriesOf(broadcastId, user, page, limit);
  }

  @Get()
  @ApiOperation({ summary: 'Liste des alertes (cloisonnée : territoire, ou alertes publiques pour un citoyen)' })
  findAll(
    @CurrentUser() user: Reader,
    @Query('zoneId') zoneId?: string,
    @Query('status') status?: AlertStatus,
    @Query('type') type?: AlertType,
    @Query('step') step?: AlertStep,
    @Query('alertLevel') alertLevel?: AlertLevel,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.alerts.findAll({ zoneId, status, type, step, alertLevel, page, limit }, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail (cloisonné) avec les actions autorisées pour l\'appelant' })
  findOne(@Param('id') id: string, @CurrentUser() user: Reader) {
    return this.alerts.findOneFor(id, user);
  }

  @Get(':id/broadcasts')
  @ApiOperation({ summary: 'Diffusions de l\'alerte et suivi par canal (envoyé, livré, lu, échec)' })
  broadcastsOf(@Param('id') id: string, @CurrentUser() user: Reader) {
    return this.alerts.broadcastsOf(id, user);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Historique des validations' })
  history(@Param('id') id: string, @CurrentUser() user: Reader) {
    return this.alerts.getHistory(id, user);
  }

  @Get(':id/context')
  @ApiOperation({ summary: 'Recoupement : signalements proches + données OMVS' })
  context(
    @Param('id') id: string,
    @CurrentUser() user: Reader,
    @Query('radiusKm') radiusKm?: string,
    @Query('windowHours') windowHours?: string,
  ) {
    return this.alerts.getContext(id, user, {
      radiusKm: radiusKm ? Number(radiusKm) : undefined,
      windowHours: windowHours ? Number(windowHours) : undefined,
    });
  }

  @Get(':id/critical-validations')
  @Roles(Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Statut des 3 validations critiques requises (ORANGE+)' })
  criticalStatus(@Param('id') id: string, @CurrentUser() user: Reader) {
    return this.alerts.getCriticalValidationStatus(id, user);
  }

  @Post()
  @ThrottleNormal()
  @Roles(Role.CITOYEN, Role.SENTINELLE, Role.COORDINATEUR, Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.HYDRO_METEO, Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Créer un signalement / alerte' })
  create(@Body() dto: CreateAlertDto, @CurrentUser() user: Reader) {
    return this.alerts.create(dto, user.id, user.role);
  }

  @Post(':id/advance')
  @Roles(Role.SENTINELLE, Role.COORDINATEUR, Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Faire avancer une alerte (valider / rejeter / escalader)' })
  advance(@Param('id') id: string, @Body() dto: ValidateAlertDto, @CurrentUser() user: Reader) {
    return this.alerts.advance(id, user, dto);
  }

  @Post(':id/critical-validate')
  @Roles(Role.SENTINELLE, Role.COORDINATEUR, Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Retiré : la triple validation ne fait plus partie du circuit (410)' })
  criticalValidate() {
    return this.alerts.addCriticalValidation();
  }

  @Post(':id/broadcast')
  @Roles(Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Diffuser une alerte validée (multi-canal)' })
  broadcast(@Param('id') id: string, @Body() dto: BroadcastAlertDto, @CurrentUser() user: Reader) {
    return this.alerts.broadcast(id, user, dto);
  }

  @Post(':id/emergency-bypass')
  @Roles(Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: "Diffusion d'urgence (court-circuit cursus, justification obligatoire)" })
  emergencyBypass(@Param('id') id: string, @Body() body: EmergencyBypassDto, @CurrentUser() user: { id: string; role: Role; zoneId?: string | null }) {
    return this.alerts.emergencyBypass(id, user, body);
  }

  @Post(':id/bypass-review')
  @Roles(Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: "Revue a posteriori d'une diffusion d'urgence (autre personne que l'auteur)" })
  reviewBypass(@Param('id') id: string, @Body() body: BypassReviewDto, @CurrentUser() user: { id: string; role: Role; zoneId?: string | null }) {
    return this.alerts.reviewBypass(id, user, body.note);
  }

  @Post(':id/correction')
  @Roles(Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Rectificatif d\'une alerte diffusée (mêmes zones et canaux, mention RECTIFICATIF)' })
  correction(@Param('id') id: string, @Body() dto: CorrectionDto, @CurrentUser() user: Reader) {
    return this.alerts.correction(id, user, dto);
  }

  @Post(':id/retract')
  @Roles(Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Retrait d\'une alerte diffusée (fausse alerte) : message ALERTE ANNULÉE, motif tracé' })
  retract(@Param('id') id: string, @Body() dto: RetractionDto, @CurrentUser() user: Reader) {
    return this.alerts.retract(id, user, dto);
  }

  @Post(':id/close')
  @Roles(Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Clôturer une alerte (raison obligatoire)' })
  close(@Param('id') id: string, @Body() dto: CloseAlertDto, @CurrentUser() user: Reader) {
    return this.alerts.close(id, user, dto.reason);
  }

  @Post(':id/medical-clearance')
  @Roles(Role.PROTECTION_CIVILE, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Lever le blocage médical EPIDEMIE' })
  medicalClearance(@Param('id') id: string, @CurrentUser() user: Reader) {
    return this.alerts.medicalClearance(id, user);
  }
}
