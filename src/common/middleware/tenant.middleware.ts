import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../common/prisma/prisma.service';

// Extend Express Request to include tenant
declare global {
  namespace Express {
    interface Request {
      tenant?: {
        id: string;
        name: string;
        slug: string;
        plan: string;
      };
    }
  }
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Skip tenant resolution for auth routes
    if (req.path.startsWith('/auth')) {
      return next();
    }

    // 1. Try to resolve tenant from X-Tenant-Slug header (primary method used by frontend)
    const headerSlug = req.headers['x-tenant-slug'] as string | undefined;

    // 2. Try to resolve from subdomain as a fallback
    const host = req.headers.host || '';
    const parts = host.split('.');
    const subdomainSlug =
      parts.length > 1 && parts[0] !== 'localhost' && parts[0] !== 'api' && parts[0] !== 'www'
        ? parts[0]
        : null;

    const tenantSlug = headerSlug || subdomainSlug;

    if (tenantSlug) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug: tenantSlug, isActive: true },
      });

      if (tenant) {
        req.tenant = {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          plan: tenant.plan,
        };
      }
    }

    // Note: We do NOT throw here if no tenant is found.
    // The middleware runs BEFORE the JwtAuthGuard, so req.user is not yet available.
    // Tenant enforcement for protected routes is handled by TenantGuard, which
    // runs AFTER JwtAuthGuard has validated the JWT and set req.user.
    next();
  }
}