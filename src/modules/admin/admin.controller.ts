import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { ListQueryDto, UpdateTenantAdminDto } from './admin.dto';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * Platform administration.
 *
 * Guarded by the global JwtAuthGuard + SuperAdminGuard and deliberately NOT
 * by TenantGuard: these routes are meant to read across every tenant, so the
 * isSuperAdmin check is the only thing standing between a normal user and the
 * whole database. It is not a UserRole on purpose: a tenant's own ADMIN must
 * never get here. Do not add a route here that a tenant user should ever reach.
 */
@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(SuperAdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: 'KPIs plateforme (tous tenants)' })
  stats() {
    return this.admin.getStats();
  }

  @Get('tenants')
  @ApiOperation({ summary: 'Lister les tenants' })
  tenants(@Query() query: ListQueryDto) {
    return this.admin.listTenants(query);
  }

  @Get('tenants/:id')
  @ApiOperation({ summary: 'Détail d’un tenant' })
  tenant(@Param('id') id: string) {
    return this.admin.getTenant(id);
  }

  @Patch('tenants/:id')
  @ApiOperation({ summary: 'Activer/désactiver ou changer le plan d’un tenant' })
  updateTenant(
    @Param('id') id: string,
    @Body() dto: UpdateTenantAdminDto,
    @CurrentUser('email') actorEmail: string,
  ) {
    return this.admin.updateTenant(id, dto, actorEmail);
  }

  @Get('users')
  @ApiOperation({ summary: 'Lister les utilisateurs' })
  users(@Query() query: ListQueryDto) {
    return this.admin.listUsers(query);
  }

  @Get('subscriptions')
  @ApiOperation({ summary: 'Lister les abonnements' })
  subscriptions() {
    return this.admin.listSubscriptions();
  }
}
