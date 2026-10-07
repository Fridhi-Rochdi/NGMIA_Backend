import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { buildContent } from './website-content.builder';
import { WebsiteRendererService } from './website-renderer.service';
import { GenerateWebsiteDto } from './website.dto';
import { professionalRestaurantWebsiteData } from './website-demo-data';

const PAYLOAD = 'red}</style><script>alert(document.cookie)</script><style>';

function errorsFor(body: unknown): string[] {
  const dto = plainToInstance(GenerateWebsiteDto, body);
  const flatten = (errs: any[], prefix = ''): string[] =>
    errs.flatMap((e) => [
      ...(e.constraints ? [`${prefix}${e.property}`] : []),
      ...flatten(e.children ?? [], `${prefix}${e.property}.`),
    ]);
  return flatten(validateSync(dto, { whitelist: true }));
}

describe('POST /websites/generate validation', () => {
  it('refuses a colour that would break out of the stylesheet', () => {
    expect(errorsFor({ colors: { primary: PAYLOAD } })).toContain('colors.primary');
  });

  it('refuses javascript: links', () => {
    expect(errorsFor({ contactInfo: { googleReviewUrl: 'javascript:alert(1)' } })).toContain(
      'contactInfo.googleReviewUrl',
    );
  });

  it('accepts what the form really sends: hex colours and blank fields', () => {
    expect(
      errorsFor({
        businessName: 'Maison Safran',
        colors: { primary: '#3b82f6', secondary: '#1E3A8A', accent: '#22c55e' },
        contactInfo: {
          phone: '',
          email: '',
          googleReviewUrl: '',
          googleMapsUrl: 'https://maps.app.goo.gl/abc',
        },
        logoUrl: '',
      }),
    ).toEqual([]);
  });
});

describe('website renderer hardening', () => {
  const render = (theme: Record<string, unknown>, contact: Record<string, unknown>) => {
    const content = buildContent(
      {
        ...professionalRestaurantWebsiteData,
        contact: { ...professionalRestaurantWebsiteData.contactInfo, ...contact },
      },
      { meta: { title: 'T', description: 'D' }, sections: [] },
    );
    Object.assign(content.theme, theme);
    content.sections.push({
      id: 'x"><script>1</script>',
      type: 'custom',
      visible: true,
      data: { heading: 'H', items: [] },
    } as never);
    return new WebsiteRendererService({} as never).render(content);
  };

  it('never emits attacker markup from theme, contact or section ids', () => {
    const html = render(
      { primaryColor: PAYLOAD, fontFamily: "Inter'</style><script>x</script>" },
      { googleReviewUrl: 'javascript:alert(1)', phone: '"><img src=x onerror=alert(1)>' },
    );
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<script>x');
    expect(html).not.toContain('<script>1');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('--primary:#3b82f6;');
  });

  it('keeps legitimate values', () => {
    const html = render(
      { primaryColor: '#ff0000', fontFamily: 'Playfair Display' },
      { googleReviewUrl: 'https://g.page/r/abc' },
    );
    expect(html).toContain('--primary:#ff0000;');
    expect(html).toContain("font-family:'Playfair Display'");
    expect(html).toContain('href="https://g.page/r/abc"');
  });
});
