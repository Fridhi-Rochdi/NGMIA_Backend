/**
 * Shape of an authenticated Express request in this app.
 *
 * - `user`   is set by JwtStrategy.validate() (JwtAuthGuard).
 * - `tenant` is set by TenantMiddleware and enforced by TenantGuard, so it is
 *   guaranteed to be present on any route guarded by TenantGuard.
 */
export interface AuthenticatedUser {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
  isSuperAdmin: boolean;
}

export interface RequestTenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

export interface AuthenticatedRequest {
  user: AuthenticatedUser;
  tenant?: RequestTenant;
  protocol?: string;
  get?: (header: string) => string | undefined;
}
