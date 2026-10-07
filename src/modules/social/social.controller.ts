import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, Res, UseGuards, Request,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SocialService } from './social.service';
import {
  CreateSocialPostDto,
  GenerateSocialPostDto,
  UpdateSocialPostDto,
  ConnectSocialAccountDto,
  UpdateSocialAccountDto,
} from './social.dto';
import { AuthenticatedRequest } from '../../common/types/authenticated-request';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Public } from '../../common/decorators/public.decorator';
import { publicAppUrl } from '../../common/app-url';

import { AiQuota } from '../../common/quota/ai-quota.decorator';
@ApiTags('Social')
@Controller('social')
@UseGuards(TenantGuard)
@ApiBearerAuth()
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  // ============================================
  // Social Posts
  // ============================================

  @AiQuota('social.post', 1)
  @Post('posts/generate')
  async generatePost(@Body() dto: GenerateSocialPostDto, @Request() req: AuthenticatedRequest) {
    return this.socialService.generatePost(req.user.sub, req.tenant.id, dto);
  }

  @Post('posts')
  async createPost(@Body() dto: CreateSocialPostDto, @Request() req: AuthenticatedRequest) {
    return this.socialService.createPost(req.user.sub, req.tenant.id, dto);
  }

  @Get('posts')
  async findAllPosts(@Request() req: AuthenticatedRequest) {
    return this.socialService.findAllPosts(req.tenant.id);
  }

  @Get('posts/:id')
  async findOnePost(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.socialService.findOnePost(id, req.tenant.id);
  }

  @Put('posts/:id')
  async updatePost(@Param('id') id: string, @Body() dto: UpdateSocialPostDto, @Request() req: AuthenticatedRequest) {
    return this.socialService.updatePost(id, req.tenant.id, dto);
  }

  @Delete('posts/:id')
  async removePost(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.socialService.removePost(id, req.tenant.id);
  }

  // ============================================
  // OAuth — connecting a real account
  // ============================================

  /** Where the UI sends the user to authorise the app. */
  @Get('oauth/:platform/url')
  async authUrl(@Param('platform') platform: string, @Request() req: AuthenticatedRequest) {
    return this.socialService.getAuthUrl(platform.toUpperCase(), req.tenant.id);
  }

  /**
   * The platform redirects the user's browser here after they authorise.
   *
   * Public by necessity — the caller is the platform, which carries no session
   * — and safe because the tenant is read from the SIGNED state rather than
   * from a parameter anyone could set.
   */
  @Public()
  @Get('oauth/callback')
  async oauthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Res() res: Response,
  ) {
    const back = `${publicAppUrl()}/social`;
    if (error) {
      return res.redirect(
        `${back}?connected=0&reason=${encodeURIComponent(errorDescription || error)}`,
      );
    }
    try {
      const account = await this.socialService.handleOAuthCallback(code, state);
      return res.redirect(
        `${back}?connected=1&platform=${encodeURIComponent(String(account.platform))}`,
      );
    } catch (e: any) {
      // The user is in a browser mid-redirect: send them back to the app with
      // the reason, rather than rendering a raw JSON error page at the API.
      return res.redirect(`${back}?connected=0&reason=${encodeURIComponent(e?.message || 'echec')}`);
    }
  }

  /** What can be connected here, and what already is. */
  @Get('oauth/status')
  async oauthStatus(@Request() req: AuthenticatedRequest) {
    return this.socialService.connectionStatus(req.tenant.id);
  }

  // ============================================
  // Social Accounts
  // ============================================

  @Post('accounts')
  async connectAccount(@Body() dto: ConnectSocialAccountDto, @Request() req: AuthenticatedRequest) {
    return this.socialService.connectAccount(req.tenant.id, dto);
  }

  @Get('accounts')
  async findAllAccounts(@Request() req: AuthenticatedRequest) {
    return this.socialService.findAllAccounts(req.tenant.id);
  }

  @Get('accounts/:id')
  async findOneAccount(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.socialService.findOneAccount(id, req.tenant.id);
  }

  @Put('accounts/:id')
  async updateAccount(@Param('id') id: string, @Body() dto: UpdateSocialAccountDto, @Request() req: AuthenticatedRequest) {
    return this.socialService.updateAccount(id, req.tenant.id, dto);
  }

  @Delete('accounts/:id')
  async disconnectAccount(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.socialService.disconnectAccount(id, req.tenant.id);
  }
}
