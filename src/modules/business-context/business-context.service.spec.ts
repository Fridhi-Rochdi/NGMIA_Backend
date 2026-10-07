import { BusinessContextService } from './business-context.service';

/** Minimal Prisma stub: only what the service actually touches. */
function makePrisma(context: any) {
  return {
    businessContext: {
      findUnique: jest.fn().mockResolvedValue(context),
      upsert: jest.fn().mockImplementation(({ update }) =>
        Promise.resolve({ ...context, ...update }),
      ),
    },
    tenant: { findUnique: jest.fn().mockResolvedValue(null) },
    brand: { findFirst: jest.fn().mockResolvedValue(null) },
  } as any;
}

const CONTEXT = {
  businessName: 'Atelier Vermeer',
  businessType: 'SERVICES',
  industry: 'Menuiserie',
  description: 'Atelier de menuiserie sur mesure a Lyon',
  services: ['Escaliers', 'Bibliotheques'],
  targetAudience: 'Proprietaires renovant leur maison',
  tone: 'friendly',
  language: 'fr',
  currency: 'EUR',
  contactPhone: null,
  contactEmail: null,
  contactAddress: null,
  website: null,
};

describe('BusinessContextService.resolve', () => {
  const service = (context: any = CONTEXT) =>
    new BusinessContextService(makePrisma(context));

  it('fills every field the caller omitted', async () => {
    const out = await service().resolve('t1', { template: 'MODERN' } as any);

    expect(out.businessName).toBe('Atelier Vermeer');
    expect(out.businessType).toBe('SERVICES');
    expect(out.description).toBe('Atelier de menuiserie sur mesure a Lyon');
    expect(out.services).toEqual(['Escaliers', 'Bibliotheques']);
    expect(out.tone).toBe('friendly');
    // caller's own fields survive untouched
    expect((out as any).template).toBe('MODERN');
  });

  it('never overrides a value the caller supplied', async () => {
    const out = await service().resolve('t1', {
      businessName: 'Pop-up de Noel',
      tone: 'playful',
    } as any);

    expect(out.businessName).toBe('Pop-up de Noel');
    expect(out.tone).toBe('playful');
    // untouched fields still come from the context
    expect(out.industry).toBe('Menuiserie');
  });

  it('treats blank strings and empty arrays as "not supplied"', async () => {
    const out = await service().resolve('t1', {
      businessName: '   ',
      description: '',
      services: [],
    } as any);

    expect(out.businessName).toBe('Atelier Vermeer');
    expect(out.description).toBe('Atelier de menuiserie sur mesure a Lyon');
    expect(out.services).toEqual(['Escaliers', 'Bibliotheques']);
  });

  it('returns the input untouched when the tenant has no context yet', async () => {
    const out = await service(null).resolve('t1', { businessName: 'Solo' } as any);

    expect(out).toEqual({ businessName: 'Solo' });
  });

  it('keeps tenants isolated: resolve reads only its own tenantId', async () => {
    const prisma = makePrisma(CONTEXT);
    const svc = new BusinessContextService(prisma);
    await svc.resolve('tenant-A', {} as any);

    expect(prisma.businessContext.findUnique).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-A' },
    });
  });
});

describe('BusinessContextService.upsert', () => {
  it('merges a partial update over the stored context', async () => {
    const prisma = makePrisma(CONTEXT);
    const out = await new BusinessContextService(prisma).upsert('t1', {
      tone: 'luxury',
    });

    expect(out.tone).toBe('luxury');
    // everything the caller did not send is preserved
    expect(out.businessName).toBe('Atelier Vermeer');
    expect(out.services).toEqual(['Escaliers', 'Bibliotheques']);
  });
});

describe('BusinessContextService.get', () => {
  it('back-fills from the oldest brand for accounts predating the feature', async () => {
    const prisma = makePrisma(null);
    prisma.tenant.findUnique.mockResolvedValue({ name: 'Ancien Tenant' });
    prisma.brand.findFirst.mockResolvedValue({
      name: 'Ancienne Marque',
      industry: 'Restauration',
      description: 'Bistrot de quartier',
      targetAudience: 'Habitues',
      tone: 'casual',
    });

    const out = await new BusinessContextService(prisma).get('t1');

    expect(out.businessName).toBe('Ancienne Marque');
    expect(out.industry).toBe('Restauration');
    expect(out.tone).toBe('casual');
    expect(out.services).toEqual([]);
    // the oldest brand is the one that was created at signup
    expect(prisma.brand.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 't1' },
      orderBy: { createdAt: 'asc' },
    });
  });
});
