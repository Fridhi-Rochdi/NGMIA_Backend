import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { UpdateTenantDto } from './tenant.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';

@ApiTags('Tenant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('tenant')
export class TenantController {
  constructor(private tenantService: TenantService) {}

  @Get()
  @ApiOperation({ summary: 'Récupérer les informations du tenant courant' })
  @ApiResponse({ status: 200, description: 'Informations du tenant' })
  async getTenant(@CurrentTenant('id') tenantId: string) {
    return this.tenantService.getTenant(tenantId);
  }

  @Put()
  @ApiOperation({ summary: 'Mettre à jour le tenant courant' })
  @ApiResponse({ status: 200, description: 'Tenant mis à jour' })
  async updateTenant(
    @CurrentTenant('id') tenantId: string,
    @Body() updateTenantDto: UpdateTenantDto,
  ) {
    return this.tenantService.updateTenant(tenantId, updateTenantDto);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Récupérer les statistiques du tenant' })
  @ApiResponse({ status: 200, description: 'Statistiques du tenant' })
  async getStats(@CurrentTenant('id') tenantId: string) {
    return this.tenantService.getTenantStats(tenantId);
  }
}