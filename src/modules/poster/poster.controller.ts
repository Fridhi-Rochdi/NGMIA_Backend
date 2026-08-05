import { 
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
  HttpCode, HttpStatus, Res
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PosterService } from './poster.service';
import { PosterGenerationDto, PosterUpdateDto } from './poster.dto';
import type { Response } from 'express';

@Controller('posters')
@UseGuards(JwtAuthGuard, TenantGuard)
export class PosterController {
  constructor(private readonly posterService: PosterService) {}

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  async generatePoster(
    @Body() dto: PosterGenerationDto,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.posterService.generatePoster(dto, tenantId, userId);
  }

  @Get()
  async getPosters(@CurrentUser('tenantId') tenantId: string) {
    return this.posterService.getPosters(tenantId);
  }

  @Public()
  @Get('slug/:slug')
  async getPosterBySlug(@Param('slug') slug: string) {
    return this.posterService.getPosterBySlug(slug);
  }

  @Get(':id')
  async getPosterById(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.posterService.getPosterById(id, tenantId);
  }

  @Put(':id')
  async updatePoster(
    @Param('id') id: string,
    @Body() dto: PosterUpdateDto,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.posterService.updatePoster(id, dto, tenantId);
  }

  /** Download poster as HTML, PNG, JPEG, or PDF */
  @Get(':id/download')
  async downloadPoster(
    @Param('id') id: string,
    @Query('format') format: string,
    @CurrentUser('tenantId') tenantId: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    const result = await this.posterService.downloadPoster(id, tenantId, format || 'html');
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="poster-${id}.${result.extension}"`);
    res.send(result.buffer);
  }

  /** Generate QR code for poster */
  @Post(':id/generate-qr')
  @HttpCode(HttpStatus.OK)
  async generateQrCode(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.posterService.generatePosterQrCode(id, tenantId);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  async publishPoster(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.posterService.publishPoster(id, tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deletePoster(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.posterService.deletePoster(id, tenantId);
  }
}
