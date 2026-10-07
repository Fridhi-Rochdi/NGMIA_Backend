import {
  Controller,
  Post,
  Put,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Request,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, VerifyOtpDto, ResendOtpDto } from './auth.dto';
import {
  REFRESH_COOKIE,
  clearSessionCookies,
  clientIp,
  readCookie,
  setSessionCookies,
} from './auth-cookies';
import { AuthenticatedRequest } from '../../common/types/authenticated-request';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * Read the request's origin for the audit fields on challenges and tokens.
   */
  private meta(req: any) {
    return { ip: clientIp(req), userAgent: req.headers?.['user-agent'] };
  }

  /**
   * Hand the session to the browser as cookies AND return it in the body.
   *
   * Cookies are what make the session survive a refresh without JavaScript
   * having to restore anything, which is what removes the race where the app
   * decided the user was logged out before the token was read back. The body
   * copy is for non-browser clients (the admin console, scripts) that hold a
   * bearer token themselves.
   */
  private withSession(res: Response, session: any) {
    setSessionCookies(res, {
      accessToken: session.accessToken,
      accessMaxAgeSeconds: session.expiresIn,
      refreshToken: session.refreshToken,
      refreshMaxAgeSeconds: session.refreshExpiresIn,
    });
    return session;
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: "Inscription d'un nouvel utilisateur avec création de tenant" })
  @ApiResponse({ status: 201, description: 'Utilisateur créé avec succès' })
  @ApiResponse({ status: 409, description: 'Email ou slug déjà utilisé' })
  async register(
    @Body() registerDto: RegisterDto,
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.withSession(
      res,
      await this.authService.register(registerDto, this.meta(req)),
    );
  }

  /**
   * First step: credentials. Returns either a full session (second factor off)
   * or an OTP challenge carrying no token at all.
   *
   * Throttled hard: this is the endpoint an attacker points a password list at.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "Connexion d'un utilisateur" })
  @ApiResponse({ status: 200, description: 'Connexion réussie ou code envoyé' })
  @ApiResponse({ status: 401, description: 'Identifiants invalides' })
  async login(
    @Body() loginDto: LoginDto,
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(loginDto, this.meta(req));
    // A challenge is not a session: no cookies are set until the code is in.
    if ('otpRequired' in result) return result;
    return this.withSession(res, result);
  }

  /**
   * Second step: the one-time code. Only here does a session come into being.
   *
   * Throttled per IP on top of the per-challenge attempt counter, so an
   * attacker cannot spread guesses across freshly issued challenges.
   */
  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @ApiOperation({ summary: 'Vérifier le code à usage unique et ouvrir la session' })
  @ApiResponse({ status: 200, description: 'Code accepté' })
  @ApiResponse({ status: 401, description: 'Code incorrect, expiré ou déjà utilisé' })
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.withSession(
      res,
      await this.authService.verifyOtp(dto.challengeId, dto.code, this.meta(req)),
    );
  }

  /** Issue a fresh code for a pending challenge, subject to the cooldown. */
  @Public()
  @Post('otp/resend')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Renvoyer un nouveau code' })
  @ApiResponse({ status: 200, description: 'Nouveau code envoyé' })
  @ApiResponse({ status: 400, description: 'Cooldown non écoulé ou trop de renvois' })
  async resendOtp(@Body() dto: ResendOtpDto, @Request() req: any) {
    return this.authService.resendOtp(dto.challengeId, this.meta(req));
  }

  /**
   * Renew the access token from the HttpOnly refresh cookie.
   *
   * This is what keeps a logged-in user logged in: the access token is short,
   * and the page silently renews it instead of bouncing to the login screen.
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Renouveler la session' })
  @ApiResponse({ status: 200, description: 'Session renouvelée' })
  @ApiResponse({ status: 401, description: 'Session expirée ou invalidée' })
  async refresh(
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
    @Body() body: { refreshToken?: string } = {},
  ) {
    // Browsers send the cookie; other clients may pass it in the body.
    const token = readCookie(req, REFRESH_COOKIE) || body?.refreshToken || '';
    try {
      return this.withSession(
        res,
        await this.authService.refresh(token, this.meta(req)),
      );
    } catch (error) {
      // A refusal must leave nothing behind that looks like a session.
      clearSessionCookies(res);
      throw error;
    }
  }

  /** Invalidate the session server-side, not just in the browser. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Déconnexion' })
  async logout(
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
    @Body() body: { refreshToken?: string } = {},
  ) {
    await this.authService.logout(readCookie(req, REFRESH_COOKIE) || body?.refreshToken);
    clearSessionCookies(res);
    return { success: true };
  }

  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Récupérer le profil de l\'utilisateur connecté' })
  @ApiResponse({ status: 200, description: 'Profil utilisateur' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  async getProfile(@Request() req: AuthenticatedRequest) {
    return this.authService.validateUser(req.user.sub);
  }

  @Put('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mettre à jour le profil' })
  @ApiResponse({ status: 200, description: 'Profil mis à jour' })
  async updateProfile(
    @Request() req: AuthenticatedRequest,
    @Body() body: { firstName?: string; lastName?: string },
  ) {
    return this.authService.updateProfile(req.user.sub, body);
  }

  @Post('change-password')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Changer le mot de passe' })
  @ApiResponse({ status: 200, description: 'Mot de passe mis à jour' })
  @ApiResponse({ status: 401, description: 'Mot de passe incorrect' })
  async changePassword(
    @Request() req: AuthenticatedRequest,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    return this.authService.changePassword(req.user.sub, body);
  }
}
