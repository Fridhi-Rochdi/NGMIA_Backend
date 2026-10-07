import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Refresh tokens, rotated.
 *
 * The access token is deliberately short-lived, which only works if there is a
 * way to renew it without asking for the password again. Each refresh token is
 * opaque, stored only as a SHA-256 hash, and single-use: presenting it revokes
 * it and mints a successor in the same family.
 *
 * A token presented twice is either a replay or a leak. The correct response
 * is not to accept it — it is to revoke the entire family, because we cannot
 * tell the legitimate holder from the attacker.
 */

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
  familyId: string;
}

@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(private readonly prisma: PrismaService) {}

  get ttlSeconds(): number {
    return Math.max(3600, Number(process.env.REFRESH_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 30));
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async issue(
    userId: string,
    meta: { ip?: string; userAgent?: string } = {},
    familyId: string = randomUUID(),
  ): Promise<IssuedRefreshToken> {
    const token = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: this.hash(token),
        expiresAt,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 250),
      },
    });

    return { token, expiresAt, familyId };
  }

  /**
   * Exchange a refresh token for a new one.
   *
   * Returns the owning user id plus the successor token. Throws on anything
   * that is not a live, unused token.
   */
  async rotate(
    token: string,
    meta: { ip?: string; userAgent?: string } = {},
  ): Promise<{ userId: string; next: IssuedRefreshToken }> {
    if (!token) throw new UnauthorizedException('Session expiree. Reconnectez-vous.');

    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { user: { select: { id: true, isActive: true } } },
    });

    if (!existing) {
      throw new UnauthorizedException('Session expiree. Reconnectez-vous.');
    }

    // Already revoked means this value was used before. Either a replay or a
    // stolen token; revoke the family rather than guess which.
    if (existing.revokedAt) {
      this.logger.warn(
        `Refresh token reutilise (famille ${existing.familyId}); revocation de la famille`,
      );
      await this.revokeFamily(existing.familyId, 'REUSE_DETECTED');
      throw new UnauthorizedException('Session invalidee. Reconnectez-vous.');
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Session expiree. Reconnectez-vous.');
    }
    if (!existing.user?.isActive) {
      throw new UnauthorizedException('Compte desactive.');
    }

    // Revoke conditionally so two concurrent refreshes cannot both rotate.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'ROTATED' },
    });
    if (claimed.count !== 1) {
      throw new UnauthorizedException('Session expiree. Reconnectez-vous.');
    }

    const next = await this.issue(existing.userId, meta, existing.familyId);
    return { userId: existing.userId, next };
  }

  /** Revoke a single token — used by logout. */
  async revoke(token: string, reason = 'LOGOUT'): Promise<void> {
    if (!token) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hash(token), revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /** Every session for a user — used when the password changes. */
  async revokeAllForUser(userId: string, reason: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /** Drop tokens that expired a while ago. Safe to call on a schedule. */
  async purge(): Promise<number> {
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 7 * 24 * 3600 * 1000) } },
    });
    return count;
  }
}
