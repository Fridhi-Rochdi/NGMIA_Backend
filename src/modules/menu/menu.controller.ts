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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MenuService } from './menu.service';
import { MenuGenerationDto, MenuUpdateDto } from './menu.dto';

@Controller('menus')
@UseGuards(JwtAuthGuard, TenantGuard)
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  async generateMenu(
    @Body() dto: MenuGenerationDto,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    console.log('===========================================');
    console.log('[MenuController] POST /menus/generate called');
    console.log('[MenuController] dto:', JSON.stringify(dto, null, 2));
    console.log('[MenuController] tenantId:', tenantId);
    console.log('[MenuController] userId:', userId);
    console.log('===========================================');
    return this.menuService.generateMenu(dto, tenantId, userId);
  }

  @Get()
  async getMenus(@CurrentUser('tenantId') tenantId: string) {
    return this.menuService.getMenus(tenantId);
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

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  async publishMenu(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.menuService.publishMenu(id, tenantId);
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