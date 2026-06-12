import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { SignalementsService } from './signalements.service';
import { CreateSignalementDto, CreateSignalementBotDto, FieldVerifySignalementDto } from './dto/create-signalement.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { BotApiKeyGuard } from '../common/guards/bot-api-key.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role, SignalementStatus } from '@prisma/client';

@ApiTags('Signalements')
@Controller('signalements')
export class SignalementsController {
  constructor(private signalements: SignalementsService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    Role.SENTINELLE,
    Role.COORDINATEUR,
    Role.RADIO_COMMUNAUTAIRE,
    Role.MAIRIE,
    Role.HYDRO_METEO,
    Role.PREFECTURE,
    Role.GOUVERNORAT,
    Role.PROTECTION_CIVILE,
    Role.SUPERVISEUR_REGIONAL,
    Role.ADMIN,
    Role.SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Liste paginée des signalements (filtrée par zone selon le rôle)' })
  findAll(
    @CurrentUser() caller: { id: string; role: Role; zoneId?: string | null },
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: SignalementStatus,
    @Query('zoneId') zoneId?: string,
  ) {
    return this.signalements.findAll({ page, limit, status, zoneId }, caller);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Créer un signalement (utilisateur connecté)' })
  create(@Body() dto: CreateSignalementDto, @CurrentUser('id') userId: string) {
    return this.signalements.create(dto, userId);
  }

  @Post('bot')
  @ApiHeader({ name: 'x-bot-api-key', description: 'Clé API du bot' })
  @UseGuards(BotApiKeyGuard)
  @ApiOperation({ summary: 'Créer un signalement via le bot (auth par header)' })
  createFromBot(@Body() dto: CreateSignalementBotDto) {
    return this.signalements.createFromBot(dto);
  }

  @Patch(':id/field-verify')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    Role.SENTINELLE, Role.COORDINATEUR,
    Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT,
    Role.PROTECTION_CIVILE, Role.SUPERVISEUR_REGIONAL,
    Role.ADMIN, Role.SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Vérification terrain par une sentinelle (GPS + photo + notes)' })
  fieldVerify(
    @Param('id') id: string,
    @Body() dto: FieldVerifySignalementDto,
    @CurrentUser() user: { id: string; role: Role; zoneId?: string | null },
  ) {
    return this.signalements.fieldVerify(id, dto, user);
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MAIRIE, Role.PREFECTURE, Role.ADMIN)
  @ApiOperation({ summary: 'Valider ou rejeter un signalement' })
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: SignalementStatus,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.signalements.updateStatus(id, status, user.id, user.role);
  }
}
