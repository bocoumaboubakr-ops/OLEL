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
  @Roles(Role.ADMIN, Role.PREFECTURE, Role.MAIRIE)
  @ApiOperation({ summary: 'Liste paginée des signalements' })
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: SignalementStatus,
    @Query('zoneId') zoneId?: string,
  ) {
    return this.signalements.findAll({ page, limit, status, zoneId });
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Créer un signalement (utilisateur connecté)' })
  create(@Body() dto: any, @CurrentUser('id') userId: string) {
    return this.signalements.create(dto, userId);
  }

  @Post('bot')
  @ApiHeader({ name: 'x-bot-api-key', description: 'Clé API du bot' })
  @UseGuards(BotApiKeyGuard)
  @ApiOperation({ summary: 'Créer un signalement via le bot (auth par header)' })
  createFromBot(@Body() dto: any) {
    return this.signalements.createFromBot(dto);
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MAIRIE, Role.PREFECTURE, Role.ADMIN)
  @ApiOperation({ summary: 'Valider ou rejeter un signalement' })
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: SignalementStatus,
    @CurrentUser('id') userId: string,
  ) {
    return this.signalements.updateStatus(id, status, userId);
  }
}
