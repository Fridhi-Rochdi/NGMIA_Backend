import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  UseGuards,
  HttpCode,
  HttpStatus 
} from '@nestjs/common';
import { debugLog } from '../../common/debug';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { MenuService } from './menu.service';
import { MenuGenerationDto, MenuUpdateDto } from './menu.dto';

import { AiQuota } from '../../common/quota/ai-quota.decorator';
@Controller('menus')
@UseGuards(TenantGuard)
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @AiQuota('menu.generate', 15)
  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  async generateMenu(
    @Body() dto: MenuGenerationDto,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    debugLog('===========================================');
    debugLog('[MenuController] POST /menus/generate called');
    debugLog('[MenuController] dto:', JSON.stringify(dto, null, 2));
    debugLog('[MenuController] tenantId:', tenantId);
    debugLog('[MenuController] userId:', userId);
    debugLog('===========================================');
    return this.menuService.generateMenu(dto, tenantId, userId);
  }

  @Get()
  async getMenus(@CurrentUser('tenantId') tenantId: string) {
    return this.menuService.getMenus(tenantId);
  }

  /** Public: consumed by the frontend page /menu/[slug]. */
  /** The public menu page. No authentication: that is the whole point of it. */
  @Public()
  @Get('slug/:slug')
  async getMenuBySlug(@Param('slug') slug: string) {
    return this.menuService.getPublicMenu(slug);
  }

  @Get(':id')
  async getMenuById(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.menuService.getMenuById(id, tenantId);
  }

  @Put(':id')
  async updateMenu(
    @Param('id') id: string,
    @Body() dto: MenuUpdateDto,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.menuService.updateMenu(id, dto, tenantId);
  }

  @AiQuota('menu.image', 2)
  @Post(':id/generate-image')
  @HttpCode(HttpStatus.OK)
  async generateMenuImage(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.menuService.generateMenuImage(id, tenantId);
  }

  /** Re-run (or finish) the menu's photography without recreating the menu. */
  @AiQuota('menu.visuals', 12)
  @Post(':id/refresh-visuals')
  @HttpCode(HttpStatus.ACCEPTED)
  async refreshVisuals(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.menuService.refreshMenuVisuals(id, tenantId);
  }

  @Post(':id/generate-qr')
  @HttpCode(HttpStatus.OK)
  async generateMenuQrCode(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
    // Needed to file the code in the tenant's QR library, which records who
    // generated it.
    @CurrentUser('sub') userId: string,
  ) {
    return this.menuService.generateMenuQrCode(id, tenantId, userId);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  async publishMenu(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.menuService.publishMenu(id, tenantId);
  }

  /**
   * Take a published menu offline. Without this, publishing was a one-way
   * door: the deployment kept serving an old carte with no way to stop it.
   */
  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  async unpublishMenu(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.menuService.unpublishMenu(id, tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteMenu(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.menuService.deleteMenu(id, tenantId);
  }
}