import { Injectable, NestMiddleware, BadRequestException } from '@nestjs/common';
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

    // Try to resolve tenant from subdomain
    const host = req.headers.host || '';
    const subdomain = host.split('.')[0];

    // Try to resolve tenant from X-Tenant-Slug header
    const tenantSlug = req.headers['x-tenant-slug'] as string || subdomain;

    if (tenantSlug && tenantSlug !== 'localhost' && tenantSlug !== 'api') {
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

    // If user is authenticated, use their tenant
    if (!req.tenant && (req as any).user?.tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: (req as any).user.tenantId, isActive: true },
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

    // For protected routes, tenant is required
    const publicPaths = ['/auth/login', '/auth/register', '/api/docs', '/api', '/', '/health'];
    const isPublicPath = publicPaths.some(p => req.path === p || req.path.startsWith(p));

    if (!req.tenant && !isPublicPath) {
      throw new BadRequestException('Tenant non trouvé. Utilisez le header X-Tenant-Slug.');
    }

    next();
  }
}