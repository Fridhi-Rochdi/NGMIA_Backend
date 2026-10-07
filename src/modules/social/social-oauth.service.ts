import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Platform } from '@prisma/client';
import { publicApiUrl } from '../../common/app-url';

/** What a platform hands back once the user has authorised the app. */
export interface OAuthResult {
  accountId: string;
  username: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
  pageId?: string;
  pageName?: string;
}

interface PlatformConfig {
  clientId?: string;
  clientSecret?: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
}

/**
 * Real OAuth 2.0 against the social platforms.
 *
 * What this replaces: `getAuthUrl()` returned a link straight back to our own
 * callback carrying `code=fake_auth_code_123`, and the callback minted
 * `fake_access_token_<platform>_<timestamp>` without talking to anyone. The
 * account list filled up, the UI showed the network as connected, and nothing
 * could ever be posted. It was a demo of a feature, stored as if it were the
 * feature.
 *
 * Credentials are the deployment's to supply. Without them this refuses to
 * start a flow and says which variable is missing, rather than inventing a
 * token that fails later at publish time for reasons nobody can trace.
 */
@Injectable()
export class SocialOAuthService {
  private readonly logger = new Logger(SocialOAuthService.name);

  /**
   * Endpoints and scopes per platform.
   *
   * The scopes are the minimum each platform requires to publish. They are
   * also what the platform's app review is granted against, so they are worth
   * keeping honest: asking for more than is needed is the usual reason a
   * review is refused.
   */
  private config(platform: Platform): PlatformConfig {
    switch (platform) {
      case 'FACEBOOK':
        return {
          clientId: process.env.FACEBOOK_CLIENT_ID,
          clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
          authorizeUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
          tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
          // Posting happens on a Page, never on a personal profile.
          scopes: ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement'],
        };
      case 'INSTAGRAM':
        return {
          // Instagram publishing goes through the Facebook app: an Instagram
          // Business account is reached via the Page it is linked to.
          clientId: process.env.INSTAGRAM_CLIENT_ID || process.env.FACEBOOK_CLIENT_ID,
          clientSecret:
            process.env.INSTAGRAM_CLIENT_SECRET || process.env.FACEBOOK_CLIENT_SECRET,
          authorizeUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
          tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
          scopes: [
            'instagram_basic',
            'instagram_content_publish',
            'pages_show_list',
            'pages_read_engagement',
          ],
        };
      case 'LINKEDIN':
        return {
          clientId: process.env.LINKEDIN_CLIENT_ID,
          clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
          authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
          tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
          scopes: ['openid', 'profile', 'w_member_social'],
        };
      case 'TWITTER':
        return {
          clientId: process.env.TWITTER_CLIENT_ID,
          clientSecret: process.env.TWITTER_CLIENT_SECRET,
          authorizeUrl: 'https://twitter.com/i/oauth2/authorize',
          tokenUrl: 'https://api.twitter.com/2/oauth2/token',
          scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
        };
      default:
        throw new BadRequestException(
          `La publication automatique n'est pas disponible pour ${platform}.`,
        );
    }
  }

  /** Whether this deployment can actually connect the platform. */
  isConfigured(platform: Platform): boolean {
    try {
      const { clientId, clientSecret } = this.config(platform);
      return Boolean(clientId && clientSecret && !/^fake[_-]/i.test(clientId));
    } catch {
      return false;
    }
  }

  /** Every platform this deployment can connect, for the UI to show. */
  configuredPlatforms(): Platform[] {
    return (['FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'TWITTER'] as Platform[]).filter((p) =>
      this.isConfigured(p),
    );
  }

  redirectUri(): string {
    return `${publicApiUrl()}/social/oauth/callback`;
  }

  /**
   * Sign the OAuth `state`.
   *
   * State carries the tenant across the redirect, so it decides which account
   * the returned token is filed under. Unsigned, anyone could send a victim to
   * a callback that attaches THEIR social account to the attacker's tenant —
   * or the reverse. The signature is what makes the value trustworthy when it
   * comes back through the user's browser.
   */
  private signState(payload: string): string {
    const secret = process.env.JWT_SECRET || '';
    return createHmac('sha256', secret).update(payload).digest('base64url');
  }

  buildState(tenantId: string, platform: Platform): string {
    const nonce = randomBytes(12).toString('base64url');
    const payload = `${tenantId}.${platform}.${nonce}`;
    return `${payload}.${this.signState(payload)}`;
  }

  parseState(state: string): { tenantId: string; platform: Platform } {
    const parts = String(state || '').split('.');
    if (parts.length !== 4) throw new BadRequestException('State OAuth invalide.');
    const [tenantId, platform, nonce, signature] = parts;
    const expected = this.signState(`${tenantId}.${platform}.${nonce}`);

    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new BadRequestException('Signature du state OAuth invalide.');
    }
    return { tenantId, platform: platform as Platform };
  }

