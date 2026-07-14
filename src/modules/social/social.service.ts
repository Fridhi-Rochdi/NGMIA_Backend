import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiEngineService } from '../ai-engine/ai-engine.service';
import {
  GenerateSocialPostDto,
  UpdateSocialPostDto,
  ConnectSocialAccountDto,
  UpdateSocialAccountDto,
} from './social.dto';
import { ContentType, ContentStatus, Platform } from '@prisma/client';

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiEngine: AiEngineService,
  ) {}

  // ============================================
  // Social Post Generation (stored as Content)
  // ============================================

  async generatePost(userId: string, tenantId: string, dto: GenerateSocialPostDto) {
    const generatedContent = await this.aiEngine.generateSocialPost({
      topic: dto.topic,
      platform: dto.platform,
      tone: dto.tone || 'professional',
      hashtags: dto.hashtags,
    });

    return this.prisma.content.create({
      data: {
        title: `Social Post - ${dto.platform} - ${dto.topic}`,
        body: generatedContent,
        type: ContentType.POST,
        platform: dto.platform as Platform,
        tone: dto.tone || 'professional',
        hashtags: dto.hashtags ? dto.hashtags.join(',') : null,
        status: ContentStatus.GENERATED,
        prompt: dto.topic,
        tenantId,
        userId,
      },
    });
  }

  async findAllPosts(tenantId: string) {
    return this.prisma.content.findMany({
      where: { tenantId, type: ContentType.POST },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOnePost(id: string, tenantId: string) {
    const post = await this.prisma.content.findFirst({
      where: { id, tenantId, type: ContentType.POST },
    });
    if (!post) throw new NotFoundException('Social post not found');
    return post;
  }

  async updatePost(id: string, tenantId: string, dto: UpdateSocialPostDto) {
    await this.findOnePost(id, tenantId);
    return this.prisma.content.update({
      where: { id },
      data: {
        title: dto.title,
        body: dto.body,
        status: dto.status as ContentStatus,
      },
    });
  }

  async removePost(id: string, tenantId: string) {
    await this.findOnePost(id, tenantId);
    return this.prisma.content.delete({ where: { id } });
  }

  // ============================================
  // Social Account Management & OAuth
  // ============================================

  async getAuthUrl(platform: string, tenantId: string) {
    // In a real app, this would use the platform's OAuth SDK or build the URL
    // Here we simulate the redirect by sending them to our own fake callback
    const redirectUri = `http://localhost:4000/social/oauth/callback?code=fake_auth_code_123&platform=${platform}&tenantId=${tenantId}`;
    return { url: redirectUri };
  }

  async handleOAuthCallback(code: string, platform: string, tenantId: string) {
    // Simulate exchanging code for token
    const fakeAccessToken = `fake_access_token_${platform}_${Date.now()}`;
    const fakeRefreshToken = `fake_refresh_token_${platform}_${Date.now()}`;
    const fakeAccountId = `fake_${platform}_id_${Math.floor(Math.random() * 10000)}`;
    const fakeUsername = `@fake_${platform}_user`;

    // Check if account already exists for this tenant and platform
    const existing = await this.prisma.socialAccount.findFirst({
      where: { tenantId, platform: platform as Platform },
    });

    if (existing) {
      return this.prisma.socialAccount.update({
        where: { id: existing.id },
        data: {
          accessToken: fakeAccessToken,
          refreshToken: fakeRefreshToken,
          accountId: fakeAccountId,
          username: fakeUsername,
          isActive: true,
        },
      });
    }

    return this.prisma.socialAccount.create({
      data: {
        platform: platform as Platform,
        accountId: fakeAccountId,
        username: fakeUsername,
        accessToken: fakeAccessToken,
        refreshToken: fakeRefreshToken,
        tenantId,
      },
    });
  }

  async connectAccount(tenantId: string, dto: ConnectSocialAccountDto) {
    return this.prisma.socialAccount.create({
      data: {
        platform: dto.platform as Platform,
        accountId: dto.accountId,
        username: dto.username,
        accessToken: dto.accessToken,
        refreshToken: dto.refreshToken,
        tenantId,
      },
    });
  }

  async findAllAccounts(tenantId: string) {
    return this.prisma.socialAccount.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneAccount(id: string, tenantId: string) {
    const account = await this.prisma.socialAccount.findFirst({
      where: { id, tenantId },
    });
    if (!account) throw new NotFoundException('Social account not found');
    return account;
  }

  async updateAccount(id: string, tenantId: string, dto: UpdateSocialAccountDto) {
    await this.findOneAccount(id, tenantId);
    return this.prisma.socialAccount.update({
      where: { id },
      data: {
        accessToken: dto.accessToken,
        refreshToken: dto.refreshToken,
        isActive: dto.isActive,
      },
    });
  }

  async disconnectAccount(id: string, tenantId: string) {
    await this.findOneAccount(id, tenantId);
    return this.prisma.socialAccount.delete({ where: { id } });
  }
}
