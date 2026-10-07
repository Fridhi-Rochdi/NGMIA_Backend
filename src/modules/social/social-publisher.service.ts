import { Injectable, Logger } from '@nestjs/common';
import { Platform, SocialAccount } from '@prisma/client';

export interface PublishResult {
  /** The post's id on the platform, for linking back or deleting. */
  externalId: string;
  url?: string;
}

/**
 * Thrown when publishing will not succeed by being retried — a revoked token,
 * a missing permission, copy the platform rejects. The scheduler stops instead
 * of burning attempts on it.
 */
export class PermanentPublishError extends Error {}

/**
 * Publishes a post to a platform, for real.
 *
 * Each platform is a different shape of the same idea, and the differences are
 * the whole job:
 *
 * - Facebook takes the text in one call against the Page.
 * - Instagram refuses to publish text alone. It needs an image, and it needs
 *   two calls: create a media container, then publish it. The image must be a
 *   public URL the platform can fetch — it pulls the file itself.
 * - LinkedIn wants the author as a URN and its own envelope.
 * - X is one call, and the shortest limit of the four.
 */
@Injectable()
export class SocialPublisherService {
  private readonly logger = new Logger(SocialPublisherService.name);

  /** Hard limits, so copy is cut before the platform refuses the whole post. */
  private readonly LIMITS: Partial<Record<Platform, number>> = {
    TWITTER: 280,
    FACEBOOK: 63206,
    INSTAGRAM: 2200,
    LINKEDIN: 3000,
  };

  async publish(
    account: SocialAccount,
    text: string,
    imageUrl?: string | null,
  ): Promise<PublishResult> {
    const limit = this.LIMITS[account.platform];
    const body = limit && text.length > limit ? `${text.slice(0, limit - 1)}…` : text;

    if (account.expiresAt && account.expiresAt.getTime() < Date.now()) {
      throw new PermanentPublishError(
        `Le jeton ${account.platform} a expire le ${account.expiresAt.toISOString().slice(0, 10)}. Reconnectez le compte.`,
      );
    }

    try {
      switch (account.platform) {
        case 'FACEBOOK':
          return await this.facebook(account, body, imageUrl);
        case 'INSTAGRAM':
          return await this.instagram(account, body, imageUrl);
        case 'LINKEDIN':
          return await this.linkedin(account, body);
        case 'TWITTER':
          return await this.twitter(account, body);
        default:
          throw new PermanentPublishError(
            `La publication automatique n'est pas disponible pour ${account.platform}.`,
          );
      }
    } catch (error: any) {
      // A request that timed out may still have been accepted: retrying it
      // is how a post appears twice on someone's page. Stop and ask.
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw new PermanentPublishError(
          `${account.platform} n'a pas repondu a temps. Le post est peut-etre en ligne: ` +
            'verifiez sur le reseau avant de relancer.',
        );
      }
      throw error;
    }
  }

  /** Read the platform's answer and decide whether retrying could ever help. */
  private async parse(res: Response, platform: string): Promise<any> {
    const text = await res.text();
    let payload: any;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }

    if (res.ok) return payload;

    const detail = String(payload?.error?.message || payload?.message || text).slice(0, 220);

    // 4xx other than rate limiting is a decision, not a hiccup: the token is
    // revoked, a scope is missing, the copy is refused. Retrying posts nothing
    // and hides the real reason behind "3 attempts failed".
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      throw new PermanentPublishError(`${platform} a refuse la publication: ${detail}`);
    }
    throw new Error(`${platform} (${res.status}): ${detail}`);
  }

  private async facebook(
    account: SocialAccount,
    message: string,
    imageUrl?: string | null,
  ): Promise<PublishResult> {
    const pageId = account.pageId || account.accountId;
    const endpoint = imageUrl
      ? `https://graph.facebook.com/v21.0/${pageId}/photos`
      : `https://graph.facebook.com/v21.0/${pageId}/feed`;

    const body = new URLSearchParams({ access_token: account.accessToken });
    if (imageUrl) {
      body.set('url', imageUrl);
      body.set('caption', message);
    } else {
      body.set('message', message);
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(60_000),
    });
    const data = await this.parse(res, 'Facebook');
    const id = data.post_id || data.id;
    return { externalId: id, url: `https://facebook.com/${id}` };
  }

  /**
   * Instagram: container, then publish.
   *
   * The image URL must be publicly reachable — Instagram fetches it from its
   * own servers, so a localhost or private address produces a container that
   * never becomes ready.
   */
  private async instagram(
    account: SocialAccount,
    caption: string,
    imageUrl?: string | null,
  ): Promise<PublishResult> {
    if (!imageUrl) {
      throw new PermanentPublishError(
        "Instagram n'accepte pas de publication sans visuel. Associez une image a cet evenement.",
      );
    }
    if (/localhost|127\.0\.0\.1|192\.168\.|10\./.test(imageUrl)) {
      throw new PermanentPublishError(
        `Instagram doit pouvoir telecharger l'image lui-meme, or ${imageUrl.slice(0, 60)} n'est pas joignable depuis internet. ` +
          'Publiez les visuels sur une URL publique (PUBLIC_API_URL).',
      );
    }

    const create = await fetch(
      `https://graph.facebook.com/v21.0/${account.accountId}/media`,
      {
        method: 'POST',
        body: new URLSearchParams({
          image_url: imageUrl,
          caption,
          access_token: account.accessToken,
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    const container = await this.parse(create, 'Instagram');

    // Instagram fetches and processes the image asynchronously. Publishing a
    // container that is still IN_PROGRESS is answered with a 400, which the
    // scheduler rightly treats as final, so a perfectly good post was marked
    // FAILED whenever Instagram was slower than our next call.
    await this.waitForContainer(container.id, account.accessToken);

    const publish = await fetch(
      `https://graph.facebook.com/v21.0/${account.accountId}/media_publish`,
      {
        method: 'POST',
        body: new URLSearchParams({
          creation_id: container.id,
          access_token: account.accessToken,
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    const published = await this.parse(publish, 'Instagram');
    return { externalId: published.id };
  }

  private async waitForContainer(containerId: string, token: string): Promise<void> {
    const deadline = Date.now() + 90_000;
    for (;;) {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${containerId}?fields=status_code&access_token=${encodeURIComponent(token)}`,
        { signal: AbortSignal.timeout(30_000) },
      );
      const data = await this.parse(res, 'Instagram');
      if (data?.status_code === 'FINISHED') return;
      if (data?.status_code === 'ERROR' || data?.status_code === 'EXPIRED') {
        throw new PermanentPublishError(`Instagram n'a pas pu traiter l'image (${data.status_code}).`);
      }
      if (Date.now() > deadline) {
        throw new Error("Instagram traite encore l'image; nouvelle tentative au prochain passage.");
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  private async linkedin(account: SocialAccount, text: string): Promise<PublishResult> {
    const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author: `urn:li:person:${account.accountId}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const data = await this.parse(res, 'LinkedIn');
    const id = data.id || res.headers.get('x-restli-id') || '';
    return { externalId: id };
  }

  private async twitter(account: SocialAccount, text: string): Promise<PublishResult> {
    const res = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(60_000),
    });
    const data = await this.parse(res, 'X');
    return {
      externalId: data?.data?.id,
      url: `https://x.com/i/status/${data?.data?.id}`,
    };
  }
}
