import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BrandingService } from './branding.service';
import { GenerateBrandingDto, UpdateBrandingDto } from './branding.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';

interface AuthenticatedRequest {
  user: {
    sub: string;
    email: string;
    tenantId: string;
    role: string;
  };
  tenant?: {
    id: string;
    name: string;
    slug: string;
    plan: string;
  };
}

@ApiTags('Branding')
@Controller('branding')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class BrandingController {
  constructor(private readonly brandingService: BrandingService) {}

  @Post('generate')
  async generate(@Body() dto: GenerateBrandingDto, @Request() req: AuthenticatedRequest) {
    return this.brandingService.generateBranding(req.user.sub, req.tenant.id, dto);
  }

  @Get()
  async findAll(@Request() req: AuthenticatedRequest) {
    return this.brandingService.findAll(req.tenant.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.brandingService.findOne(id, req.tenant.id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateBrandingDto, @Request() req: AuthenticatedRequest) {
    return this.brandingService.update(id, req.tenant.id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.brandingService.remove(id, req.tenant.id);
  }
}