import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { WebsiteService, WebsiteGenerationDto } from './website.service';
import { StorageService } from '../../common/storage/storage.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import {
  UpdateTextDto,
  GenerateImageDto,
  UploadImageDto,
  AddSectionDto,
  DesignAssistDto,
  ReorderSectionsDto,
  ToggleSectionDto,
  UpdateThemeDto,
} from './website.dto';

// req.user is populated by JwtStrategy.validate -> { sub, email, tenantId, role }
interface AuthedRequest {
  user: { sub: string; tenantId: string; role: string; email: string };
}

@Controller('websites')
export class WebsiteController {
  constructor(
    private readonly websiteService: WebsiteService,
    private readonly storage: StorageService,
  ) {}

  // ---- public: serve a published site by subdomain ----
  @Public()
  @Get('subdomain/:subdomain')
  getBySubdomain(@Param('subdomain') subdomain: string) {
    return this.websiteService.getWebsiteBySubdomain(subdomain);
  }

  // ---- pre-generation upload (logo / product photos, before a site exists) ----
  @UseGuards(JwtAuthGuard)
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadStandalone(@UploadedFile() file: any, @Request() req: AuthedRequest) {
    if (!file) throw new BadRequestException('No file uploaded');
    const ext = (file.mimetype?.split('/')[1] || 'png').toLowerCase();
    const url = await this.storage.saveBuffer(`t-${req.user.tenantId}`, file.buffer, ext);
    return { url };
  }

  // ---- create ----
  @UseGuards(JwtAuthGuard)
  @Post('generate')
  generate(@Body() dto: WebsiteGenerationDto, @Request() req: AuthedRequest) {
    return this.websiteService.generateWebsite(dto, req.user.tenantId, req.user.sub);
  }

  // ---- list / read ----
  @UseGuards(JwtAuthGuard)
  @Get()
  list(@Request() req: AuthedRequest) {
    return this.websiteService.listWebsites(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  get(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.websiteService.getWebsite(id, req.user.tenantId);
  }

  // ---- edit: text ----
  @UseGuards(JwtAuthGuard)
  @Patch(':id/text')
  updateText(@Param('id') id: string, @Body() dto: UpdateTextDto, @Request() req: AuthedRequest) {
    return this.websiteService.updateText(id, req.user.tenantId, dto.path, dto.value);
  }

  // ---- edit: theme ----
  @UseGuards(JwtAuthGuard)
  @Patch(':id/theme')
  updateTheme(@Param('id') id: string, @Body() dto: UpdateThemeDto, @Request() req: AuthedRequest) {
    return this.websiteService.updateTheme(id, req.user.tenantId, dto as any);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/design-assist')
  designAssist(@Param('id') id: string, @Body() dto: DesignAssistDto, @Request() req: AuthedRequest) {
    return this.websiteService.applyDesignInstruction(id, req.user.tenantId, dto.instruction);
  }

  // ---- images: AI-generate into a slot ----
  @UseGuards(JwtAuthGuard)
  @Post(':id/images/generate')
  generateImage(@Param('id') id: string, @Body() dto: GenerateImageDto, @Request() req: AuthedRequest) {
    return this.websiteService.generateImageForSlot(id, req.user.tenantId, dto.path, dto.prompt);
  }

  // ---- images: upload into a slot (also used for logo via path=logo.imageUrl) ----
  @UseGuards(JwtAuthGuard)
  @Post(':id/images/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @Param('id') id: string,
    @Body() dto: UploadImageDto,
    @UploadedFile() file: any,
    @Request() req: AuthedRequest,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const ext = (file.mimetype?.split('/')[1] || 'png').toLowerCase();
    const url = await this.storage.saveBuffer(id, file.buffer, ext);
    return this.websiteService.setImageUrl(id, req.user.tenantId, dto.path, url);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/logo/reset')
  resetLogo(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.websiteService.resetLogoToWordmark(id, req.user.tenantId);
  }

  // ---- sections: add (AI) / delete / reorder / toggle ----
  @UseGuards(JwtAuthGuard)
  @Post(':id/sections')
  addSection(@Param('id') id: string, @Body() dto: AddSectionDto, @Request() req: AuthedRequest) {
    return this.websiteService.addSection(id, req.user.tenantId, dto.request);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/sections/:sectionId/items')
  addItem(@Param('id') id: string, @Param('sectionId') sectionId: string, @Request() req: AuthedRequest) {
    return this.websiteService.addItem(id, req.user.tenantId, sectionId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/sections/:sectionId/items/:index')
  removeItem(
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
    @Param('index') index: string,
    @Request() req: AuthedRequest,
  ) {
    return this.websiteService.removeItem(id, req.user.tenantId, sectionId, parseInt(index, 10));
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/sections/:sectionId/gallery-image')
  addGalleryImage(@Param('id') id: string, @Param('sectionId') sectionId: string, @Request() req: AuthedRequest) {
    return this.websiteService.addGalleryImage(id, req.user.tenantId, sectionId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/sections/:sectionId')
  deleteSection(
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
    @Request() req: AuthedRequest,
  ) {
    return this.websiteService.deleteSection(id, req.user.tenantId, sectionId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/sections/reorder')
  reorder(@Param('id') id: string, @Body() dto: ReorderSectionsDto, @Request() req: AuthedRequest) {
    return this.websiteService.reorderSections(id, req.user.tenantId, dto.order);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/sections/:sectionId/visibility')
  toggle(
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: ToggleSectionDto,
    @Request() req: AuthedRequest,
  ) {
    return this.websiteService.toggleSection(id, req.user.tenantId, sectionId, dto.visible);
  }

  // ---- regenerate ----
  @UseGuards(JwtAuthGuard)
  @Post(':id/regenerate')
  regenerate(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.websiteService.regenerateAll(id, req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/sections/:sectionId/regenerate')
  regenerateSection(
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
    @Request() req: AuthedRequest,
  ) {
    return this.websiteService.regenerateSection(id, req.user.tenantId, sectionId);
  }

  // ---- publish (LAST step) ----
  @UseGuards(JwtAuthGuard)
  @Post(':id/publish')
  publish(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.websiteService.publishWebsite(id, req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/deployment-status')
  deploymentStatus(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.websiteService.getDeploymentStatus(id, req.user.tenantId);
  }
}
