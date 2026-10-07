import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ContentService } from './content.service';
import { GenerateContentDto, UpdateContentDto } from './content.dto';
import { AuthenticatedRequest } from '../../common/types/authenticated-request';
import { TenantGuard } from '../../common/guards/tenant.guard';

import { AiQuota } from '../../common/quota/ai-quota.decorator';
@ApiTags('Content')
@Controller('content')
@UseGuards(TenantGuard)
@ApiBearerAuth()
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @AiQuota('content.generate', 1, 2)
  @Post('generate')
  async generate(@Body() dto: GenerateContentDto, @Request() req: AuthenticatedRequest) {
    return this.contentService.generateContent(req.user.sub, req.tenant.id, dto);
  }

  @Get()
  async findAll(@Request() req: AuthenticatedRequest) {
    return this.contentService.findAll(req.tenant.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.contentService.findOne(id, req.tenant.id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateContentDto, @Request() req: AuthenticatedRequest) {
    return this.contentService.update(id, req.tenant.id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.contentService.remove(id, req.tenant.id);
  }
}