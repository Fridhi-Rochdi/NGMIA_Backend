import { Controller, Get, Post, Put, Delete, Body, Param, Query, Res, UseGuards, Request, HttpCode, HttpStatus, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BrandingService } from './branding.service';
import { GenerateBrandingDto, UpdateBrandingDto, RegenerateLogoDto, ModifyLogoDto } from './branding.dto';
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

  @Post(':id/logo/regenerate')
  @HttpCode(HttpStatus.OK)
  async regenerateLogo(
    @Param('id') id: string,
    @Body() dto: RegenerateLogoDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.brandingService.regenerateLogo(id, req.tenant.id, dto);
  }

  @Put(':id/logo')
  async modifyLogo(
    @Param('id') id: string,
    @Body() dto: ModifyLogoDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.brandingService.modifyLogo(id, req.tenant.id, dto);
  }

  @Delete(':id/logo')
  async deleteLogo(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.brandingService.deleteLogo(id, req.tenant.id);
  }

  @Get(':id/logo/download')
  async downloadLogo(
    @Param('id') id: string,
    @Query('format') format: string,
    @Request() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: any,
  ) {
    const result = await this.brandingService.downloadLogo(id, req.tenant.id, format || 'original');
    res.setHeader('Content-Length', result.buffer.length);
    return new StreamableFile(result.buffer, {
      type: result.mimeType,
      disposition: `attachment; filename="logo-${id.substring(0, 8)}.${result.extension}"`,
    });
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
