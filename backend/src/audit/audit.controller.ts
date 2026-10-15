import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit')
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get()
  @Roles(Role.ADMIN, Role.PREFECTURE)
  findAll(@Query('userId') userId?: string, @Query('resource') resource?: string, @Query('page') page?: number) {
    return this.audit.findAll({ userId, resource, page });
  }
}
