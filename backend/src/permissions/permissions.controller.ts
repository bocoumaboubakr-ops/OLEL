import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private permissions: PermissionsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Catalogue de toutes les permissions' })
  getCatalog() { return this.permissions.getCatalog(); }

  @Get('matrix')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Matrice RBAC complète rôle × permission' })
  getMatrix() { return this.permissions.getMatrix(); }

  @Get('roles/:role')
  @Roles(Role.SUPERVISEUR_REGIONAL, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Permissions d\'un rôle spécifique' })
  getByRole(@Param('role') role: Role) { return this.permissions.getByRole(role); }

  @Get('me/menus')
  @ApiOperation({ summary: 'Menus visibles pour l\'utilisateur connecté' })
  getMyMenus(@CurrentUser() user: { id: string; role: Role }) {
    return { role: user.role, menus: this.permissions.getRoleMenus(user.role) };
  }
}
