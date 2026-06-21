import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TrainingsService } from './trainings.service';
import { CreateTrainingModuleDto, UpdateTrainingModuleDto, CreateLessonDto, CompleteModuleDto } from './dto/training.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Formations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('trainings')
export class TrainingsController {
  constructor(private trainings: TrainingsService) {}

  @Get()
  @ApiOperation({ summary: 'Modules de formation + ma progression' })
  findAll(@CurrentUser('id') userId: string) {
    return this.trainings.findAllForUser(userId);
  }

  @Get('me/status')
  @ApiOperation({ summary: 'Mon statut de certification (modules requis complétés ?)' })
  myStatus(@CurrentUser('id') userId: string) {
    return this.trainings.myStatus(userId);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Marquer un module comme complété' })
  complete(@Param('id') id: string, @Body() dto: CompleteModuleDto, @CurrentUser('id') userId: string) {
    return this.trainings.completeModule(userId, id, dto.score);
  }

  // ── Admin ─────────────────────────────────────────────────────────────────
  @Post()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.PREFECTURE, Role.GOUVERNORAT)
  @ApiOperation({ summary: 'Créer un module (admin)' })
  create(@Body() dto: CreateTrainingModuleDto) {
    return this.trainings.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.PREFECTURE, Role.GOUVERNORAT)
  @ApiOperation({ summary: 'Modifier un module (admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateTrainingModuleDto) {
    return this.trainings.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Désactiver un module (admin)' })
  remove(@Param('id') id: string) {
    return this.trainings.remove(id);
  }

  @Post(':id/lessons')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.PREFECTURE, Role.GOUVERNORAT)
  @ApiOperation({ summary: 'Ajouter une leçon à un module (admin)' })
  addLesson(@Param('id') id: string, @Body() dto: CreateLessonDto) {
    return this.trainings.addLesson(id, dto);
  }
}
