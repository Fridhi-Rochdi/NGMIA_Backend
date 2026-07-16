import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SocialService } from './social.service';
import {
  GenerateSocialPostDto,
  UpdateSocialPostDto,
  ConnectSocialAccountDto,
  UpdateSocialAccountDto,
} from './social.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';

@ApiTags('Social')
@Controller('social')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  // ============================================
  // Social Posts
  // ============================================

  @Post('posts/generate')
  async generatePost(@Body() dto: GenerateSocialPostDto, @Request() req) {
    return this.socialService.generatePost(req.user.sub, req.tenant.id, dto);
  }

  @Get('posts')
  async findAllPosts(@Request() req) {
    return this.socialService.findAllPosts(req.tenant.id);
  }

  @Get('posts/:id')
  async findOnePost(@Param('id') id: string, @Request() req) {
    return this.socialService.findOnePost(id, req.tenant.id);
  }

  @Put('posts/:id')
  async updatePost(@Param('id') id: string, @Body() dto: UpdateSocialPostDto, @Request() req) {
    return this.socialService.updatePost(id, req.tenant.id, dto);
  }

  @Delete('posts/:id')
  async removePost(@Param('id') id: string, @Request() req) {
    return this.socialService.removePost(id, req.tenant.id);
  }

  // ============================================
  // Social Accounts
  // ============================================

  @Post('accounts')
  async connectAccount(@Body() dto: ConnectSocialAccountDto, @Request() req) {
    return this.socialService.connectAccount(req.tenant.id, dto);
  }

  @Get('accounts')
  async findAllAccounts(@Request() req) {
    return this.socialService.findAllAccounts(req.tenant.id);
  }

  @Get('accounts/:id')
  async findOneAccount(@Param('id') id: string, @Request() req) {
    return this.socialService.findOneAccount(id, req.tenant.id);
  }

  @Put('accounts/:id')
  async updateAccount(@Param('id') id: string, @Body() dto: UpdateSocialAccountDto, @Request() req) {
    return this.socialService.updateAccount(id, req.tenant.id, dto);
  }

  @Delete('accounts/:id')
  async disconnectAccount(@Param('id') id: string, @Request() req) {
    return this.socialService.disconnectAccount(id, req.tenant.id);
  }
}
