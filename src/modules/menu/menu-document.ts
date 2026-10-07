/**
 * The visual menu document.
 *
 * A menu is a designed object, not a price list. This renders one of three
 * layouts — chosen from the kind of business, not from taste — each with a hero
 * band, a logo lockup, photographed dishes, badges, category icons, a CTA and a
 * QR block, plus a real A4 print stylesheet.
 *
 * Deterministic: same document in, same HTML out. No AI is called from here.
 */

export type MenuLayout = 'SHOWCASE' | 'EDITORIAL' | 'BOARD';

export interface MenuDocItem {
  name: string;
  description?: string;
  price?: string;
  imageUrl?: string | null;
  imagePrompt?: string;
  /** Short labels: "Signature", "Vegetarien", "Epice", "Nouveau". */
  badges?: string[];
  /** Featured items get the large treatment and are photographed first. */
  featured?: boolean;
}

export interface MenuDocCategory {
  name: string;
  description?: string;
  items: MenuDocItem[];
}

export interface MenuDocContact {
  phone?: string;
  address?: string;
  hours?: string;
  website?: string;
}

export interface MenuDocument {
  businessName: string;
  tagline?: string;
  businessType?: string;
  layout: MenuLayout;
  /** Typographic variant: MODERN | CLASSIC | MINIMAL | ELEGANT | RUSTIC. */
  template: string;
  colors: { primary: string; secondary: string; accent: string };
  fontSizes?: Partial<Record<'title' | 'category' | 'item' | 'description' | 'price', number>>;
  logoUrl?: string | null;
  heroImageUrl?: string | null;
  qrCodeUrl?: string | null;
  categories: MenuDocCategory[];
  contact?: MenuDocContact;
  cta?: { label: string; url?: string };
  /**
   * Absolute origin prefixed onto "/uploads/..." paths. The document is viewed
   * from other origins (a sandboxed iframe, a download, a deployed site) where
   * a relative asset path resolves against the host page and 404s.
   */
  assetBaseUrl?: string;
}

// ---------------------------------------------------------------- typography

interface Variant {
  heading: string;
  body: string;
  googleFonts: string;
  titleCase: string;
  titleSpacing: string;
  categoryCase: string;
  categorySpacing: string;
  ground: string;
  panel: string;
  centered: boolean;
}

const VARIANTS: Record<string, Variant> = {
  MODERN: {
    heading: "'Inter'",
    body: "'Inter'",
    googleFonts: 'Inter:wght@400;500;600;700;800',
    titleCase: 'none',
    titleSpacing: '-0.035em',
    categoryCase: 'uppercase',
    categorySpacing: '0.14em',
    ground: '#ffffff',
    panel: '#f7f7f6',
    centered: false,
  },
  CLASSIC: {
    heading: "'Playfair Display'",
    body: "'Lora'",
    googleFonts: 'Playfair+Display:wght@500;600;700|Lora:wght@400;500',
    titleCase: 'none',
    titleSpacing: '-0.015em',
    categoryCase: 'none',
    categorySpacing: '0.02em',
    ground: '#fffdf9',
    panel: '#f6f1e8',
    centered: true,
  },
  MINIMAL: {
    heading: "'Inter'",
    body: "'Inter'",
    googleFonts: 'Inter:wght@300;400;500;600',
    titleCase: 'none',
    titleSpacing: '-0.04em',
    categoryCase: 'none',
    categorySpacing: '0',
    ground: '#ffffff',
    panel: '#fafafa',
    centered: false,
  },
  ELEGANT: {
    heading: "'Cormorant Garamond'",
    body: "'Inter'",
    googleFonts: 'Cormorant+Garamond:wght@500;600;700|Inter:wght@300;400;500',
    titleCase: 'none',
    titleSpacing: '-0.01em',
    categoryCase: 'uppercase',
    categorySpacing: '0.26em',
    ground: '#fcfbf8',
    panel: '#f4f1ea',
    centered: true,
  },
  RUSTIC: {
    heading: "'Bitter'",
    body: "'Lora'",
    googleFonts: 'Bitter:wght@500;600;700|Lora:wght@400;500',
    titleCase: 'none',
    titleSpacing: '-0.01em',
    categoryCase: 'uppercase',
    categorySpacing: '0.1em',
    ground: '#fbf8f3',
    panel: '#f3ece1',
    centered: false,
  },
};

