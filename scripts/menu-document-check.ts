/**
 * Layout checks for the visual menu document.
 *
 * These assert the things the user asked to never see again: a menu that is
 * only text, broken images, raw markup leaking through, or a price list
 * masquerading as a designed object. Run with `npm run test:menu`.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  MenuDocument,
  layoutForBusiness,
  renderMenuDocument,
} from '../src/modules/menu/menu-document';

let failures = 0;
function check(label: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function count(html: string, pattern: RegExp): number {
  return (html.match(pattern) || []).length;
}

const base: Omit<MenuDocument, 'layout' | 'template'> = {
  assetBaseUrl: 'https://api.example.test',
  businessName: 'Trattoria Nonna Lidia',
  tagline: 'Pates fraiches et pizzas au feu de bois, tous les jours',
  businessType: 'PIZZERIA',
  colors: { primary: '#17402b', secondary: '#2c2c2c', accent: '#b0472f' },
  logoUrl: '/uploads/t-demo/logo.webp',
  heroImageUrl: '/uploads/t-demo/hero.webp',
  qrCodeUrl: 'data:image/png;base64,iVBORw0KGgo=',
  contact: {
    phone: '01 42 00 00 00',
    address: '12 rue des Abbesses, Paris',
    hours: 'Mar-Dim 12h-14h30 / 19h-22h30',
  },
  cta: { label: 'Reserver une table' },
  categories: [
    {
      name: 'Antipasti',
      description: 'Pour commencer',
      items: [
        {
          name: 'Burrata des Pouilles',
          description: 'Burrata, tomates confites, huile de basilic, pain grille',
          price: '12,00 EUR',
          imageUrl: '/uploads/t-demo/burrata.webp',
          badges: ['Signature', 'Vegetarien'],
          featured: true,
        },
        {
          name: 'Vitello tonnato',
          description: 'Veau rose, sauce au thon, capres',
          price: '14,00 EUR',
          imageUrl: '/uploads/t-demo/vitello.webp',
        },
        { name: 'Olives Cerignola', description: 'Olives vertes, zeste de citron', price: '5,00 EUR' },
      ],
    },
    {
      name: 'Pizzas au feu de bois',
      items: [
        {
          name: 'Margherita',
          description: 'San Marzano, mozzarella di bufala, basilic',
          price: '13,00 EUR',
          imageUrl: '/uploads/t-demo/margherita.webp',
          badges: ['Signature'],
          featured: true,
        },
        {
          name: 'Diavola',
          description: 'Nduja de Calabre, mozzarella, miel de chataignier',
          price: '16,00 EUR',
          imageUrl: '/uploads/t-demo/diavola.webp',
          badges: ['Epice'],
        },
      ],
    },
  ],
};

console.log('\n1. SHOWCASE — la carte illustree');
{
  const html = renderMenuDocument({ ...base, layout: 'SHOWCASE', template: 'MODERN' });
  const photos = count(html, /<img[^>]+class="?[^>]*>|<img /g);
  check('le document contient de vraies balises <img>', photos >= 5, `${photos} trouvees`);
  check('une image hero est posee', html.includes('class="hero-img"'));
  check('le logo est present', html.includes('class="logo"'));
  check('les plats sont en cards', count(html, /class="card[ "]/g) >= 5);
  check('les badges sont rendus', html.includes('class="badge'));
  check('un badge Signature prend l accent', html.includes('badge--accent'));
  check('les icones de categorie sont rendues', count(html, /class="cat-icon"/g) === 2);
  check('un CTA existe', html.includes('class="cta'));
  check('le bloc QR est present', html.includes('class="qr"'));
  check('les coordonnees sont listees', html.includes('12 rue des Abbesses'));
  check('une feuille print A4 existe', html.includes('@page{size:A4'));
  check('aucun gradient decoratif', !/linear-gradient|radial-gradient/.test(html));
  check('les prix sont en chiffres tabulaires', html.includes('tabular-nums'));
  check('images en lazy load', count(html, /loading="lazy"/g) >= 4);
  // Without crossorigin the browser loads generated assets in no-CORS mode and
  // taints the canvas, so the PNG/JPG export throws SecurityError.
  check(
    'chaque image est chargee en mode CORS',
    count(html, /<img /g) === count(html, /<img crossorigin="anonymous"/g),
  );
  // A relative /uploads path resolves against the host page inside a sandboxed
  // srcDoc iframe, which broke every generated image on the public menu.
  check(
    'les chemins d upload sont absolus',
    html.includes('https://api.example.test/uploads/') && !/src="\/uploads\//.test(html),
  );
}

console.log('\n2. EDITORIAL — plat signature + liste');
{
  const html = renderMenuDocument({ ...base, layout: 'EDITORIAL', template: 'ELEGANT' });
  check('le plat signature a son bloc', count(html, /class="feature"/g) === 2);
  check('les autres plats gardent des pointilles', html.includes('class="leader"'));
  check('les vignettes sont posees', html.includes('item-photo'));
  check('la typo ELEGANT est chargee', html.includes('Cormorant+Garamond'));
}

console.log('\n3. BOARD — ardoise compacte');
{
  const html = renderMenuDocument({ ...base, layout: 'BOARD', template: 'RUSTIC' });
  check('la grille ardoise est utilisee', /class="board[ "]/.test(html));
  // A category mixing photographed and bare items must keep one text column.
  check('la colonne texte est alignee malgre les items sans photo', html.includes('board--aligned'));
  check('la typo RUSTIC est chargee', html.includes('Bitter'));
}

console.log('\n4. Robustesse');
{
  // No images at all: must still be a designed document, never a broken <img>.
  const bare = renderMenuDocument({
    ...base,
    layout: 'SHOWCASE',
    template: 'MODERN',
    logoUrl: null,
    heroImageUrl: null,
    qrCodeUrl: null,
    categories: base.categories.map((c) => ({
      ...c,
      items: c.items.map((i) => ({ ...i, imageUrl: null })),
    })),
  });
  check('aucune image cassee quand rien n a pu etre genere', !/<img[^>]+src=""/.test(bare));
  check('aucun src indefini', !bare.includes('src="undefined') && !bare.includes('src="null'));
  check('la mise en page tient sans photo', bare.includes('card--nophoto'));

  // Injection through AI-authored fields.
  const hostile = renderMenuDocument({
    ...base,
    layout: 'SHOWCASE',
    template: 'MODERN',
    categories: [
      {
        name: '<script>alert(1)</script>',
        items: [
          {
            name: 'Pizza "quatre" <b>fromages</b>',
            description: '<img src=x onerror=alert(1)>',
            price: '1 & 2',
            imageUrl: 'javascript:alert(1)',
            badges: ['<svg onload=alert(1)>'],
          },
        ],
      },
    ],
  });
  check('le script est echappe', !hostile.includes('<script>alert'));
  // The payload survives as inert text; what matters is that no element is
  // created from it — every <img> in the output must be one we emitted.
  check(
    'le payload <img onerror> ne cree aucun element',
    hostile.includes('&lt;img src=x onerror=alert(1)&gt;') &&
      count(hostile, /<img /g) === count(hostile, /<img [^>]*(class="hero-img"|class="logo"|loading="lazy"|alt="QR)/g),
  );
  check('une url javascript: est rejetee', !hostile.includes('javascript:alert'));
  check('un badge hors registre est ignore', !hostile.includes('<svg onload'));
  check('l esperluette est echappee', hostile.includes('1 &amp; 2'));

  // Empty categories must not produce empty headings.
  const sparse = renderMenuDocument({
    ...base,
    layout: 'EDITORIAL',
    template: 'MODERN',
    categories: [
      { name: 'Vide', items: [] },
      { name: 'Plats', items: [{ name: 'Risotto', price: '18,00 EUR' }] },
    ],
  });
  check('les categories vides sont retirees', !sparse.includes('>Vide<'));
  check('la categorie remplie est gardee', sparse.includes('Risotto'));
}

console.log('\n5. Choix de mise en page par metier');
{
  check('pizzeria -> SHOWCASE', layoutForBusiness('PIZZERIA') === 'SHOWCASE');
  check('fast food -> SHOWCASE', layoutForBusiness('FAST_FOOD') === 'SHOWCASE');
  check('cafe -> BOARD', layoutForBusiness('CAFE') === 'BOARD');
  check('bar -> BOARD', layoutForBusiness('BAR') === 'BOARD');
  check('restaurant -> EDITORIAL', layoutForBusiness('RESTAURANT') === 'EDITORIAL');
  check('inconnu -> EDITORIAL', layoutForBusiness(undefined) === 'EDITORIAL');
}

console.log('\n6. Poids du document');
{
  const html = renderMenuDocument({ ...base, layout: 'SHOWCASE', template: 'MODERN' });
  const kb = Buffer.byteLength(html, 'utf8') / 1024;
  check(`le HTML reste leger (${kb.toFixed(1)} Ko)`, kb < 40);
  check('aucune image base64 inline', !/data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]{500}/.test(html));
}

// Write the three layouts out so they can be opened and looked at.
const out = join(process.cwd(), 'storage', 'preview');
mkdirSync(out, { recursive: true });
for (const [layout, template] of [
  ['SHOWCASE', 'MODERN'],
  ['EDITORIAL', 'ELEGANT'],
  ['BOARD', 'RUSTIC'],
] as const) {
  writeFileSync(
    join(out, `menu-${layout.toLowerCase()}.html`),
    renderMenuDocument({ ...base, layout, template }),
    'utf8',
  );
}
console.log(`\nApercus ecrits dans ${out}`);

console.log(failures ? `\n${failures} verification(s) en echec\n` : '\nToutes les verifications passent\n');
process.exit(failures ? 1 : 0);
