import { Injectable, NotFoundException, Logger, ForbiddenException } from '@nestjs/common';
import { SocialOAuthService } from './social-oauth.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiEngineService } from '../ai-engine/ai-engine.service';
import { BusinessContextService } from '../business-context/business-context.service';
import { BrandKitService } from '../../common/brand-kit/brand-kit.service';
import { renderBrandContext, resolveBrandContext } from '../../common/ai/brand-context';
import {
  CreateSocialPostDto,
  GenerateSocialPostDto,
  UpdateSocialPostDto,
  ConnectSocialAccountDto,
  UpdateSocialAccountDto,
} from './social.dto';
import { ContentType, ContentStatus, Platform } from '@prisma/client';

@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiEngine: AiEngineService,
    private readonly businessContext: BusinessContextService,
    private readonly oauth: SocialOAuthService,
    private readonly brandKit: BrandKitService,
  ) {}

  // ============================================
  // Social Post Generation (stored as Content)
  // ============================================

  async generatePost(userId: string, tenantId: string, dto: GenerateSocialPostDto) {
    const context = await this.businessContext.find(tenantId);
    const kit = await this.brandKit.find(tenantId);
    const tone = dto.tone || context?.tone || 'professional';

    // The whole brand context — offer, audience, tagline, promise — not just
    // a name and a description, so a post reads like the site and the posters.
    const generatedContent = await this.aiEngine.generateSocialPost({
      topic: dto.topic,
      platform: dto.platform,
      tone,
      hashtags: dto.hashtags,
      language: context?.language,
      brandContext: renderBrandContext(resolveBrandContext(kit, { tone })),
    });

    return this.prisma.content.create({
      data: {
        title: `Social Post - ${dto.platform} - ${dto.topic}`,
        body: generatedContent,
        type: ContentType.POST,
        platform: dto.platform as Platform,
        tone,
        hashtags: dto.hashtags ? dto.hashtags.join(',') : null,
        status: ContentStatus.GENERATED,
        prompt: dto.topic,
        tenantId,
        userId,
      },
    });
  }

  /**
   * Create a post written by the user (no AI). Stored as a Content row, like
   * generated posts. `scheduledAt` is intentionally not persisted — Content has
   * no schedule column; scheduling lives in the planner module.
   */
  async createPost(userId: string, tenantId: string, dto: CreateSocialPostDto) {
    return this.prisma.content.create({
      data: {
        title: dto.title || `Social Post - ${dto.platform}`,
        body: dto.content,
        type: ContentType.POST,
        platform: dto.platform as Platform,
        hashtags: dto.hashtags?.length ? dto.hashtags.join(',') : null,
        imageUrl: dto.mediaUrls?.[0] || null,
        status: (dto.status as ContentStatus) || ContentStatus.DRAFT,
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

  /**
   * Start the OAuth flow.
   *
   * This used to return a link straight back to our own callback carrying
   * `code=fake_auth_code_123`, and the callback minted a fake token without
   * talking to anyone. The account showed as connected and nothing could ever
   * be posted.
   */
  async getAuthUrl(platform: string, tenantId: string) {
    const url = this.oauth.authorizeUrl(platform as Platform, tenantId);
    return { url, simulated: false };
  }

  /**
   * Finish the OAuth flow.
   *
   * The tenant comes from the SIGNED state, never from a query parameter: the
   * callback is reached through the user's browser, so an attacker who could
   * choose the tenant could file their own social account under someone
   * else's account, or the reverse.
   */
  async handleOAuthCallback(code: string, state: string) {
    const { tenantId, platform } = this.oauth.parseState(state);
    const account = await this.oauth.exchange(platform, code, state);

    const existing = await this.prisma.socialAccount.findFirst({
      where: { tenantId, platform },
    });

    const data = {
      accountId: account.accountId,
      username: account.username,
      accessToken: account.accessToken,
      refreshToken: account.refreshToken ?? null,
      expiresAt: account.expiresAt ?? null,
      scope: account.scope ?? null,
      pageId: account.pageId ?? null,
      pageName: account.pageName ?? null,
      isActive: true,
    };

    // A new network counts against the plan; reconnecting one does not.
    if (!existing) await this.assertSocialAllowance(tenantId);

    const saved = existing
      ? await this.prisma.socialAccount.update({ where: { id: existing.id }, data })
      : await this.prisma.socialAccount.create({ data: { ...data, platform, tenantId } });

    this.logger.log(`Compte ${platform} connecte pour le tenant ${tenantId}: ${saved.username}`);
    return this.redact(saved);
  }

  /** Networks each plan may connect (see PRICING.md). */
  private static readonly SOCIAL_LIMITS: Record<string, number> = {
    FREE: 1,
    STARTER: 2,
    PRO: 4,
    ENTERPRISE: 4,
  };

  private async assertSocialAllowance(tenantId: string) {
    const [tenant, connected] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { plan: true } }),
      this.prisma.socialAccount.count({ where: { tenantId, isActive: true } }),
    ]);
    const limit = SocialService.SOCIAL_LIMITS[tenant.plan] ?? 1;
    if (connected >= limit) {
      throw new ForbiddenException(
        `Votre offre permet ${limit} reseau${limit > 1 ? 'x' : ''} social${limit > 1 ? 'aux' : ''}. ` +
          'Deconnectez-en un ou passez a une offre superieure.',
      );
    }
  }

  /** Which platforms this deployment can actually connect, and which are live. */
  async connectionStatus(tenantId: string) {
    const accounts = await this.prisma.socialAccount.findMany({ where: { tenantId } });
    const configured = this.oauth.configuredPlatforms();

    return {
      redirectUri: this.oauth.redirectUri(),
      platforms: (['FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'TWITTER'] as Platform[]).map((p) => {
        const account = accounts.find((a) => a.platform === p && a.isActive);
        const expired = Boolean(account?.expiresAt && account.expiresAt.getTime() < Date.now());
        return {
          platform: p,
          configured: configured.includes(p),
          connected: Boolean(account) && !expired,
          username: account?.username ?? null,
          pageName: account?.pageName ?? null,
          expiresAt: account?.expiresAt ?? null,
          expired,
        };
      }),
    };
  }

  /** Never let a token leave the server. */
  private redact(account: any) {
    const { accessToken, refreshToken: _refreshToken, ...safe } = account;
    return { ...safe, hasToken: Boolean(accessToken) };
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
