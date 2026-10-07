import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ChangePasswordDto,
  LoginDto,
  RegisterDto,
  UpdateProfileDto,
} from './auth.dto';
import * as bcrypt from 'bcrypt';
import { OtpService } from './otp.service';
import { RefreshTokenService } from './refresh-token.service';

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
}

/** Where a request came from, kept on the OTP challenge and refresh token. */
export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

/**
 * Login's first step when the second factor is on. Carries no token and no
 * user id: the only thing the client can do with it is present a code.
 */
export interface OtpChallengeResponse {
  otpRequired: true;
  challengeId: string;
  /** Masked, so the UI can say where the code went without leaking it. */
  email: string;
  expiresAt: string;
  resendAfterSeconds: number;
  /** Only present when OTP_EXPOSE_CODE is on outside production. */
  devCode?: string;
}

export type LoginResult = AuthResponse | OtpChallengeResponse;

export interface AuthResponse {
  accessToken: string;
  /** Access token lifetime in seconds; the client refreshes before it lapses. */
  expiresIn: number;
  /** Opaque, rotated. Returned so non-browser clients can hold it too. */
  refreshToken: string;
  refreshExpiresIn: number;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    /** Platform operator — the /admin console. Not a tenant role. */
    isSuperAdmin: boolean;
    tenantId: string;
    tenant: {
      id: string;
      name: string;
      slug: string;
      plan: string;
    };
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private readonly otp: OtpService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  /** Access token lifetime, mirrored from the JWT module's configuration. */
  private get accessTtlSeconds(): number {
    const raw = process.env.JWT_EXPIRATION || '24h';
    const match = /^(\d+)(ms|s|m|h|d|w|y)$/.exec(raw);
    if (!match) return 3600;
    const value = Number(match[1]);
    const unit: Record<string, number> = {
      ms: 0.001, s: 1, m: 60, h: 3600, d: 86400, w: 604800, y: 31536000,
    };
    return Math.round(value * (unit[match[2]] ?? 1));
  }

