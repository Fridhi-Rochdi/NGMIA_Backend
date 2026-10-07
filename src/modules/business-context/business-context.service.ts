import { Injectable, Logger } from '@nestjs/common';
import { BusinessContext, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateBusinessContextDto } from './business-context.dto';

/**
 * The tenant's business profile: one record per tenant, created at signup.
 *
 * Generation modules call `resolve()` to fill in whatever the caller left out,
 * so a user never re-types their business name, sector or tone in a form.
 */
@Injectable()
export class BusinessContextService {
  private readonly logger = new Logger(BusinessContextService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The tenant's context, or null when none exists (accounts created before
   * this feature shipped). Callers must tolerate null.
   */
  async find(tenantId: string): Promise<BusinessContext | null> {
    return this.prisma.businessContext.findUnique({ where: { tenantId } });
  }

  /**
   * The context for API consumers. Back-fills from the tenant + its oldest brand
   * for accounts that pre-date this feature, so the settings screen is never
   * empty and the user only has to confirm.
   */
  async get(tenantId: string) {
    const existing = await this.find(tenantId);
    if (existing) return this.toResponse(existing);

    const [tenant, brand] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId } }),
      this.prisma.brand.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return this.toResponse({
      businessName: brand?.name || tenant?.name || '',
      businessType: 'OTHER',
      industry: brand?.industry ?? null,
      description: brand?.description ?? '',
      services: [],
      targetAudience: brand?.targetAudience ?? null,
      tone: brand?.tone || 'professional',
      language: 'fr',
      currency: 'EUR',
      contactPhone: null,
      contactEmail: null,
      contactAddress: null,
      website: null,
    } as BusinessContext);
  }

  /** Create the context at signup. */
  async create(
    tenantId: string,
    data: Omit<Prisma.BusinessContextCreateInput, 'tenant'>,
    tx?: Prisma.TransactionClient,
  ): Promise<BusinessContext> {
    const client = tx ?? this.prisma;
    return client.businessContext.create({
      data: { ...data, tenant: { connect: { id: tenantId } } },
    });
  }

  /** Create-or-update, so pre-existing accounts get a context on first save. */
  async upsert(tenantId: string, dto: UpdateBusinessContextDto) {
    const current = await this.get(tenantId);
    const merged = {
      businessName: dto.businessName ?? current.businessName,
      businessType: dto.businessType ?? current.businessType,
      industry: dto.industry ?? current.industry,
      description: dto.description ?? current.description,
      services: dto.services ?? current.services,
      targetAudience: dto.targetAudience ?? current.targetAudience,
      tone: dto.tone ?? current.tone,
      language: dto.language ?? current.language,
      currency: dto.currency ?? current.currency,
      contactPhone: dto.contactPhone ?? current.contactPhone,
      contactEmail: dto.contactEmail ?? current.contactEmail,
      contactAddress: dto.contactAddress ?? current.contactAddress,
      website: dto.website ?? current.website,
    };

    const saved = await this.prisma.businessContext.upsert({
      where: { tenantId },
      create: { ...merged, tenant: { connect: { id: tenantId } } },
      update: merged,
    });

    this.logger.log(`Business context saved for tenant ${tenantId}`);
    return this.toResponse(saved);
  }

  /**
   * Merge caller-supplied values over the tenant's context.
   *
   * Explicit input always wins; the context only fills the gaps. A blank string
   * counts as "not supplied" so an untouched form field does not erase a value
   * the user already gave us at signup.
   */
  async resolve<T extends Record<string, any>>(
    tenantId: string,
    input: T,
  ): Promise<T & Partial<BusinessContextDefaults>> {
    const context = await this.find(tenantId);
    if (!context) return input;

    const defaults: BusinessContextDefaults = {
      businessName: context.businessName,
      businessType: context.businessType,
      industry: context.industry ?? undefined,
      description: context.description,
      services: context.services,
      targetAudience: context.targetAudience ?? undefined,
      tone: context.tone,
      language: context.language,
      currency: context.currency,
    };

    const merged: Record<string, any> = { ...input };
    for (const [key, fallback] of Object.entries(defaults)) {
      if (fallback === undefined || fallback === null) continue;
      const supplied = merged[key];
      const isEmpty =
        supplied === undefined ||
        supplied === null ||
        (typeof supplied === 'string' && supplied.trim() === '') ||
        (Array.isArray(supplied) && supplied.length === 0);
      if (isEmpty) merged[key] = fallback;
    }
    return merged as T & Partial<BusinessContextDefaults>;
  }

  private toResponse(c: BusinessContext) {
    return {
      businessName: c.businessName,
      businessType: c.businessType,
      industry: c.industry,
      description: c.description,
      services: c.services ?? [],
      targetAudience: c.targetAudience,
      tone: c.tone,
      language: c.language,
      currency: c.currency,
      contactPhone: c.contactPhone,
      contactEmail: c.contactEmail,
      contactAddress: c.contactAddress,
      website: c.website,
    };
  }
}

export interface BusinessContextDefaults {
  businessName: string;
  businessType: string;
  industry?: string;
  description: string;
  services: string[];
  targetAudience?: string;
  tone: string;
  language: string;
  currency: string;
}
