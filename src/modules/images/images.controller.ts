import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ImagesService } from './images.service';
import { GenerateImageDto, UpdateImageDto } from './images.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';

@ApiTags('Images')
@Controller('images')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post('generate')
  async generate(@Body() dto: GenerateImageDto, @Request() req) {
    return this.imagesService.generateImage(req.user.userId, req.tenant.id, dto);
  }

  @Get()
  async findAll(@Request() req) {
    return this.imagesService.findAll(req.tenant.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req) {
    return this.imagesService.findOne(id, req.tenant.id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateImageDto, @Request() req) {
    return this.imagesService.update(id, req.tenant.id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req) {
    return this.imagesService.remove(id, req.tenant.id);
  }
}