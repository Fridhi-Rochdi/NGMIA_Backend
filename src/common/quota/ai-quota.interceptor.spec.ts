import { HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';
import { AiQuotaInterceptor } from './ai-quota.interceptor';
import { SuperAdminGuard } from '../guards/super-admin.guard';

const ctx = (user: unknown) =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as never;

describe('AiQuotaInterceptor', () => {
  const reflector = {
    getAllAndOverride: () => ({ feature: 'website.generate', credits: 5 }),
  } as unknown as Reflector;

  it('reserves credits and keeps them when the generation succeeds', async () => {
    const quota = { reserve: jest.fn().mockResolvedValue('u1'), release: jest.fn() };
    const i = new AiQuotaInterceptor(reflector, quota as never);
    const out = i.intercept(ctx({ tenantId: 't1', sub: 'user' }), { handle: () => of('ok') });
    await expect(lastValueFrom(out)).resolves.toBe('ok');
    expect(quota.reserve).toHaveBeenCalledWith('t1', 'user', 'website.generate', 5);
    expect(quota.release).not.toHaveBeenCalled();
  });

  it('refunds when the generation fails', async () => {
    const quota = {
      reserve: jest.fn().mockResolvedValue('u1'),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const i = new AiQuotaInterceptor(reflector, quota as never);
    const boom = new Error('NIM 429');
    const out = i.intercept(ctx({ tenantId: 't1' }), { handle: () => throwError(() => boom) });
    await expect(lastValueFrom(out)).rejects.toBe(boom);
    expect(quota.release).toHaveBeenCalledWith('u1');
  });

  it('never runs the handler once the quota is exhausted', async () => {
    const quota = {
      reserve: jest.fn().mockRejectedValue(new HttpException('quota', 402)),
      release: jest.fn(),
    };
    const handle = jest.fn(() => of('ok'));
    const i = new AiQuotaInterceptor(reflector, quota as never);
    await expect(lastValueFrom(i.intercept(ctx({ tenantId: 't1' }), { handle }))).rejects.toMatchObject({
      status: 402,
    });
    expect(handle).not.toHaveBeenCalled();
  });

  it('ignores routes without @AiQuota', async () => {
    const quota = { reserve: jest.fn() };
    const i = new AiQuotaInterceptor({ getAllAndOverride: () => undefined } as never, quota as never);
    await expect(lastValueFrom(i.intercept(ctx(undefined), { handle: () => of(1) }))).resolves.toBe(1);
    expect(quota.reserve).not.toHaveBeenCalled();
  });
});

describe('SuperAdminGuard', () => {
  const guard = new SuperAdminGuard();

  it('lets a super-admin through', () => {
    expect(guard.canActivate(ctx({ isSuperAdmin: true, role: 'OWNER' }))).toBe(true);
  });

  it('refuses a tenant ADMIN', () => {
    expect(() => guard.canActivate(ctx({ isSuperAdmin: false, role: 'ADMIN' }))).toThrow();
  });
});