  /** Where to send the user to authorise the app. */
  authorizeUrl(platform: Platform, tenantId: string): string {
    const cfg = this.config(platform);
    if (!this.isConfigured(platform)) {
      throw new BadRequestException(
        `${platform} n'est pas configure sur ce deploiement. ` +
          `Renseignez ${platform}_CLIENT_ID et ${platform}_CLIENT_SECRET, ` +
          `et declarez ${this.redirectUri()} comme URL de redirection dans l'application ${platform}.`,
      );
    }

    const params = new URLSearchParams({
      client_id: cfg.clientId!,
      redirect_uri: this.redirectUri(),
      state: this.buildState(tenantId, platform),
      response_type: 'code',
      scope: cfg.scopes.join(platform === 'TWITTER' ? ' ' : ','),
    });

    // X requires PKCE. The verifier used to be the constant "challenge",
    // which made PKCE decorative: anyone intercepting a code could redeem it.
    // It is now derived from the signed, single-use state, so it stays
    // stateless (the callback may reach another instance) and secret.
    if (platform === 'TWITTER') {
      const state = params.get('state')!;
      params.set('code_challenge', createHash('sha256').update(this.pkceVerifier(state)).digest('base64url'));
      params.set('code_challenge_method', 'S256');
    }

    return `${cfg.authorizeUrl}?${params.toString()}`;
  }

  /** PKCE verifier for X: secret, and recomputable from the state alone. */
  private pkceVerifier(state: string): string {
    return createHmac('sha256', `${process.env.JWT_SECRET || ''}:pkce`).update(state).digest('base64url');
  }

  /** Exchange the authorisation code for a token, then identify the account. */
  async exchange(platform: Platform, code: string, state = ''): Promise<OAuthResult> {
    const cfg = this.config(platform);
    const token = await this.exchangeCode(platform, cfg, code, state);

    switch (platform) {
      case 'FACEBOOK':
      case 'INSTAGRAM':
        return this.metaAccount(platform, token.access_token, token.expires_in);
      case 'LINKEDIN':
        return this.linkedInAccount(token.access_token, token.expires_in);
      case 'TWITTER':
        return this.twitterAccount(token.access_token, token.refresh_token, token.expires_in);
      default:
        throw new BadRequestException(`Plateforme non geree: ${platform}`);
    }
  }

  private async exchangeCode(
    platform: Platform,
    cfg: PlatformConfig,
    code: string,
    state: string,
  ): Promise<any> {
    const body = new URLSearchParams({
      code,
      client_id: cfg.clientId!,
      client_secret: cfg.clientSecret!,
      redirect_uri: this.redirectUri(),
      grant_type: 'authorization_code',
    });
    if (platform === 'TWITTER') body.set('code_verifier', this.pkceVerifier(state));

    const isGet = platform === 'FACEBOOK' || platform === 'INSTAGRAM';
    const url = isGet ? `${cfg.tokenUrl}?${body.toString()}` : cfg.tokenUrl;

    const res = await fetch(url, {
      method: isGet ? 'GET' : 'POST',
      headers: isGet
        ? {}
        : {
            'Content-Type': 'application/x-www-form-urlencoded',
            // X authenticates the client on this call.
            ...(platform === 'TWITTER'
              ? {
                  Authorization: `Basic ${Buffer.from(
                    `${cfg.clientId}:${cfg.clientSecret}`,
                  ).toString('base64')}`,
                }
              : {}),
          },
      body: isGet ? undefined : body.toString(),
      signal: AbortSignal.timeout(30_000),
    });

    const text = await res.text();
    if (!res.ok) {
      this.logger.error(`Echange de code ${platform} refuse (${res.status}): ${text.slice(0, 250)}`);
      throw new BadRequestException(
        `${platform} a refuse l'autorisation: ${text.slice(0, 200)}`,
      );
    }
    return JSON.parse(text);
  }