  /**
   * Mint a complete session for a user who has already proved who they are.
   * The single place tokens are created, so login, OTP verification and
   * refresh cannot drift apart.
   */
  private async buildSession(user: any, meta: RequestMeta = {}): Promise<AuthResponse> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    };
    const accessToken = await this.jwtService.signAsync(payload);
    const refresh = await this.refreshTokens.issue(user.id, meta);

    return {
      accessToken,
      expiresIn: this.accessTtlSeconds,
      refreshToken: refresh.token,
      refreshExpiresIn: this.refreshTokens.ttlSeconds,
      user: this.sessionUser(user),
    };
  }

  /** The user as every session response describes it. */
  private sessionUser(user: any): AuthResponse['user'] {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isSuperAdmin: user.isSuperAdmin === true,
      tenantId: user.tenantId,
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        slug: user.tenant.slug,
        plan: user.tenant.plan,
      },
    };
  }

  /** "someone@example.com" -> "so******@example.com" */
  private maskEmail(email: string): string {
    const [local, domainPart] = String(email || '').split('@');
    if (!domainPart) return '***';
    const head = local.slice(0, 2);
    return `${head}${'*'.repeat(Math.max(1, local.length - 2))}@${domainPart}`;
  }

  /**
   * Second step of login: exchange a one-time code for a session.
   * The challenge id identifies the user, so a caller cannot verify a code
   * against an account other than the one that started the login.
   */
  async verifyOtp(
    challengeId: string,
    code: string,
    meta: RequestMeta = {},
  ): Promise<AuthResponse> {
    const userId = await this.otp.verify(challengeId, code);

    const user = await this.prisma.user.findUnique({
      where: { id: userId, isActive: true },
      include: { tenant: true },
    });
    if (!user || !user.tenant?.isActive) {
      throw new UnauthorizedException('Compte indisponible.');
    }

    // Proving control of the mailbox is exactly what email verification is.
    if (!user.emailVerified) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });
    }

    this.logger.log(`Connexion validee par OTP: ${user.email}`);
    return this.buildSession(user, meta);
  }

  async resendOtp(challengeId: string, meta: RequestMeta = {}) {
    const issued = await this.otp.resend(challengeId, meta);
    return {
      challengeId: issued.challengeId,
      expiresAt: issued.expiresAt.toISOString(),
      resendAfterSeconds: issued.resendAfterSeconds,
      ...(issued.devCode ? { devCode: issued.devCode } : {}),
    };
  }

  /**
   * Renew an access token. Rotates the refresh token, so a stolen one is
   * usable at most once before the family is revoked.
   */
  async refresh(refreshToken: string, meta: RequestMeta = {}): Promise<AuthResponse> {
    const { userId, next } = await this.refreshTokens.rotate(refreshToken, meta);

    const user = await this.prisma.user.findUnique({
      where: { id: userId, isActive: true },
      include: { tenant: true },
    });
    if (!user || !user.tenant?.isActive) {
      throw new UnauthorizedException('Compte indisponible.');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      expiresIn: this.accessTtlSeconds,
      refreshToken: next.token,
      refreshExpiresIn: this.refreshTokens.ttlSeconds,
      user: this.sessionUser(user),
    };
  }

  /** Logout has to invalidate the session server-side, not just locally. */
  async logout(refreshToken?: string): Promise<void> {
    if (refreshToken) await this.refreshTokens.revoke(refreshToken, 'LOGOUT');
  }

  /**
   * Slugs a tenant may not take: "admin" is the operator's own tenant (its
   * bootstrap would fail on the unique slug), the others are subdomains the
   * tenant middleware deliberately never resolves.
   */
  private static readonly RESERVED_SLUGS = new Set(['admin', 'api', 'www', 'app', 'localhost']);

  async register(dto: RegisterDto, meta: RequestMeta = {}): Promise<AuthResponse> {
    if (AuthService.RESERVED_SLUGS.has(dto.tenantSlug)) {
      throw new ConflictException('Ce slug de tenant est réservé');
    }

    // Check if tenant slug already exists
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.tenantSlug },
    });

    if (existingTenant) {
      throw new ConflictException('Ce slug de tenant est déjà utilisé');
    }

    // Check if user email already exists in this tenant
    const existingUser = await this.prisma.user.findFirst({
      where: {
        email: dto.email,
        tenant: { slug: dto.tenantSlug },
      },
    });

    if (existingUser) {
      throw new ConflictException('Un utilisateur avec cet email existe déjà dans ce tenant');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 12);

    // Create tenant and user in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.tenantName,
          slug: dto.tenantSlug,
          plan: 'FREE',
        },
      });

      const user = await tx.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          firstName: dto.firstName || null,
          lastName: dto.lastName || null,
          role: 'OWNER',
          tenantId: tenant.id,
        },
      });

      // Automatically create a Brand with the provided AI Context
      await tx.brand.create({
        data: {
          name: dto.tenantName,
          slug: dto.tenantSlug,
          industry: dto.industry || null,
          description: dto.description || null,
          targetAudience: dto.targetAudience || null,
          tone: dto.tone || 'professional',
          tenantId: tenant.id,
        },
      });

      // The tenant's single source of truth. Every generation feature reads it
      // so the user never re-enters their business details in a form.
      await tx.businessContext.create({
        data: {
          businessName: dto.tenantName,
          businessType: dto.businessType || 'OTHER',
          industry: dto.industry || null,
          description: dto.description || '',
          services: dto.services ?? [],
          targetAudience: dto.targetAudience || null,
          tone: dto.tone || 'professional',
          language: dto.language || 'fr',
          currency: dto.currency || 'EUR',
          contactEmail: dto.email,
          tenantId: tenant.id,
        },
      });

      return { tenant, user };
    });

    this.logger.log(
      `Utilisateur inscrit: ${result.user.email} (tenant ${result.tenant.slug})`,
    );

    // Registration signs the user in directly: creating the account already
    // proves control of it, so a second factor here would only be a hurdle.
    // Same session shape as every other entry point.
    return this.buildSession(
      { ...result.user, tenantId: result.tenant.id, tenant: result.tenant },
      meta,
    );
  }

  async login(dto: LoginDto, meta: RequestMeta = {}): Promise<LoginResult> {
    // Super Admin Check
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPass = process.env.ADMIN_PASSWORD;

    if (adminEmail && dto.email === adminEmail) {
      // Looked up by the flag, not the email alone: a tenant user who happened
      // to register with this address must not be mistaken for the operator.
      let adminUser = await this.prisma.user.findFirst({
        where: { email: adminEmail, isSuperAdmin: true, isActive: true },
        include: { tenant: true },
      });

      if (adminUser) {
        const isPasswordValid = await bcrypt.compare(dto.password, adminUser.password);
        if (!isPasswordValid) {
          this.logger.warn(`Login failed: Invalid password for super admin ${dto.email}`);
          throw new UnauthorizedException('Email ou mot de passe incorrect');
        }
      } else if (adminPass && dto.password === adminPass) {
        // Create the admin user and a default tenant
        const hashedPassword = await bcrypt.hash(adminPass, 12);
        adminUser = await this.prisma.$transaction(async (tx) => {
          const tenant = await tx.tenant.create({
            data: {
              name: 'NextGen Admin',
              slug: 'admin',
              plan: 'PRO',
            },
          });
          const user = await tx.user.create({
            data: {
              email: adminEmail,
              password: hashedPassword,
              firstName: 'Super',
              lastName: 'Admin',
              role: 'OWNER',
              isSuperAdmin: true,
              tenantId: tenant.id,
            },
          });
          return { ...user, tenant };
        });
      } else {
        throw new UnauthorizedException('Email ou mot de passe incorrect');
      }

      // Same second factor as everyone else — more so, given what this
      // account can reach.
      if (this.otp.enabled) {
        return this.challenge(adminUser, meta);
      }

      this.logger.log(`Super Admin connecte: ${adminUser.email}`);
      return this.buildSession(adminUser, meta);
    }

    // Normal User Login
    const whereClause: any = {
      email: dto.email,
      isActive: true,
    };

    if (dto.tenantSlug) {
      whereClause.tenant = { slug: dto.tenantSlug };
    }

    const user = await this.prisma.user.findFirst({
      where: whereClause,
      include: { tenant: true },
    });

    if (!user) {
      this.logger.warn(`Login failed: User not found for email ${dto.email}`);
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      this.logger.warn(`Login failed: Invalid password for user ${dto.email}`);
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    // The password is only the first factor. Nothing is minted here: the
    // challenge carries no token, so a stolen password alone buys nothing.
    if (this.otp.enabled) {
      return this.challenge(user, meta);
    }

    this.logger.log(`Utilisateur connecte: ${user.email}`);
    return this.buildSession(user, meta);
  }

  /**
   * Issue the second-factor challenge for a user whose password checked out.
   *
   * Shared by both login paths on purpose. The super-admin branch used to fall
   * straight through to buildSession(), so the one account that can reach
   * /admin/* — tenants, users, subscriptions — was the only account in the
   * system exempt from 2FA. A leaked admin password was a complete takeover
   * while every ordinary user was protected.
   */
  private async challenge(user: any, meta: RequestMeta): Promise<OtpChallengeResponse> {
    const issued = await this.otp.issue(user.id, user.email, 'LOGIN', meta);
    this.logger.log(`Code de connexion envoye pour ${this.maskEmail(user.email)}`);
    return {
      otpRequired: true,
      challengeId: issued.challengeId,
      email: this.maskEmail(user.email),
      expiresAt: issued.expiresAt.toISOString(),
      resendAfterSeconds: issued.resendAfterSeconds,
      ...(issued.devCode ? { devCode: issued.devCode } : {}),
    };
  }

  async validateUser(userId: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, isActive: true },
      include: { tenant: true },
    });

    if (!user) {
      throw new UnauthorizedException('Utilisateur non trouvé ou inactif');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isSuperAdmin: user.isSuperAdmin,
      tenantId: user.tenantId,
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        slug: user.tenant.slug,
        plan: user.tenant.plan,
      },
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
      include: { tenant: true },
    });
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tenantId: user.tenantId,
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const isValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isValid) throw new UnauthorizedException('Current password is incorrect');

    const hashed = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });
    return { message: 'Password updated successfully' };
  }
}