// --------------------------------------------------------------------- icons

/**
 * Category icons are matched on the category name. Line icons on a 24 grid,
 * 1.5 stroke — the same drawing language as the rest of the platform.
 */
const ICONS: { test: RegExp; path: string }[] = [
  { test: /pizz/i, path: 'M12 3 3 20h18L12 3Z M9.5 14h.01 M12.5 11h.01 M14 16h.01' },
  { test: /burger|sandwich|tacos/i, path: 'M4 9h16 M4 9a8 4 0 0 1 16 0 M3 13h18 M4 16h16a4 4 0 0 1-4 3H8a4 4 0 0 1-4-3Z' },
  { test: /sushi|maki|japon|nigiri/i, path: 'M4 10h16v8H4z M4 10a8 4 0 0 1 16 0 M9 14h.01 M15 14h.01' },
  { test: /past|pâtes|pates|nouille|risotto/i, path: 'M3 12h18 M5 12a7 6 0 0 0 14 0 M8 8v-2 M12 8V5 M16 8V6' },
  { test: /salad|entrée|entree|starter|crud/i, path: 'M4 13h16a8 8 0 0 1-16 0Z M9 9c0-2 1-3 3-3s3 1 3 3 M7 11l1-2 M16 11l1-2' },
  { test: /soup|velout|potage/i, path: 'M4 11h16a8 8 0 0 1-16 0Z M20 13h1a2 2 0 0 1 0 4h-2 M9 7V5 M13 7V4' },
  { test: /grill|viande|boucher|steak|bbq|brochet/i, path: 'M6 4v16 M18 4v16 M6 9h12 M6 14h12 M9 4v16 M15 4v16' },
  { test: /poisson|fish|mer|fruits de mer/i, path: 'M3 12c4-5 12-5 16 0-4 5-12 5-16 0Z M19 12l2-3v6l-2-3Z M8 11h.01' },
  { test: /dessert|sucr|pâtiss|patiss|gâteau|gateau|glace|ice/i, path: 'M6 11h12l-1.5 9h-9L6 11Z M9 11V8a3 3 0 0 1 6 0v3 M12 4v1' },
  { test: /boisson|drink|jus|soft|eau/i, path: 'M7 4h10l-1.4 16H8.4L7 4Z M7.6 10h8.8 M12 4v16' },
  { test: /vin|wine|champagne/i, path: 'M8 3h8l-1 7a3 3 0 0 1-6 0L8 3Z M12 13v6 M9 20h6' },
  { test: /bi[èe]re|beer|pression/i, path: 'M5 6h11v14H5z M16 9h3v7h-3 M8 9v8 M12 9v8' },
  { test: /caf[ée]|coffee|espresso|th[ée]|tea/i, path: 'M4 8h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z M17 10h2a2 2 0 0 1 0 5h-2 M8 5V3 M12 5V3' },
  { test: /pain|boulang|viennois|bread/i, path: 'M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4l-2 9H6l-2-9Z M9 10v7 M15 10v7' },
  { test: /pl?at|main|sp[ée]cialit|signature/i, path: 'M4 12a8 8 0 0 1 16 0H4Z M3 15h18 M12 4v.01' },
  { test: /petit.?d[ée]j|brunch|breakfast/i, path: 'M4 14a8 8 0 0 1 16 0H4Z M3 17h18 M8 9c0-1.5 1-2 1-3.5 M12 9c0-1.5 1-2 1-3.5' },
  { test: /enfant|kids/i, path: 'M12 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z M6 20v-3a6 6 0 0 1 12 0v3' },
];

const DEFAULT_ICON = 'M5 12h14 M12 5v14';

function iconFor(name: string): string {
  const found = ICONS.find((i) => i.test.test(name || ''));
  return found ? found.path : DEFAULT_ICON;
}

// ----------------------------------------------------------------- utilities

