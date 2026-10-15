import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, CreateSentinelleDto, UpdateMeDto, ChangePasswordDto } from './dto/create-user.dto';
import { AllowInTraining } from '../common/decorators/allow-in-training.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { Caller } from './user-policy';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  @Roles(Role.COORDINATEUR, Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Liste des utilisateurs (filtrables par rôle et zone)' })
  @ApiQuery({ name: 'role', required: false, enum: Role })
  @ApiQuery({ name: 'zoneId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('role') role?: Role,
    @Query('zoneId') zoneId?: string,
    @CurrentUser() caller?: Caller,
  ) {
    return this.users.findAll({ page, limit, role, zoneId }, caller);
  }

  @Get('me')
  @AllowInTraining()
  @ApiOperation({ summary: 'Mon profil (utilisateur connecté)' })
  getMe(@CurrentUser() user: { id: string }) {
    return this.users.findOne(user.id);
  }

  @Patch('me')
  @AllowInTraining()
  @ApiOperation({ summary: 'Modifier mon nom / e-mail (jamais rôle, statut ni zone)' })
  updateMe(@CurrentUser() user: Caller, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(user, dto);
  }

  @Patch('me/language')
  @AllowInTraining()
  @ApiOperation({ summary: 'Changer ma langue préférée (fr | ff | wo | snk)' })
  setLanguage(@CurrentUser() user: { id: string }, @Body('language') language: string) {
    return this.users.setLanguage(user.id, language);
  }

  @Get(':id')
  @Roles(Role.COORDINATEUR, Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  findOne(@Param('id') id: string, @CurrentUser() caller: Caller) {
    return this.users.findOneScoped(id, caller);
  }

  @Post()
  @Roles(Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Créer un utilisateur (rôles attribuables selon users/user-policy.ts)' })
  create(@Body() dto: CreateUserDto, @CurrentUser() caller: Caller) {
    return this.users.create(dto, caller);
  }

  /**
   * Endpoint dédié à la création de sentinelles par les maires et l'admin.
   * Génère un mot de passe temporaire et retourne les credentials à transmettre.
   */
  @Post('sentinelle')
  @Roles(Role.COORDINATEUR, Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Créer une sentinelle (mairie/admin) — génère un mot de passe temporaire' })
  createSentinelle(
    @Body() dto: CreateSentinelleDto,
    @CurrentUser() user: Caller,
  ) {
    return this.users.createSentinelle(dto, user);
  }

  @Patch(':id')
  @Roles(Role.COORDINATEUR, Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Modifier un utilisateur' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() caller: Caller,
  ) {
    return this.users.update(id, dto, caller);
  }

  @Post(':id/change-password')
  @Roles(Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Changer le mot de passe d\'un utilisateur (révoque ses sessions)' })
  changePassword(@Param('id') id: string, @Body() body: ChangePasswordDto, @CurrentUser() caller: Caller) {
    return this.users.changePassword(id, body.newPassword, caller);
  }

  @Post(':id/reset-mfa')
  @Roles(Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Réinitialiser le second facteur (téléphone perdu)' })
  resetMfa(@Param('id') id: string, @CurrentUser() caller: Caller) {
    return this.users.resetMfa(id, caller);
  }

  @Delete(':id')
  @Roles(Role.MAIRIE, Role.COORDINATEUR, Role.PREFECTURE, Role.GOUVERNORAT, Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Suspendre un utilisateur (révoque ses sessions)' })
  remove(@Param('id') id: string, @CurrentUser() caller: Caller) {
    return this.users.remove(id, caller);
  }
}