  /**
   * Meta: trade the user token for the Page (and, for Instagram, the Business
   * account behind it). A user token cannot publish; a Page token can, and it
   * is the one worth storing.
   */
  private async metaAccount(
    platform: Platform,
    shortLivedToken: string,
    _expiresIn?: number,
  ): Promise<OAuthResult> {
    // The code exchange returns a user token that lives about an hour, and a
    // Page token read with it dies with it: auto-posting used to stop working
    // an hour after the owner connected. Traded for a long-lived user token
    // first, the Page tokens read below do not expire at all.
    const userToken = await this.metaLongLivedToken(platform, shortLivedToken);
    // A Page token from a long-lived user token has no expiry; storing the
    // short token's expiry made the publisher refuse a working token.
    const expiresIn: number | undefined = undefined;
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(userToken)}`,
      { signal: AbortSignal.timeout(30_000) },
    );
    const pages: any = await pagesRes.json();
    if (!pagesRes.ok) {
      throw new BadRequestException(
        `Impossible de lire les pages: ${JSON.stringify(pages).slice(0, 200)}`,
      );
    }

    const page = pages?.data?.[0];
    if (!page) {
      throw new BadRequestException(
        "Aucune Page trouvee sur ce compte. Une application ne peut pas publier sur un profil personnel: creez une Page et reessayez.",
      );
    }

    if (platform === 'INSTAGRAM') {
      const ig = page.instagram_business_account;
      if (!ig?.id) {
        throw new BadRequestException(
          `La Page "${page.name}" n'a pas de compte Instagram professionnel lie. ` +
            'Liez-le dans les parametres de la Page, puis reconnectez.',
        );
      }
      return {
        accountId: ig.id,
        username: ig.username ? `@${ig.username}` : page.name,
        // Instagram publishing is authorised by the PAGE token.
        accessToken: page.access_token,
        expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
        pageId: page.id,
        pageName: page.name,
      };
    }

    return {
      accountId: page.id,
      username: page.name,
      accessToken: page.access_token,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
      pageId: page.id,
      pageName: page.name,
    };
  }

  private async metaLongLivedToken(platform: Platform, shortLived: string): Promise<string> {
    const cfg = this.config(platform);
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: cfg.clientId!,
      client_secret: cfg.clientSecret!,
      fb_exchange_token: shortLived,
    });
    const res = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?${params}`, {
      signal: AbortSignal.timeout(30_000),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data?.access_token) {
      throw new BadRequestException(
        `Meta a refuse le jeton longue duree: ${JSON.stringify(data?.error || data).slice(0, 200)}`,
      );
    }
    return data.access_token;
  }

  /**
   * A fresh X access token from the stored refresh token.
   *
   * X access tokens last two hours. The refresh token was requested
   * (offline.access) and stored, and never used: every X post scheduled more
   * than two hours after connecting failed with "token expired". X rotates
   * the refresh token on every use, so both are returned for storage.
   */
  async refreshTwitter(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresAt?: Date }> {
    const cfg = this.config('TWITTER' as Platform);
    const res = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: cfg.clientId!,
      }).toString(),
      signal: AbortSignal.timeout(30_000),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data?.access_token) {
      throw new Error(`X a refuse le renouvellement du jeton (${res.status}): ${JSON.stringify(data).slice(0, 200)}`);
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
    };
  }

  private async linkedInAccount(accessToken: string, expiresIn?: number): Promise<OAuthResult> {
    const res = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(30_000),
    });
    const me: any = await res.json();
    if (!res.ok) {
      throw new BadRequestException(`LinkedIn: ${JSON.stringify(me).slice(0, 200)}`);
    }
    return {
      accountId: me.sub,
      username: me.name || me.email || me.sub,
      accessToken,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
    };
  }

  private async twitterAccount(
    accessToken: string,
    refreshToken?: string,
    expiresIn?: number,
  ): Promise<OAuthResult> {
    const res = await fetch('https://api.twitter.com/2/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(30_000),
    });
    const me: any = await res.json();
    if (!res.ok) {
      throw new BadRequestException(`X: ${JSON.stringify(me).slice(0, 200)}`);
    }
    return {
      accountId: me?.data?.id,
      username: me?.data?.username ? `@${me.data.username}` : me?.data?.name,
      accessToken,
      refreshToken,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
    };
  }
}
