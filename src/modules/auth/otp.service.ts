import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';

/**
 * One-time codes for the second step of login.
 *
 * Design notes, because each of these is a property someone will rely on:
 *
 * - The code is never stored. Only SHA-256(code + OTP_PEPPER) is, so reading
 *   the database does not yield working codes. SHA-256 rather than bcrypt is
 *   deliberate: the input space is six digits, so a slow hash buys nothing
 *   against an offline attacker, while the online path is protected by the
 *   attempt counter and the short lifetime.
 * - Issuing a code supersedes every earlier one for that user and purpose, so
 *   "only the last code works" is enforced by the query, not by convention.
 * - A consumed code is marked consumed inside the same transaction that
 *   verifies it, so it cannot be replayed by two concurrent requests.
 * - Comparison is constant-time.
 */

export interface OtpIssueResult {
  challengeId: string;
  expiresAt: Date;
  /** Seconds the caller must wait before a resend is accepted. */
  resendAfterSeconds: number;
  /**
   * The plain code, returned ONLY when OTP_EXPOSE_CODE is on — a local
   * development affordance so the flow can be driven without a mailbox.
   * Never set when that flag is off.
   */
  devCode?: string;
}

const DIGITS = 6;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  private get ttlSeconds(): number {
    return Math.max(60, Number(process.env.OTP_TTL_SECONDS || 300));
  }
  private get resendCooldownSeconds(): number {
    return Math.max(15, Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60));
  }
  private get maxAttempts(): number {
    return Math.max(1, Number(process.env.OTP_MAX_ATTEMPTS || 5));
  }
  private get maxResends(): number {
    return Math.max(1, Number(process.env.OTP_MAX_RESENDS || 3));
  }
  /** Local-development affordance; must never be on in production. */
  private get exposeCode(): boolean {
    return (
      process.env.OTP_EXPOSE_CODE === 'true' && process.env.NODE_ENV !== 'production'
    );
  }

  /** Whether the second factor is active at all. */
  get enabled(): boolean {
    return process.env.OTP_ENABLED !== 'false';
  }

  private hash(code: string): string {
    return createHash('sha256')
      .update(`${code}:${process.env.OTP_PEPPER || 'nextgen-otp'}`)
      .digest('hex');
  }

  /** Cryptographically uniform, unlike Math.random(). */
  private generate(): string {
    return String(randomInt(0, 10 ** DIGITS)).padStart(DIGITS, '0');
  }

  /**
   * Issue a code and email it.
   *
   * Supersedes any live challenge for the same user and purpose. Returns the
   * challenge id the client must present when verifying — the user id is never
   * exposed to the client between the two steps.
   */
  async issue(
    userId: string,
    email: string,
    purpose: string,
    meta: { ip?: string; userAgent?: string } = {},
  ): Promise<OtpIssueResult> {
    const now = new Date();
    const code = this.generate();
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1000);

    const challenge = await this.prisma.$transaction(async (tx) => {
      // Only the newest code may ever work.
      await tx.otpChallenge.updateMany({
        where: { userId, purpose, consumedAt: null, supersededAt: null },
        data: { supersededAt: now },
      });

      return tx.otpChallenge.create({
        data: {
          userId,
          purpose,
          codeHash: this.hash(code),
          expiresAt,
          maxAttempts: this.maxAttempts,
          lastSentAt: now,
          ip: meta.ip,
          userAgent: meta.userAgent?.slice(0, 250),
        },
      });
    });

    await this.deliver(email, code, this.ttlSeconds);

    return {
      challengeId: challenge.id,
      expiresAt,
      resendAfterSeconds: this.resendCooldownSeconds,
      ...(this.exposeCode ? { devCode: code } : {}),
    };
  }

  /**
   * Re-send the code for an existing challenge.
   *
   * A resend issues a NEW code (an unchanged code re-sent after a leak is a
   * gift), supersedes the old one, and is refused inside the cooldown so the
   * endpoint cannot be used to mail-bomb an address.
   */
  async resend(
    challengeId: string,
    meta: { ip?: string; userAgent?: string } = {},
  ): Promise<OtpIssueResult> {
    const existing = await this.prisma.otpChallenge.findUnique({
      where: { id: challengeId },
      include: { user: { select: { email: true, isActive: true } } },
    });

    if (!existing || !existing.user?.isActive) {
      throw new UnauthorizedException('Demande de code invalide. Recommencez la connexion.');
    }
    if (existing.consumedAt) {
      throw new BadRequestException('Ce code a deja ete utilise. Recommencez la connexion.');
    }

    const waited = (Date.now() - existing.lastSentAt.getTime()) / 1000;
    if (waited < this.resendCooldownSeconds) {
      const remaining = Math.ceil(this.resendCooldownSeconds - waited);
      throw new BadRequestException(
        `Merci de patienter ${remaining} seconde(s) avant de demander un nouveau code.`,
      );
    }
    if (existing.resendCount >= this.maxResends) {
      throw new BadRequestException(
        'Nombre maximal de renvois atteint. Recommencez la connexion.',
      );
    }

    const now = new Date();
    const code = this.generate();
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1000);

    const challenge = await this.prisma.$transaction(async (tx) => {
      await tx.otpChallenge.updateMany({
        where: {
          userId: existing.userId,
          purpose: existing.purpose,
          consumedAt: null,
          supersededAt: null,
        },
        data: { supersededAt: now },
      });

      return tx.otpChallenge.create({
        data: {
          userId: existing.userId,
          purpose: existing.purpose,
          codeHash: this.hash(code),
          expiresAt,
          maxAttempts: this.maxAttempts,
          // The counter follows the chain, not the individual challenge, or
          // the cap would reset with every resend.
          resendCount: existing.resendCount + 1,
          lastSentAt: now,
          ip: meta.ip,
          userAgent: meta.userAgent?.slice(0, 250),
        },
      });
    });

    await this.deliver(existing.user.email, code, this.ttlSeconds);

    return {
      challengeId: challenge.id,
      expiresAt,
      resendAfterSeconds: this.resendCooldownSeconds,
      ...(this.exposeCode ? { devCode: code } : {}),
    };
  }

  /**
   * Verify a code and consume it.
   *
   * Returns the user id on success. Every failure path is a distinct, honest
   * message — the user needs to know whether to retype, wait, or start over —
   * without revealing whether a given code was ever valid.
   */
  async verify(challengeId: string, code: string): Promise<string> {
    if (!/^\d{6}$/.test(String(code || ''))) {
      throw new BadRequestException('Le code doit contenir 6 chiffres.');
    }

    const challenge = await this.prisma.otpChallenge.findUnique({
      where: { id: challengeId },
    });

    if (!challenge) {
      throw new UnauthorizedException('Demande de code invalide. Recommencez la connexion.');
    }
    if (challenge.consumedAt) {
      throw new UnauthorizedException('Ce code a deja ete utilise. Recommencez la connexion.');
    }
    if (challenge.supersededAt) {
      throw new UnauthorizedException(
        'Un code plus recent a ete envoye. Utilisez le dernier code recu.',
      );
    }
    if (challenge.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Ce code a expire. Demandez-en un nouveau.');
    }
    if (challenge.attempts >= challenge.maxAttempts) {
      throw new UnauthorizedException(
        'Trop de tentatives. Demandez un nouveau code.',
      );
    }

    const expected = Buffer.from(challenge.codeHash, 'hex');
    const actual = Buffer.from(this.hash(String(code)), 'hex');
    const matches =
      expected.length === actual.length && timingSafeEqual(expected, actual);

    if (!matches) {
      const updated = await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      const left = Math.max(0, updated.maxAttempts - updated.attempts);
      throw new UnauthorizedException(
        left > 0
          ? `Code incorrect. ${left} tentative(s) restante(s).`
          : 'Code incorrect. Trop de tentatives, demandez un nouveau code.',
      );
    }

    // Consume conditionally: two concurrent requests with the same correct
    // code must not both succeed.
    const consumed = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw new UnauthorizedException('Ce code a deja ete utilise. Recommencez la connexion.');
    }

    return challenge.userId;
  }

  /** Drop expired and spent challenges. Safe to call on a schedule. */
  async purge(): Promise<number> {
    const { count } = await this.prisma.otpChallenge.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } },
          { consumedAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } },
        ],
      },
    });
    return count;
  }

  private async deliver(email: string, code: string, ttlSeconds: number) {
    const minutes = Math.round(ttlSeconds / 60);
    await this.mail.send({
      to: email,
      subject: `Votre code de connexion : ${code}`,
      text: [
        'Voici votre code de connexion NextGen MarketingAI :',
        '',
        `    ${code}`,
        '',
        `Il est valable ${minutes} minute(s) et ne peut servir qu'une seule fois.`,
        "Si vous n'avez pas demande ce code, ignorez ce message et changez votre mot de passe.",
      ].join('\n'),
    });
  }
}
