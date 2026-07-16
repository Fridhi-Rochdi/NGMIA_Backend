import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ContentService } from './content.service';
import { GenerateContentDto, UpdateContentDto } from './content.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';

@ApiTags('Content')
@Controller('content')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Post('generate')
  async generate(@Body() dto: GenerateContentDto, @Request() req) {
    return this.contentService.generateContent(req.user.sub, req.tenant.id, dto);
  }

  @Get()
  async findAll(@Request() req) {
    return this.contentService.findAll(req.tenant.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req) {
    return this.contentService.findOne(id, req.tenant.id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateContentDto, @Request() req) {
    return this.contentService.update(id, req.tenant.id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req) {
    return this.contentService.remove(id, req.tenant.id);
  }
}