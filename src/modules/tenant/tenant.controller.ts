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
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { AiQuotaService } from '../../common/quota/ai-quota.service';

@ApiTags('Tenant')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller('tenant')
export class TenantController {
  constructor(
    private tenantService: TenantService,
    private aiQuota: AiQuotaService,
  ) {}

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

  @Get('ai-usage')
  @ApiOperation({ summary: "Consommation IA du mois et quota de l'offre" })
  @ApiResponse({ status: 200, description: 'Crédits utilisés / limite (-1 = illimité)' })
  async getAiUsage(@CurrentTenant('id') tenantId: string) {
    return this.aiQuota.summary(tenantId);
  }
}
