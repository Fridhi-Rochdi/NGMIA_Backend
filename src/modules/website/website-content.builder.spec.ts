import { buildContent } from './website-content.builder';
import { WebsiteRendererService } from './website-renderer.service';
import { professionalRestaurantWebsiteData } from './website-demo-data';

describe('professional website content', () => {
  const buildInput = {
    ...professionalRestaurantWebsiteData,
    contact: professionalRestaurantWebsiteData.contactInfo,
  };

  it('builds a complete restaurant website from realistic business data', () => {
    const content = buildContent(buildInput, {
      meta: {
        title: 'Maison Safran | Cuisine mediterraneenne a Casablanca',
        description: 'Une table contemporaine inspiree par les produits marocains.',
      },
      sections: [
        {
          type: 'hero',
          data: {
            eyebrow: 'Restaurant gastronomique a Casablanca',
            title: 'La Mediterranee, servie avec precision',
            subtitle: 'Une cuisine de saison, locale et genereuse dans un cadre chaleureux.',
            ctaLabel: 'Reserver une table',
          },
        },
        {
          type: 'about',
          data: {
            title: 'Une cuisine de marche et de memoire',
            body: 'Nous travaillons avec des producteurs choisis pour raconter le Maroc contemporain dans chaque assiette.',
            stats: [
              { value: '12', label: 'producteurs partenaires' },
              { value: '6', label: 'temps au menu degustation' },
            ],
          },
        },
        {
          type: 'testimonials',
          data: {
            title: 'Ils reviennent pour le gout',
            items: [
              { quote: 'Une cuisine precise et genereuse, avec un service remarquable.', author: 'Nadia B.', role: 'Cliente reguliere' },
            ],
          },
        },
        {
          type: 'cta',
          data: {
            title: 'Votre prochaine belle table est ici',
            subtitle: 'Reservez votre experience Maison Safran.',
            buttonLabel: 'Nous contacter',
          },
        },
      ],
    });

    expect(content.meta.language).toBe('fr');
    expect(content.currency).toBe('MAD');
    expect(content.theme.template).toBe('classic');
    expect(content.theme.primaryColor).toBe('#173B2F');
    expect(content.contact.email).toBe('bonjour@maisonsafran.ma');
    expect(content.sections.map((section) => section.type)).toEqual([
      // No 'faq': the canned three-question FAQ this builder used to inject was
      // removed deliberately (it was filler, and doubled up on sites whose
      // blueprint already asked for one). A FAQ now only appears when the
      // model actually returns one.
      'hero', 'products', 'about', 'gallery', 'testimonials', 'cta', 'contact',
    ]);
    expect(content.sections.find((section) => section.type === 'products')?.data.items).toHaveLength(3);
    expect(content.sections.find((section) => section.type === 'gallery')?.data.images).toHaveLength(3);
    expect(content.sections.find((section) => section.type === 'products')?.data.items[0].imagePrompt).toContain('fine dining');
  });

  it('puts the owner products into the generated products section instead of adding a second one', () => {
    const content = buildContent(
      {
        businessName: 'Le Fournil de Lea',
        businessType: 'BAKERY',
        products: [{ name: 'Grand levain du samedi', price: '6,50', description: '' }],
      } as any,
      {
        sections: [
          { type: 'hero', data: { heading: 'Le levain du quartier' } },
          {
            type: 'products',
            data: {
              heading: 'Nos pains',
              items: [
                { name: 'Grand Levain du Samedi', description: 'Levain naturel, 48 heures de fermentation' },
                { name: 'Pain du samedi sur reservation', price: '6,50', description: 'Invente par le modele' },
              ],
            },
          },
        ],
      },
    );

    const products = content.sections.filter((s) => s.type === 'products');
    expect(products).toHaveLength(1);
    expect(products[0].data.heading).toBe('Nos pains');
    // Only the owner's product, at the owner's price, with the model's
    // description borrowed by matching name.
    expect(products[0].data.items).toEqual([
      expect.objectContaining({
        name: 'Grand levain du samedi',
        price: '6,50',
        description: 'Levain naturel, 48 heures de fermentation',
      }),
    ]);
  });

  it('renders a complete self-contained HTML document with the key business content', () => {
    const content = buildContent(buildInput, {
      meta: { title: 'Maison Safran', description: 'Cuisine mediterraneenne a Casablanca.' },
      sections: [],
    });
    const html = new WebsiteRendererService({} as never).render(content);

    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('<html lang="fr"');
    expect(html).toContain('Maison Safran');
    expect(html).toContain('bonjour@maisonsafran.ma');
    expect(html).toContain('Menu Degustation Safran');
    expect(html).toContain('MAD');
    expect(html).toContain('Questions fréquentes');
    expect(html).toContain('18 rue du Parc');
    expect(html).toContain('</html>');
  });
});