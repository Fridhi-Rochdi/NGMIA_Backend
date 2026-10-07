import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReelsService } from './reels.service';
import { GenerateReelDto, UpdateReelDto } from './reels.dto';

import { AiQuota } from '../../common/quota/ai-quota.decorator';
@ApiTags('Reels')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller('reels')
export class ReelsController {
  constructor(private readonly reels: ReelsService) {}

  @AiQuota('reel.generate', 25)
  @Post('generate')
  @ApiOperation({ summary: 'Generer un reel vertical 9:16' })
  @ApiResponse({ status: 201, description: 'Script ecrit; le rendu se poursuit en arriere-plan' })
  async generate(
    @Body() dto: GenerateReelDto,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.reels.generate(dto, tenantId, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les reels du tenant' })
  async list(@CurrentUser('tenantId') tenantId: string) {
    return this.reels.list(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail d un reel, scenes comprises' })
  async findOne(@Param('id') id: string, @CurrentUser('tenantId') tenantId: string) {
    return this.reels.findOne(id, tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier le titre, la legende ou les hashtags' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateReelDto,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.reels.update(id, tenantId, dto);
  }

  /** Re-compose the frames and re-encode, optionally re-shooting the photos. */
  @AiQuota('reel.regenerate', 25)
  @Post(':id/regenerate')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Relancer le rendu' })
  async regenerate(
    @Param('id') id: string,
    @Body() body: { freshImages?: boolean } = {},
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.reels.regenerate(id, tenantId, Boolean(body?.freshImages));
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Telecharger le MP4' })
  async download(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
    @Res() res: Response,
  ) {
    const file = await this.reels.download(id, tenantId);
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Content-Length', String(file.buffer.length));
    res.end(file.buffer);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un reel' })
  async remove(@Param('id') id: string, @CurrentUser('tenantId') tenantId: string) {
    return this.reels.remove(id, tenantId);
  }
}
