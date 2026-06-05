import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, CreateSentinelleDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  @Roles(Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.ADMIN, Role.SUPER_ADMIN)
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
  ) {
    return this.users.findAll({ page, limit, role, zoneId });
  }

  @Get('me')
  @ApiOperation({ summary: 'Mon profil (utilisateur connecté)' })
  getMe(@CurrentUser() user: { id: string }) {
    return this.users.findOne(user.id);
  }

  @Get(':id')
  @Roles(Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.PROTECTION_CIVILE, Role.ADMIN, Role.SUPER_ADMIN)
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Créer un utilisateur (admin seulement — tous rôles possibles)' })
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  /**
   * Endpoint dédié à la création de sentinelles par les maires et l'admin.
   * Génère un mot de passe temporaire et retourne les credentials à transmettre.
   */
  @Post('sentinelle')
  @Roles(Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Créer une sentinelle (mairie/admin) — génère un mot de passe temporaire' })
  createSentinelle(
    @Body() dto: CreateSentinelleDto,
    @CurrentUser() user: { id: string; role: Role; zoneId?: string },
  ) {
    return this.users.createSentinelle(dto, user);
  }

  @Patch(':id')
  @Roles(Role.MAIRIE, Role.PREFECTURE, Role.GOUVERNORAT, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Modifier un utilisateur' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() caller: { id: string; role: Role },
  ) {
    return this.users.update(id, dto, caller);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Désactiver un utilisateur' })
  remove(@Param('id') id: string) {
    return this.users.remove(id);
  }
}
