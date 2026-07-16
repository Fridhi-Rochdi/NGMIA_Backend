import { Controller, Post, Get, Param, Body, UseGuards, Request } from '@nestjs/common';
import { WebsiteService, WebsiteGenerationDto } from './website.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

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
  async generateWebsite(@Body() dto: WebsiteGenerationDto, @Request() req: any) {
    return this.websiteService.generateWebsite(dto, req.user.tenantId, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async listWebsites(@Request() req: any) {
    const tenantId = req.user?.tenantId;
    return this.websiteService.listWebsites(tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getWebsite(@Param('id') id: string) {
    return this.websiteService.getWebsite(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/publish')
  async publishWebsite(@Param('id') id: string) {
    return this.websiteService.publishWebsite(id);
  }
}