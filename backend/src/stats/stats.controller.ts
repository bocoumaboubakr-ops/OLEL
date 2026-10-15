import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { StatsService } from './stats.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Stats')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('stats')
export class StatsController {
  constructor(private stats: StatsService) {}

  @Get('summary')
  @Roles(Role.MAIRIE, Role.PREFECTURE, Role.ADMIN)
  @ApiOperation({ summary: 'Résumé KPIs de la plateforme (MAIRIE et supérieur)' })
  getSummary() {
    return this.stats.getSummary();
  }
}
