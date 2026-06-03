import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ZonesService } from './zones.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Zones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('zones')
export class ZonesController {
  constructor(private zones: ZonesService) {}

  @Get()
  findAll() { return this.zones.findAll(); }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.zones.findOne(id); }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: any) { return this.zones.create(dto); }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: any) { return this.zones.update(id, dto); }
}
