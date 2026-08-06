import { Controller, Post, Get, Param, Body, UseGuards, Request } from '@nestjs/common';
import { WebsiteService, WebsiteGenerationDto } from './website.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

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

@Controller('websites')
export class WebsiteController {
  constructor(private readonly websiteService: WebsiteService) {}

  @Public()
  @Get('subdomain/:subdomain')
  async getWebsiteBySubdomain(@Param('subdomain') subdomain: string) {
    return this.websiteService.getWebsiteBySubdomain(subdomain);
  }

  @UseGuards(JwtAuthGuard)
  @Post('generate')
  async generateWebsite(@Body() dto: WebsiteGenerationDto, @Request() req: AuthenticatedRequest) {
    return this.websiteService.generateWebsite(dto, req.user.tenantId, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async listWebsites(@Request() req: AuthenticatedRequest) {
    const tenantId = req.user?.tenantId;
    return this.websiteService.listWebsites(tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getWebsite(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.websiteService.getWebsite(id, req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/publish')
  async publishWebsite(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.websiteService.publishWebsite(id, req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/deployment-status')
  async getDeploymentStatus(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.websiteService.getDeploymentStatus(id, req.user.tenantId);
  }
}
