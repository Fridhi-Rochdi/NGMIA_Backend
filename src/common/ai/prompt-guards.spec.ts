import { renderBrandContext, resolveBrandContext } from './brand-context';
import { AiEngineService } from '../../modules/ai-engine/ai-engine.service';
import { MenuService } from '../../modules/menu/menu.service';
import { BrandKit } from '../brand-kit/brand-kit.service';

const kit: BrandKit = {
  brandId: 'b1',
  name: 'Le Fournil de Lea',
  logoUrl: null,
  colors: { primary: '#2B2118', secondary: '#F4EDE3', accent: '#B5622E' },
  fonts: { heading: 'Fraunces', body: 'Inter' },
  tagline: 'Le levain du quartier, cuit chaque matin',
  tone: 'chaleureux',
  style: 'RUSTIC',
  industry: 'Boulangerie',
  targetAudience: 'Habitants du quartier',
  business: {
    businessType: 'BAKERY',
    description: 'Boulangerie au levain naturel.',
    services: ['Pain au levain', 'Viennoiseries'],
    language: 'fr',
    currency: 'EUR',
    contactPhone: null,
    contactEmail: null,
    contactAddress: '3 rue des Tanneurs',
    website: null,
  },
  platform: {
    mission: null,
    vision: null,
    personality: 'artisane, patiente, franche',
    messagingAngle: 'Un pain qui fermente 48 heures.',
    voice: null,
    logoConcept: null,
  },
};

describe('brand context', () => {
  it('carries the fields every generator used to lose', () => {
    const block = renderBrandContext(resolveBrandContext(kit));
    expect(block).toContain('Offer (use these exact names): Pain au levain, Viennoiseries');
    expect(block).toContain('Audience: Habitants du quartier');
    expect(block).toContain('Tagline (reuse verbatim when a tagline fits): Le levain du quartier');
    expect(block).toContain('Brand promise: Un pain qui fermente 48 heures.');
    expect(block).toContain('Language: French');
  });

  it('omits unknown fields instead of inviting the model to fill them', () => {
    const block = renderBrandContext(resolveBrandContext(null, { businessName: 'Solo' }));
    expect(block).not.toMatch(/not specified|Audience:|Offer/);
  });

  it('lets explicit input win over the kit', () => {
    const ctx = resolveBrandContext(kit, { tone: 'professionnel', language: 'en' });
    expect(ctx.tone).toBe('professionnel');
    expect(ctx.language).toBe('en');
  });

  it('keeps contacts out unless asked', () => {
    const ctx = resolveBrandContext(kit);
    expect(renderBrandContext(ctx)).not.toContain('Tanneurs');
    expect(renderBrandContext(ctx, { includeContacts: true })).toContain('3 rue des Tanneurs');
  });
});

describe('website copy guards', () => {
  const engine = () => {
    const svc = new AiEngineService();
    jest.spyOn(svc, 'generateText').mockResolvedValue(
      JSON.stringify({
        language: 'fr',
        sections: [
          {
            role: 'reviews',
            type: 'testimonials',
            data: { heading: 'Avis', items: [{ quote: 'Super pain', author: 'Marie L.' }] },
          },
          {
            role: 'offer',
            type: 'products',
            data: {
              heading: 'Pains',
              items: [
                { name: 'Grand levain', price: '6,50 €' },
                { name: 'Seigle', price: '4,90 €' },
              ],
            },
          },
        ],
      }),
    );
    return svc;
  };

  it('never shows a review the owner did not give', async () => {
    const out = await engine().generateWebsiteContentJson({
      businessName: 'Le Fournil',
      blueprint: [
        { type: 'testimonials', role: 'reviews' },
        { type: 'products', role: 'offer' },
      ],
    });
    expect(out.sections[0].data.items).toEqual([]);
  });

  it('shows the owner reviews verbatim', async () => {
    const real = [{ quote: 'Le meilleur levain du quartier.', author: 'Paul' }];
    const out = await engine().generateWebsiteContentJson({
      businessName: 'Le Fournil',
      testimonials: real,
      blueprint: [{ type: 'testimonials', role: 'reviews' }],
    });
    expect(out.sections[0].data.items).toEqual(real);
  });

  it('keeps only prices the owner set', async () => {
    const out = await engine().generateWebsiteContentJson({
      businessName: 'Le Fournil',
      products: [{ name: 'Grand levain', price: '6,50 €' }],
      blueprint: [
        { type: 'testimonials', role: 'reviews' },
        { type: 'products', role: 'offer' },
      ],
    });
    const items = out.sections[1].data.items;
    expect(items[0].price).toBe('6,50 €');
    expect(items[1]).not.toHaveProperty('price');
  });

  it("never lets a product borrow another product's price", async () => {
    // Seen live: "Pain du samedi" showed the 6,50 set for "Grand levain du samedi".
    const svc = new AiEngineService();
    jest.spyOn(svc, 'generateText').mockResolvedValue(
      JSON.stringify({
        sections: [
          {
            role: 'offer',
            type: 'products',
            data: {
              heading: 'Pains',
              items: [
                { name: 'Grand Levain du samedi', price: '6,50' },
                { name: 'Pain du samedi sur reservation', price: '6,50' },
              ],
            },
          },
        ],
      }),
    );
    const out = await svc.generateWebsiteContentJson({
      businessName: 'Le Fournil',
      products: [{ name: 'Grand levain du samedi', price: '6,50' }],
      blueprint: [{ type: 'products', role: 'offer' }],
    });
    const [owned, borrowed] = out.sections[0].data.items;
    expect(owned.price).toBe('6,50');
    expect(borrowed).not.toHaveProperty('price');
  });
});

