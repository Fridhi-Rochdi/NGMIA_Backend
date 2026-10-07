import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, Observable, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { AI_QUOTA_KEY, AiQuotaSpec } from './ai-quota.decorator';
import { AiQuotaService } from './ai-quota.service';

/**
 * Spends quota for routes marked @AiQuota(...).
 *
 * Credits are reserved *before* the handler runs (so concurrent requests are
 * counted) and refunded if the handler throws — a failed generation costs the
 * customer nothing.
 */
@Injectable()
export class AiQuotaInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly quota: AiQuotaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const spec = this.reflector.getAllAndOverride<AiQuotaSpec | undefined>(AI_QUOTA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!spec) return next.handle();

    const { user, body } = context.switchToHttp().getRequest();
    // The tenant comes from the verified token, never from a header.
    if (!user?.tenantId) throw new UnauthorizedException();

    const credits = spec.credits + (spec.imageCredits && body?.generateImage === true ? spec.imageCredits : 0);
    return from(this.quota.reserve(user.tenantId, user.sub, spec.feature, credits)).pipe(
      mergeMap((usageId) =>
        next.handle().pipe(
          catchError((err) =>
            from(this.quota.release(usageId).catch(() => undefined)).pipe(
              mergeMap(() => throwError(() => err)),
            ),
          ),
        ),
      ),
    );
  }
}
