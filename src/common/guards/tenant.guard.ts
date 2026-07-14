import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Plan } from '@prisma/client';

export const MINIMUM_PLAN_KEY = 'minimumPlan';

export const RequirePlan = (plan: Plan) => {
  return (target: any, key?: string, descriptor?: any) => {
    Reflect.defineMetadata(MINIMUM_PLAN_KEY, plan, descriptor?.value || target);
    return descriptor || target;
  };
};

const PLAN_HIERARCHY: Record<Plan, number> = {
  FREE: 0,
  STARTER: 1,
  PRO: 2,
  ENTERPRISE: 3,
};

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const tenant = request.tenant;

    if (!tenant) {
      throw new ForbiddenException('Tenant requis pour accéder à cette ressource');
    }

    // Check plan requirements
    const requiredPlan = this.reflector.get<Plan>(
      MINIMUM_PLAN_KEY,
      context.getHandler(),
    );

    if (requiredPlan) {
      const tenantPlanLevel = PLAN_HIERARCHY[tenant.plan as Plan] || 0;
      const requiredPlanLevel = PLAN_HIERARCHY[requiredPlan] || 0;

      if (tenantPlanLevel < requiredPlanLevel) {
        throw new ForbiddenException(
          `Votre plan (${tenant.plan}) ne permet pas d'accéder à cette fonctionnalité. Plan minimum requis: ${requiredPlan}`,
        );
      }
    }

    return true;
  }
}