describe('menu guards', () => {
  const menu = () => {
    const svc: any = new MenuService(
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
    );
    return svc;
  };

  it('keeps the owner dishes and prices, whatever the model returns', () => {
    const owner = [
      { name: 'Pains', items: [{ name: 'Grand levain', price: '6,50 €' }] },
    ];
    const generated = [
      {
        name: 'Pains',
        items: [
          { name: 'Grand Levain', description: 'Farine T80, levain naturel', price: '9 €', featured: true },
          { name: 'Baguette tradition', description: 'Invente', price: '1,40 €' },
        ],
      },
      { name: 'Desserts', items: [{ name: 'Tarte', price: '5 €' }] },
    ];
    const out = menu().mergeOwnerMenu(owner, generated);
    expect(out).toHaveLength(1);
    expect(out[0].items).toHaveLength(1);
    expect(out[0].items[0]).toMatchObject({
      name: 'Grand levain',
      price: '6,50 €',
      description: 'Farine T80, levain naturel',
      featured: true,
    });
  });

  it('keeps the draft flag on proposed dishes', () => {
    const out = menu().normaliseCategories([
      { name: 'Pains', items: [{ name: 'Pain de seigle', price: '', draft: true }] },
    ]);
    expect(out[0].items[0]).toMatchObject({ price: '', draft: true });
  });
});

describe('voice filter', () => {
  const { voiceViolations } = jest.requireActual('./prompt-rules');

  it('finds banned phrases across accents, case and endings', () => {
    expect(voiceViolations('Un pain SAVOUREUX, à ne pas manquer !')).toEqual(
      expect.arrayContaining(['savoureux', 'à ne pas manquer', '!']),
    );
    expect(voiceViolations('Des tartes savoureuses')).toContain('savoureux');
  });

  it('does not flag words that merely start the same', () => {
    expect(voiceViolations('Uniquement le samedi, pain fermenté 48 heures.')).toEqual([]);
  });

  it('flags the pressure phrases seen in live content', () => {
    expect(voiceViolations("N'attendez plus pour profiter de ce moment.")).toContain("n'attendez plus");
    expect(voiceViolations('Nos Délices au Levain')).toContain('délice');
  });

  it('keeps the edit only when it removes violations and keeps the hashtags', async () => {
    const svc = new AiEngineService();
    const spy = jest.spyOn(svc, 'generateText');

    spy.mockResolvedValueOnce('Un pain fermenté 48 heures. #levain');
    expect(await svc.enforceVoice('Un pain savoureux ! #levain', 'fr')).toBe(
      'Un pain fermenté 48 heures. #levain',
    );

    // Lost hashtag: the original stands.
    spy.mockReset();
    spy.mockResolvedValue('Un pain fermenté 48 heures.');
    expect(await svc.enforceVoice('Un pain savoureux ! #levain', 'fr')).toBe('Un pain savoureux ! #levain');

    // Clean text: no call at all.
    spy.mockReset();
    expect(await svc.enforceVoice('Un pain fermenté 48 heures.', 'fr')).toBe('Un pain fermenté 48 heures.');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('menu publication guard', () => {
  it('refuses to publish a menu with unconfirmed AI dishes', async () => {
    const svc: any = new MenuService(
      null as any, null as any, null as any, null as any,
      null as any, null as any, null as any, null as any,
    );
    svc.getMenuById = async () => ({
      categories: [{ name: 'Pains', items: [{ name: 'Seigle', price: '', draft: true }] }],
    });
    await expect(svc.publishMenu('m1', 't1')).rejects.toThrow(/Seigle/);
  });
});
