/**
 * Builds the three menu layouts using whatever real images are sitting in
 * storage/uploads/smoke, and writes them where the static server can serve
 * them, so the result can be looked at rather than reasoned about.
 *
 *   npx ts-node scripts/menu-preview.ts
 *   -> http://localhost:3001/uploads/preview/menu-showcase.html
 */
import { readdirSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { MenuDocument, renderMenuDocument } from '../src/modules/menu/menu-document';

const uploads = join(process.cwd(), 'storage', 'uploads');
const shots = readdirSync(join(uploads, 'smoke'))
  .filter((f) => f.endsWith('.webp'))
  .map((f) => `/uploads/smoke/${f}`);

if (shots.length < 3) {
  console.error('Lance d abord scripts/visual-smoke.ts pour produire des visuels.');
  process.exit(1);
}
const [hero, ...dishes] = shots;
const pick = (i: number) => dishes[i % dishes.length];

const doc: Omit<MenuDocument, 'layout' | 'template'> = {
  businessName: 'Trattoria Nonna Lidia',
  tagline: 'Pates fraiches et pizzas au feu de bois, tous les jours',
  businessType: 'PIZZERIA',
  colors: { primary: '#17402b', secondary: '#2c2c2c', accent: '#b0472f' },
  heroImageUrl: hero,
  qrCodeUrl: null,
  contact: {
    phone: '01 42 00 00 00',
    address: '12 rue des Abbesses, Paris',
    hours: 'Mar-Dim 12h-14h30 / 19h-22h30',
  },
  cta: { label: 'Reserver une table' },
  categories: [
    {
      name: 'Antipasti',
      description: 'Pour commencer, a partager',
      items: [
        {
          name: 'Burrata des Pouilles',
          description: 'Burrata, tomates confites, huile de basilic, pain grille',
          price: '12,00 EUR',
          imageUrl: pick(0),
          badges: ['Signature', 'Vegetarien'],
          featured: true,
        },
        {
          name: 'Vitello tonnato',
          description: 'Veau rose, sauce au thon, capres, roquette',
          price: '14,00 EUR',
          imageUrl: pick(1),
        },
        {
          name: 'Olives Cerignola',
          description: 'Olives vertes de Cerignola, zeste de citron',
          price: '5,00 EUR',
        },
      ],
    },
    {
      name: 'Pizzas au feu de bois',
      description: 'Pate maturee 48 heures, cuisson 90 secondes',
      items: [
        {
          name: 'Margherita',
          description: 'San Marzano, mozzarella di bufala, basilic frais',
          price: '13,00 EUR',
          imageUrl: pick(1),
          badges: ['Signature'],
          featured: true,
        },
        {
          name: 'Diavola',
          description: 'Nduja de Calabre, mozzarella, miel de chataignier',
          price: '16,00 EUR',
          imageUrl: pick(0),
          badges: ['Epice'],
        },
        {
          name: 'Ortolana',
          description: 'Courgettes, aubergines, poivrons grilles, stracciatella',
          price: '15,00 EUR',
          badges: ['Vegetarien'],
        },
        {
          name: 'Quattro formaggi',
          description: 'Mozzarella, gorgonzola, pecorino, parmesan',
          price: '17,00 EUR',
        },
      ],
    },
    {
      name: 'Dolci',
      items: [
        { name: 'Tiramisu', description: 'Mascarpone, cafe, cacao amer', price: '8,00 EUR', featured: true, imageUrl: pick(0) },
        { name: 'Panna cotta', description: 'Creme vanillee, coulis de fruits rouges', price: '7,00 EUR' },
        { name: 'Affogato', description: 'Glace vanille, espresso brulant', price: '6,00 EUR' },
      ],
    },
  ],
};

const out = join(uploads, 'preview');
mkdirSync(out, { recursive: true });
for (const [layout, template] of [
  ['SHOWCASE', 'MODERN'],
  ['EDITORIAL', 'ELEGANT'],
  ['BOARD', 'RUSTIC'],
] as const) {
  const html = renderMenuDocument({ ...doc, layout, template });
  const file = join(out, `menu-${layout.toLowerCase()}.html`);
  writeFileSync(file, html, 'utf8');
  console.log(
    `  ${layout.padEnd(10)} ${(Buffer.byteLength(html) / 1024).toFixed(1)} Ko  ` +
      `/uploads/preview/menu-${layout.toLowerCase()}.html`,
  );
}
