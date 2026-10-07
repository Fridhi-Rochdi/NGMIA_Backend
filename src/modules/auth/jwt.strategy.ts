import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { ACCESS_COOKIE, readCookie } from './auth-cookies';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      // Two sources, in order of specificity:
      //  - Authorization: Bearer — scripts, the admin console, mobile clients.
      //  - the HttpOnly access cookie — browsers, where keeping the token out
      //    of JavaScript is the whole point and where it also means a page can
      //    authenticate before any client code has run.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => readCookie(req, ACCESS_COOKIE) ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    // Verify user still exists and is active
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub, isActive: true },
      include: { tenant: true },
    });

    if (!user) {
      throw new UnauthorizedException('Utilisateur non trouvé ou inactif');
    }

    if (!user.tenant.isActive) {
      throw new UnauthorizedException('Tenant inactif');
    }

    return {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
      // Read fresh from the database, never trusted from the token: revoking
      // it takes effect on the very next request.
      isSuperAdmin: user.isSuperAdmin,
    };
  }
}
