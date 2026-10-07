import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * Platform operators only (the /admin console, the plan catalogue).
 *
 * Reads `isSuperAdmin`, which JwtStrategy loads from the database on every
 * request — so revoking the flag takes effect immediately, and a tenant-level
 * ADMIN role grants nothing here.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (user?.isSuperAdmin !== true) {
      throw new ForbiddenException("Réservé à l'administration de la plateforme.");
    }
    return true;
  }
}