export function esc(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Only upload paths, https URLs and inline images are allowed in src/href —
 * anything else (javascript:, data:text/html) is dropped. Upload paths are
 * made absolute against the document's asset base.
 */
let assetBase = '';
function safeUrl(value?: string | null): string | null {
  if (!value) return null;
  const v = String(value).trim();
  if (v.startsWith('/uploads/')) return `${assetBase}${v}`;
  if (/^https:\/\//i.test(v) || v.startsWith('data:image/')) return v;
  return null;
}

/** #rrggbb -> readable ink on top of it. Keeps the CTA legible on any brand. */
function onColor(hex: string): string {
  const v = (hex || '').replace('#', '');
  if (v.length !== 6) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  // Contrast against white vs against near-black; pick the winner.
  return (1.05) / (L + 0.05) >= (L + 0.05) / 0.05 ? '#ffffff' : '#111111';
}

function hasText(value?: string): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

// ------------------------------------------------------------------ partials

function badges(item: MenuDocItem, max = 3): string {
  const list = (item.badges || []).map((b) => String(b).trim()).filter(Boolean).slice(0, max);
  if (!list.length) return '';
  return `<ul class="badges">${list
    .map((b) => {
      const strong = /signature|nouveau|new|best|chef/i.test(b);
      return `<li class="badge${strong ? ' badge--accent' : ''}">${esc(b)}</li>`;
    })
    .join('')}</ul>`;
}

function photo(item: MenuDocItem, className: string): string {
  const url = safeUrl(item.imageUrl);
  if (!url) return '';
  return `<div class="${className}"><img crossorigin="anonymous" src="${esc(url)}" alt="${esc(item.name)}" loading="lazy" decoding="async"></div>`;
}

function price(item: MenuDocItem): string {
  const value = String(item.price ?? '').trim();
  return value ? `<span class="price">${esc(value)}</span>` : '';
}

function categoryHead(category: MenuDocCategory, index: number): string {
  return `
      <header class="cat-head">
        <span class="cat-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            ${iconFor(category.name)
              .split(' M')
              .map((d, i) => `<path d="${i === 0 ? d : `M${d}`}"/>`)
              .join('')}
          </svg>
        </span>
        <div class="cat-titles">
          <span class="cat-index">${String(index + 1).padStart(2, '0')}</span>
          <h2 class="cat-name">${esc(category.name)}</h2>
          ${hasText(category.description) ? `<p class="cat-desc">${esc(category.description)}</p>` : ''}
        </div>
      </header>`;
}

// ------------------------------------------------------------------- layouts

/** Photo-led cards. For food you buy with your eyes: pizza, burgers, sushi. */
function renderShowcase(doc: MenuDocument): string {
  return doc.categories
    .map(
      (category, index) => `
    <section class="category category--showcase">
      ${categoryHead(category, index)}
      <ul class="cards">
        ${category.items
          .map(
            (item) => `
        <li class="card${item.featured ? ' card--featured' : ''}${safeUrl(item.imageUrl) ? '' : ' card--nophoto'}">
          ${photo(item, 'card-photo')}
          <div class="card-body">
            <div class="card-line">
              <h3 class="item-name">${esc(item.name)}</h3>
              ${price(item)}
            </div>
            ${hasText(item.description) ? `<p class="item-desc">${esc(item.description)}</p>` : ''}
            ${badges(item)}
          </div>
        </li>`,
          )
          .join('')}
      </ul>
    </section>`,
    )
    .join('');
}

/** Hero photo for the signature dish, dot-leader list for the rest. */
function renderEditorial(doc: MenuDocument): string {
  return doc.categories
    .map((category, index) => {
      const featured = category.items.filter((i) => i.featured && safeUrl(i.imageUrl)).slice(0, 1);
      const rest = category.items.filter((i) => !featured.includes(i));
      return `
    <section class="category category--editorial">
      ${categoryHead(category, index)}
      ${featured
        .map(
          (item) => `
      <article class="feature">
        ${photo(item, 'feature-photo')}
        <div class="feature-body">
          ${badges(item)}
          <h3 class="feature-name">${esc(item.name)}</h3>
          ${hasText(item.description) ? `<p class="feature-desc">${esc(item.description)}</p>` : ''}
          ${price(item)}
        </div>
      </article>`,
        )
        .join('')}
      <ul class="items${rest.some((i) => safeUrl(i.imageUrl)) ? ' items--aligned' : ''}">
        ${rest
          .map(
            (item) => `
        <li class="item${safeUrl(item.imageUrl) ? ' item--thumb' : ''}">
          ${photo(item, 'item-photo')}
          <div class="item-body">
            <div class="line">
              <span class="item-name">${esc(item.name)}</span>
              <span class="leader" aria-hidden="true"></span>
              ${price(item)}
            </div>
            ${hasText(item.description) ? `<p class="item-desc">${esc(item.description)}</p>` : ''}
            ${badges(item, 2)}
          </div>
        </li>`,
          )
          .join('')}
      </ul>
    </section>`;
    })
    .join('');
}

/** Dense two-column board with thumbnails. For cafes, bars, bakeries. */
function renderBoard(doc: MenuDocument): string {
  return doc.categories
    .map(
      (category, index) => `
    <section class="category category--board">
      ${categoryHead(category, index)}
      <ul class="board${category.items.some((i) => safeUrl(i.imageUrl)) ? ' board--aligned' : ''}">
        ${category.items
          .map(
            (item) => `
        <li class="board-item">
          ${photo(item, 'board-photo')}
          <div class="board-body">
            <div class="line">
              <span class="item-name">${esc(item.name)}</span>
              <span class="leader" aria-hidden="true"></span>
              ${price(item)}
            </div>
            ${hasText(item.description) ? `<p class="item-desc">${esc(item.description)}</p>` : ''}
            ${badges(item, 2)}
          </div>
        </li>`,
          )
          .join('')}
      </ul>
    </section>`,
    )
    .join('');
}

// --------------------------------------------------------------------- shell

function renderMasthead(doc: MenuDocument, _v: Variant): string {
  const hero = safeUrl(doc.heroImageUrl);
  const logo = safeUrl(doc.logoUrl);
  const lockup = `
      <div class="lockup">
        ${logo ? `<img crossorigin="anonymous" class="logo" src="${esc(logo)}" alt="${esc(doc.businessName)}">` : ''}
        <div class="lockup-text">
          <span class="kicker">Notre carte</span>
          <h1>${esc(doc.businessName)}</h1>
          ${hasText(doc.tagline) ? `<p class="tagline">${esc(doc.tagline)}</p>` : ''}
        </div>
      </div>`;

  if (!hero) {
    return `<header class="masthead masthead--plain">${lockup}</header>`;
  }
  return `
    <header class="masthead masthead--hero">
      <img crossorigin="anonymous" class="hero-img" src="${esc(hero)}" alt="" aria-hidden="true">
      <div class="hero-scrim"></div>
      <div class="hero-inner">${lockup}</div>
    </header>`;
}

function renderColophon(doc: MenuDocument): string {
  const c = doc.contact || {};
  const qr = safeUrl(doc.qrCodeUrl);
  const ctaUrl = safeUrl(doc.cta?.url);
  const rows = [
    c.address ? `<li><span>Adresse</span>${esc(c.address)}</li>` : '',
    c.phone ? `<li><span>Telephone</span>${esc(c.phone)}</li>` : '',
    c.hours ? `<li><span>Horaires</span>${esc(c.hours)}</li>` : '',
    c.website ? `<li><span>Site</span>${esc(c.website)}</li>` : '',
  ]
    .filter(Boolean)
    .join('');

  if (!rows && !qr && !doc.cta) {
    return `<footer class="colophon colophon--bare"><p>${esc(doc.businessName)}</p></footer>`;
  }

  return `
    <footer class="colophon">
      <div class="colophon-main">
        <p class="colophon-name">${esc(doc.businessName)}</p>
        ${rows ? `<ul class="contact">${rows}</ul>` : ''}
        ${
          doc.cta?.label
            ? ctaUrl
              ? `<a class="cta" href="${esc(ctaUrl)}" rel="noopener">${esc(doc.cta.label)}</a>`
              : `<span class="cta cta--static">${esc(doc.cta.label)}</span>`
            : ''
        }
      </div>
      ${
        qr
          ? `<div class="qr"><img crossorigin="anonymous" src="${esc(qr)}" alt="QR code du menu en ligne"><span>Menu en ligne</span></div>`
          : ''
      }
    </footer>`;
}

// -------------------------------------------------------------------- styles

function styles(doc: MenuDocument, v: Variant): string {
  const s = {
    title: 46,
    category: 22,
    item: 16,
    description: 13,
    price: 16,
    ...(doc.fontSizes || {}),
  };
  const brand = doc.colors.primary;
  const accent = doc.colors.accent || brand;

  return `
    :root{
      --brand:${brand};
      --accent:${accent};
      --on-brand:${onColor(brand)};
      --on-accent:${onColor(accent)};
      /* Neutral ink carries the reading; the brand colour stays an accent. */
      --ink:#16171b;
      --ink-2:#414349;
      --ink-3:#6d7178;
      --line:#e2e1de;
      --ground:${v.ground};
      --panel:${v.panel};
    }
    *{margin:0;padding:0;box-sizing:border-box;}
    img{max-width:100%;display:block;}
    body{
      font-family:${v.body},Georgia,serif;
      background:var(--ground);
      color:var(--ink-2);
      line-height:1.6;
      -webkit-font-smoothing:antialiased;
      font-feature-settings:'kern' 1,'liga' 1;
    }
    .sheet{max-width:60rem;margin-inline:auto;background:var(--ground);}
    .body-pad{padding:clamp(1.5rem,4vw,3.5rem);}

    /* ---------- masthead ---------- */
    .masthead--plain{padding:clamp(2rem,5vw,4rem) clamp(1.5rem,4vw,3.5rem) 0;}
    .masthead--hero{position:relative;isolation:isolate;min-height:clamp(15rem,38vw,24rem);display:flex;align-items:flex-end;}
    .hero-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2;}
    /* Flat scrim, not a decorative gradient: it exists so type stays readable. */
    .hero-scrim{position:absolute;inset:0;background:rgba(10,10,12,.52);z-index:-1;}
    .hero-inner{width:100%;padding:clamp(1.5rem,4vw,3.5rem);}
    .masthead--hero .kicker,.masthead--hero h1,.masthead--hero .tagline{color:#fff;}
    .masthead--hero .kicker::before{background:var(--accent);}
    .masthead--hero .logo{background:#fff;padding:.4rem;}

    .lockup{display:flex;align-items:center;gap:1.25rem;${v.centered ? 'flex-direction:column;text-align:center;' : ''}}
    .logo{width:clamp(3rem,7vw,4.5rem);height:auto;flex:none;object-fit:contain;}
    .kicker{
      display:block;font-size:.7rem;font-weight:700;letter-spacing:.2em;
      text-transform:uppercase;color:var(--ink-3);margin-bottom:.8rem;
    }
    .kicker::before{
      content:"";display:block;width:2.25rem;height:2px;background:var(--brand);
      margin-bottom:.8rem;${v.centered ? 'margin-inline:auto;' : ''}
    }
    h1{
      font-family:${v.heading},Georgia,serif;
      font-size:clamp(2.1rem,1.3rem + 3vw,${s.title / 16}rem);
      font-weight:700;line-height:1.02;color:var(--ink);
      letter-spacing:${v.titleSpacing};text-transform:${v.titleCase};
    }
    .tagline{margin-top:.75rem;color:var(--ink-3);font-size:.95rem;max-width:46ch;}

    /* ---------- category ---------- */
    .category{margin-top:clamp(2.5rem,6vw,4rem);break-inside:avoid;}
    .category:first-of-type{margin-top:clamp(2rem,5vw,3rem);}
    .cat-head{display:flex;align-items:flex-start;gap:.9rem;padding-bottom:.85rem;border-bottom:1px solid var(--line);}
    .cat-icon{flex:none;width:1.75rem;height:1.75rem;color:var(--brand);margin-top:.15rem;}
    .cat-icon svg{width:100%;height:100%;}
    .cat-index{
      display:block;font-family:${v.body},sans-serif;font-size:.65rem;font-weight:700;
      letter-spacing:.22em;color:var(--accent);margin-bottom:.3rem;
      font-variant-numeric:tabular-nums;
    }
    /* A flex child never shrinks below its content by default: a long,
       letter-spaced category name ("Pain du samedi sur reservation") ran off
       the right edge. min-width:0 lets it wrap instead. */
    .cat-titles{min-width:0;}
    .cat-name{
      font-family:${v.heading},Georgia,serif;
      font-size:${s.category / 16}rem;font-weight:600;color:var(--ink);line-height:1.15;
      letter-spacing:${v.categorySpacing};text-transform:${v.categoryCase};
      overflow-wrap:break-word;hyphens:auto;
    }
    .cat-desc{margin-top:.4rem;font-size:.85rem;color:var(--ink-3);max-width:52ch;}

    /* ---------- shared item bits ---------- */
    .item-name{font-family:${v.heading},Georgia,serif;font-size:${s.item / 16}rem;font-weight:600;color:var(--ink);line-height:1.25;}
    .item-desc{margin-top:.3rem;font-size:${s.description / 16}rem;color:var(--ink-3);max-width:46ch;}
    /* Prices are information, not decoration: ink, tabular, never brand colour. */
    .price{font-size:${s.price / 16}rem;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap;}
    .line{display:flex;align-items:baseline;gap:.5rem;}
    .leader{flex:1;height:0;align-self:flex-end;margin-bottom:.3rem;border-bottom:1px dotted var(--line);min-width:1.25rem;}

    .badges{list-style:none;display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.55rem;}
    .badge{
      font-family:${v.body},sans-serif;
      font-size:.6rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
      color:var(--ink-3);border:1px solid var(--line);padding:.2rem .45rem;line-height:1.3;
    }
    .badge--accent{color:var(--on-accent);background:var(--accent);border-color:var(--accent);}

    /* ---------- SHOWCASE ---------- */
    .cards{list-style:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));gap:1.5rem;margin-top:1.75rem;}
    .card{display:flex;flex-direction:column;border:1px solid var(--line);background:var(--ground);break-inside:avoid;}
    .card--featured{grid-column:span 2;}
    .card-photo{aspect-ratio:4/3;overflow:hidden;background:var(--panel);}
    .card--featured .card-photo{aspect-ratio:16/9;}
    .card-photo img{width:100%;height:100%;object-fit:cover;}
    .card-body{padding:1rem 1.1rem 1.15rem;display:flex;flex-direction:column;flex:1;}
    .card-line{display:flex;align-items:baseline;justify-content:space-between;gap:1rem;}
    .card--nophoto{background:var(--panel);}

    /* ---------- EDITORIAL ---------- */
    .feature{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1.75rem;align-items:center;margin-top:1.75rem;break-inside:avoid;}
    .feature-photo{aspect-ratio:4/3;overflow:hidden;background:var(--panel);}
    .feature-photo img{width:100%;height:100%;object-fit:cover;}
    .feature-name{font-family:${v.heading},Georgia,serif;font-size:clamp(1.3rem,1rem + 1vw,1.75rem);font-weight:600;color:var(--ink);line-height:1.15;margin-top:.5rem;}
    .feature-desc{margin-top:.6rem;font-size:.9rem;color:var(--ink-3);max-width:44ch;}
    .feature-body .price{display:inline-block;margin-top:.9rem;}
    .feature-body .badges{margin-top:0;}

    .items{list-style:none;margin-top:1.5rem;}
    .item{padding:.85rem 0;break-inside:avoid;}
    .item + .item{border-top:1px solid var(--line);}
    .item--thumb{display:flex;gap:1rem;align-items:flex-start;}
    /* When a category mixes photographed and un-photographed items, the text
       column still has to line up — otherwise every gap reads as a mistake. */
    .items--aligned .item:not(.item--thumb) .item-body{padding-left:6.5rem;}
    .item-photo{flex:none;width:5.5rem;aspect-ratio:1;overflow:hidden;background:var(--panel);}
    .item-photo img{width:100%;height:100%;object-fit:cover;}
    .item-body{flex:1;min-width:0;}

    /* ---------- BOARD ---------- */
    .board{list-style:none;margin-top:1.5rem;display:grid;grid-template-columns:repeat(auto-fill,minmax(19rem,1fr));gap:.25rem 2.5rem;}
    .board-item{display:flex;gap:.85rem;align-items:flex-start;padding:.7rem 0;border-bottom:1px solid var(--line);break-inside:avoid;}
    .board-photo{flex:none;width:4.25rem;aspect-ratio:1;overflow:hidden;background:var(--panel);}
    .board-photo img{width:100%;height:100%;object-fit:cover;}
    .board-body{flex:1;min-width:0;}
    .board--aligned .board-item:not(:has(.board-photo)) .board-body{padding-left:5.1rem;}

    /* ---------- colophon ---------- */
    .colophon{
      margin-top:clamp(3rem,7vw,4.5rem);padding:clamp(1.5rem,4vw,2.5rem) clamp(1.5rem,4vw,3.5rem);
      background:var(--panel);border-top:1px solid var(--line);
      display:flex;flex-wrap:wrap;gap:2rem;justify-content:space-between;align-items:flex-start;
    }
    .colophon--bare{background:none;text-align:center;color:var(--ink-3);font-size:.8rem;justify-content:center;}
    .colophon-name{font-family:${v.heading},Georgia,serif;font-size:1.15rem;font-weight:600;color:var(--ink);}
    .contact{list-style:none;margin-top:1rem;display:grid;gap:.4rem;font-size:.85rem;}
    .contact li{display:flex;gap:.6rem;}
    .contact span{flex:none;width:5.5rem;font-size:.65rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);padding-top:.15rem;}
    .cta{
      display:inline-block;margin-top:1.25rem;padding:.7rem 1.4rem;
      background:var(--brand);color:var(--on-brand);text-decoration:none;
      font-family:${v.body},sans-serif;font-size:.75rem;font-weight:700;
      letter-spacing:.14em;text-transform:uppercase;
    }
    .qr{text-align:center;flex:none;}
    .qr img{width:6.5rem;height:6.5rem;background:#fff;padding:.35rem;border:1px solid var(--line);}
    .qr span{display:block;margin-top:.5rem;font-size:.62rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);}

    /* ---------- narrow ---------- */
    @media (max-width:40rem){
      .feature{grid-template-columns:1fr;gap:1rem;}
      .card--featured{grid-column:span 1;}
      .cards{grid-template-columns:1fr;}
      .lockup{flex-direction:column;align-items:flex-start;text-align:left;gap:1rem;}
      .contact span{width:4.5rem;}
      .items--aligned .item:not(.item--thumb) .item-body,
      .board--aligned .board-item:not(:has(.board-photo)) .board-body{padding-left:0;}
    }

    /* ---------- print: a menu gets printed ---------- */
    @media print{
      @page{size:A4;margin:12mm;}
      body{background:#fff;}
      .sheet{max-width:none;}
      .body-pad{padding:0;}
      .masthead--hero{min-height:auto;display:block;}
      .hero-img,.hero-scrim{display:none;}
      .masthead--hero .kicker,.masthead--hero h1,.masthead--hero .tagline{color:var(--ink);}
      .masthead--hero .kicker::before{background:var(--brand);}
      .hero-inner{padding:0;}
      .category{margin-top:1.4rem;}
      .cards{grid-template-columns:repeat(2,1fr);gap:.9rem;}
      .card--featured{grid-column:span 2;}
      .colophon{margin-top:1.8rem;padding:1rem 0 0;background:none;}
      .cta{border:1px solid var(--ink);background:none;color:var(--ink);}
      a{text-decoration:none;color:inherit;}
    }`;
}

// -------------------------------------------------------------------- render

const LAYOUTS: Record<MenuLayout, (doc: MenuDocument) => string> = {
  SHOWCASE: renderShowcase,
  EDITORIAL: renderEditorial,
  BOARD: renderBoard,
};

export function renderMenuDocument(doc: MenuDocument): string {
  assetBase = (doc.assetBaseUrl || '').replace(/\/+$/, '');
  const v = VARIANTS[String(doc.template || '').toUpperCase()] || VARIANTS.MODERN;
  const layout = LAYOUTS[doc.layout] || renderEditorial;

  // Drop empty categories and unnamed items before anything is measured.
  const clean: MenuDocument = {
    ...doc,
    categories: (doc.categories || [])
      .map((c) => ({ ...c, items: (c.items || []).filter((i) => hasText(i?.name)) }))
      .filter((c) => c.items.length > 0),
  };

  const fontHref = v.googleFonts
    .split('|')
    .map((f) => `family=${f}`)
    .join('&');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Menu — ${esc(clean.businessName)}</title>
  <meta name="description" content="${esc(clean.tagline || `La carte de ${clean.businessName}`)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?${fontHref}&display=swap" rel="stylesheet">
  <style>${styles(clean, v)}</style>
</head>
<body>
  <div class="sheet">
    ${renderMasthead(clean, v)}
    <main class="body-pad">${layout(clean)}</main>
    ${renderColophon(clean)}
  </div>
</body>
</html>`;
}

/** Which layout suits this business. Not a user preference — a design call. */
export function layoutForBusiness(businessType?: string | null): MenuLayout {
  const t = String(businessType || '').toUpperCase();
  if (['PIZZERIA', 'FAST_FOOD', 'BURGER', 'SUSHI', 'ICE_CREAM', 'FOOD_TRUCK'].includes(t)) {
    return 'SHOWCASE';
  }
  if (['CAFE', 'BAR', 'BAKERY'].includes(t)) return 'BOARD';
  return 'EDITORIAL';
}
