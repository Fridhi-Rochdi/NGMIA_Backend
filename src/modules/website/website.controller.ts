import { Controller, Post, Get, Param, Body, Request } from '@nestjs/common';
import { WebsiteService } from './website.service';
import { GenerateWebsiteDto } from './website.dto';
import { Public } from '../../common/decorators/public.decorator';

import { AiQuota } from '../../common/quota/ai-quota.decorator';
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

  @AiQuota('website.generate', 15)
  @Post('generate')
  // A class, not an interface: the ValidationPipe can only validate what has
  // runtime metadata, so the interface let every field through unchecked.
  async generateWebsite(@Body() dto: GenerateWebsiteDto, @Request() req: AuthenticatedRequest) {
    return this.websiteService.generateWebsite(dto, req.user.tenantId, req.user.sub);
  }

  @Get()
  async listWebsites(@Request() req: AuthenticatedRequest) {
    const tenantId = req.user?.tenantId;
    return this.websiteService.listWebsites(tenantId);
  }

  @Get(':id')
  async getWebsite(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.websiteService.getWebsite(id, req.user.tenantId);
  }

  /** Re-run (or finish) the site's photography without regenerating its copy. */
  @AiQuota('website.visuals', 10)
  @Post(':id/refresh-visuals')
  async refreshVisuals(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.websiteService.refreshWebsiteVisuals(id, req.user.tenantId);
  }

  @Post(':id/publish')
  async publishWebsite(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.websiteService.publishWebsite(id, req.user.tenantId);
  }

  @Get(':id/deployment-status')
  async getDeploymentStatus(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.websiteService.getDeploymentStatus(id, req.user.tenantId);
  }
}
