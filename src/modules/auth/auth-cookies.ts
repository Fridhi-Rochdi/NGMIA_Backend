import type { Response, Request } from 'express';

/**
 * Where the session actually lives.
 *
 * Three cookies, with deliberately different properties:
 *
 * - `refresh_token` — HttpOnly. The only long-lived secret. JavaScript can
 *   never read it, so an XSS cannot steal the session. Scoped to /auth so it
 *   is not attached to every API call.
 * - `access_token`  — HttpOnly, short-lived. Lets a page load authenticate
 *   before any JavaScript has run, which is what removes the race where the
 *   client checked the user before the token was restored.
 * - `authed`        — readable by JavaScript and by the Next.js middleware,
 *   and containing NO secret: just the epoch at which the session stops being
 *   valid. Route gating needs to know "is there a session", not the token.
 *
 * SameSite=Lax rather than Strict: Strict withholds the cookie on any
 * cross-site navigation, so arriving from an email link or an external page
 * looked exactly like being logged out.
 */

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
export const SESSION_FLAG_COOKIE = 'authed';

/** The refresh cookie is only sent to the endpoints that need it. */
export const REFRESH_COOKIE_PATH = '/auth';

function isSecure(): boolean {
  // Secure cookies are dropped by browsers over plain http, which would break
  // local development; opt in explicitly, defaulting to on in production.
  if (process.env.COOKIE_SECURE) return process.env.COOKIE_SECURE === 'true';
  return process.env.NODE_ENV === 'production';
}

function sameSite(): 'lax' | 'strict' | 'none' {
  const configured = String(process.env.COOKIE_SAMESITE || '').toLowerCase();
  if (configured === 'lax' || configured === 'strict' || configured === 'none') {
    return configured;
  }
  // 'none' requires Secure; only sensible when the API is on another origin.
  return 'lax';
}

function domain(): string | undefined {
  return process.env.COOKIE_DOMAIN || undefined;
}

export function setSessionCookies(
  res: Response,
  tokens: { accessToken: string; accessMaxAgeSeconds: number; refreshToken: string; refreshMaxAgeSeconds: number },
): void {
  const common = { secure: isSecure(), sameSite: sameSite(), domain: domain() } as const;

  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...common,
    httpOnly: true,
    path: '/',
    maxAge: tokens.accessMaxAgeSeconds * 1000,
  });

  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...common,
    httpOnly: true,
    path: REFRESH_COOKIE_PATH,
    maxAge: tokens.refreshMaxAgeSeconds * 1000,
  });

  // No secret here on purpose: it exists so the frontend middleware can gate
  // routes without being handed a token it has no business reading.
  res.cookie(
    SESSION_FLAG_COOKIE,
    String(Date.now() + tokens.refreshMaxAgeSeconds * 1000),
    {
      ...common,
      httpOnly: false,
      path: '/',
      maxAge: tokens.refreshMaxAgeSeconds * 1000,
    },
  );
}

export function clearSessionCookies(res: Response): void {
  const common = { secure: isSecure(), sameSite: sameSite(), domain: domain() } as const;
  res.clearCookie(ACCESS_COOKIE, { ...common, httpOnly: true, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...common, httpOnly: true, path: REFRESH_COOKIE_PATH });
  res.clearCookie(SESSION_FLAG_COOKIE, { ...common, httpOnly: false, path: '/' });
}

export function readCookie(req: Request, name: string): string | undefined {
  const fromParser = (req as any).cookies?.[name];
  if (fromParser) return fromParser;

  // cookie-parser may not be mounted; parse the header rather than fail.
  const header = req.headers?.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

/** Client address for audit fields, honouring the trusted proxy setting. */
export function clientIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || undefined;
}
