import { Injectable } from '@nestjs/common';
import { WEBSITE_UTILITIES_CSS } from './website-utilities.css';
import { publicApiUrl } from '../../common/app-url';
import { StorageService } from '../../common/storage/storage.service';
import {
  Section,
  WebsiteContent,
  WebsiteLogo,
  WebsiteTheme,
} from './website-content.types';

/**
 * Deterministic renderer: WebsiteContent -> single self-contained HTML doc.
 *
 * The structured content is the source of truth; this compiles it. Each
 * text/image node carries a `data-edit="<path>"` marker so the frontend
 * editor can map click-to-edit changes back to the content model.
 */
@Injectable()
export class WebsiteRendererService {
  constructor(private readonly storage: StorageService) {}

  render(content: WebsiteContent): string {
    const t = content.theme;
    const lang = this.esc(content.meta.language || 'fr');
    const dir = lang === 'ar' ? ' dir="rtl"' : '';
    // Theme values are interpolated into <style>: they must be inert there.
    const font = this.cssFont(t.fontFamily);

    // Deterministic design controls (changed instantly, no AI cost).
    const radius = ({ none: '0', small: '.25rem', medium: '.375rem', large: '.625rem', full: '.875rem' } as any)[t.radius || 'medium'];
    const btnRadius = ({ pill: '999px', rounded: '.375rem', square: '0' } as any)[t.buttonStyle || 'rounded'];
    const animOff = t.animations === false;
    // Vertical rhythm. This was computed but never applied, which made the
    // `density` control a no-op; sections now read --sec-pad.
    const pad = ({ compact: '4.5rem', normal: '6.5rem', spacious: '8.5rem' } as any)[t.density || 'normal'];

    const sectionsHtml = content.sections
      .filter((s) => s.visible !== false)
      .map((s) => this.renderSection(s, content))
      .join('\n');

    return `<!DOCTYPE html>
<html lang="${lang}"${dir}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.esc(content.meta.title)}</title>
  <meta name="description" content="${this.esc(content.meta.description)}">
${this.discovery(content)}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${WEBSITE_UTILITIES_CSS}</style>
  <style>
    /* Anchor links scroll smoothly without a click handler. */
    html{scroll-behavior:smooth;}
    @media (prefers-reduced-motion: reduce){html{scroll-behavior:auto;}}
    /* The default disclosure marker would sit beside the menu icon. */
    .nav-mobile > summary::-webkit-details-marker{display:none;}
    .nav-mobile > summary::marker{content:'';}

    :root{
      /* Brand */
      --primary:${this.cssColor(t.primaryColor, '#3b82f6')};
      --secondary:${this.cssColor(t.secondaryColor, '#1e3a8a')};
      --accent:${this.cssColor(t.accentColor, '#22c55e')};
      /* Neutral ink scale carries the typography; brand colour stays an accent. */
      --ink:#17181c;
      --ink-2:#44474f;
      --ink-3:#6b6f78;
      --line:#e5e5e7;
      --line-strong:#d2d3d7;
      --surface:#fafafa;
      /* Shape and rhythm */
      --radius:${radius};
      --btn-radius:${btnRadius};
      --sec-pad:${pad};
      --measure:68ch;
    }

    *{scroll-margin-top:5rem;}
    html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;}
    body{
      font-family:'${font}',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
      color:var(--ink-2);
      background:#fff;
      -webkit-font-smoothing:antialiased;
      -moz-osx-font-smoothing:grayscale;
      font-feature-settings:'kern' 1,'liga' 1;
      line-height:1.65;
    }

    /* Modular type scale (fluid, restrained) */
    h1,h2,h3,h4{color:var(--ink);font-weight:600;text-wrap:balance;}
    .t-display{font-size:clamp(2.25rem,1.55rem + 2.6vw,3.65rem);line-height:1.06;letter-spacing:-0.028em;}
    .t-h2{font-size:clamp(1.6rem,1.25rem + 1.3vw,2.35rem);line-height:1.18;letter-spacing:-0.021em;}
    .t-h3{font-size:1.0625rem;line-height:1.4;letter-spacing:-0.011em;}
    .t-lead{font-size:clamp(1rem,.96rem + .22vw,1.125rem);line-height:1.62;}
    .t-body{font-size:1rem;line-height:1.7;}
    .t-meta{font-size:.875rem;line-height:1.5;}
    /* Default colours at zero specificity. As plain class rules declared after
       the utilities, they beat "text-white/90": the hero subtitle and the dark
       CTA text rendered in dark ink on a dark photograph. */
    :where(.t-lead,.t-body){color:var(--ink-2);}
    :where(.t-meta){color:var(--ink-3);}
    .measure{max-width:var(--measure);}

    /* Section rhythm */
    .section{padding-block:var(--sec-pad);}
    .surface{background:var(--surface);}
    .shell{max-width:72rem;margin-inline:auto;padding-inline:1.5rem;}
    .shell-narrow{max-width:46rem;margin-inline:auto;padding-inline:1.5rem;}

    /* Eyebrow: neutral text under a short brand rule (brand colour used sparingly) */
    .eyebrow{display:block;font-size:.75rem;font-weight:600;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-3);margin-bottom:.875rem;}
    .eyebrow::before{content:"";display:block;width:2rem;height:2px;background:var(--primary);margin-bottom:.875rem;}
    .is-centered .eyebrow::before{margin-inline:auto;}

    /* Buttons */
    .btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;padding:.7rem 1.25rem;border-radius:var(--btn-radius);font-weight:500;font-size:.9375rem;line-height:1.2;transition:background-color .18s,border-color .18s,color .18s;border:1px solid transparent;text-decoration:none;}
    .btn-primary{background:var(--primary);color:#fff;}
    .btn-primary:hover{background:color-mix(in srgb,var(--primary) 86%,#000);}
    .btn-outline{background:transparent;color:var(--ink);border-color:var(--line-strong);}
    .btn-outline:hover{border-color:var(--ink);}
    .btn-invert{background:#fff;color:var(--ink);}
    .btn-invert:hover{background:#f2f2f2;}
    .btn-ghost-light{background:transparent;color:#fff;border-color:rgba(255,255,255,.34);}
    .btn-ghost-light:hover{background:rgba(255,255,255,.09);}
    a:focus-visible,button:focus-visible,summary:focus-visible,.field:focus-visible{outline:2px solid var(--primary);outline-offset:2px;}

    /* Cards: hairline, no shadow */
    .card{background:#fff;border:1px solid var(--line);border-radius:var(--radius);transition:border-color .18s;}
    .card:hover{border-color:var(--line-strong);}

    /* Forms */
    .field{width:100%;padding:.7rem .875rem;border:1px solid var(--line-strong);border-radius:var(--radius);outline:none;background:#fff;color:var(--ink);font-size:.9375rem;transition:border-color .18s,box-shadow .18s;}
    .field::placeholder{color:var(--ink-3);}
    .field:focus{border-color:var(--primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--primary) 14%,transparent);}

    /* Media */
    .media{border-radius:var(--radius);overflow:hidden;background:#f0f0f1;}
    .media img{display:block;width:100%;height:100%;object-fit:cover;}
    .image-placeholder{background:#ececee;}

    /* Reveal-on-scroll as progressive enhancement: hidden only when JS can
       bring it back, so the page stays fully readable without scripts
       (static export, crawlers, CSP-restricted frames). */
    .js .reveal{opacity:0;transform:translateY(14px);transition:opacity .55s ease,transform .55s cubic-bezier(.22,.7,.28,1);}
    .js .reveal.in{opacity:1;transform:none;}
    .js .stagger > *:nth-child(2){transition-delay:.06s}
    .js .stagger > *:nth-child(3){transition-delay:.12s}
    .js .stagger > *:nth-child(4){transition-delay:.18s}
    .js .stagger > *:nth-child(5){transition-delay:.24s}
    .js .stagger > *:nth-child(6){transition-delay:.3s}
    @media (prefers-reduced-motion: reduce){
      html{scroll-behavior:auto;}
      .js .reveal{opacity:1!important;transform:none!important;transition:none!important;}
      *{animation:none!important;}
    }
    ${animOff ? '.js .reveal{opacity:1!important;transform:none!important;transition:none!important}' : ''}
  </style>
</head>
<body>
  ${this.renderNav(content)}
  <main>${sectionsHtml}</main>
  ${this.renderFooter(content)}
</body>
</html>`;
  }

  /** Render for deployment: inline local images as data URIs -> self-contained. */
  renderForDeploy(content: WebsiteContent): string {
    return this.inlineLocalImages(this.render(content));
  }

  /** Deploy rendering: the document carries its own images. */
  private inlineLocalImages(html: string): string {
    return this.storage.inlineLocalAssets(html);
  }

  // ---------- logo / nav / footer ----------

  private renderLogo(logo: WebsiteLogo, theme: WebsiteTheme, opts: { footer?: boolean } = {}): string {
    if (logo.type === 'image' && this.asset(logo.imageUrl)) {
      return `<img crossorigin="anonymous" src="${this.esc(this.asset(logo.imageUrl))}" alt="${this.esc(logo.text || '')}" class="h-8 w-auto object-contain" data-edit="logo.imageUrl">`;
    }
    // Wordmark in ink, not brand colour: a coloured logotype next to coloured
    // buttons is the main source of the "template" look.
    const color = opts.footer ? '#fff' : 'var(--ink)';
    return `<span class="text-[1.0625rem] font-semibold tracking-[-0.02em]" style="color:${color}" data-edit="logo.text">${this.esc(logo.text || '')}</span>`;
  }

  private renderNav(content: WebsiteContent): string {
    const navSections = content.sections.filter((s) => s.visible !== false && s.type !== 'cta' && s.type !== 'hero');
    const links = navSections
      .map((s) => `<a href="${this.anchorFor(s)}" class="text-sm text-[color:var(--ink-2)] hover:text-[color:var(--ink)] transition whitespace-nowrap">${this.esc(this.navLabel(s))}</a>`)
      .join('');
    const mobileLinks = navSections
      .map((s) => `<a href="${this.anchorFor(s)}" class="block py-2.5 text-sm text-[color:var(--ink-2)] hover:text-[color:var(--ink)]">${this.esc(this.navLabel(s))}</a>`)
      .join('');
    const hasContact = content.sections.some((s) => s.visible !== false && s.type === 'contact');
    return `<nav class="fixed top-0 inset-x-0 z-50 bg-white/85 backdrop-blur-md" style="border-bottom:1px solid var(--line)">
    <div class="shell h-16 flex justify-between items-center gap-8">
      <a href="#" class="flex items-center">${this.renderLogo(content.logo, content.theme)}</a>
      <div class="hidden md:flex items-center gap-8">${links}</div>
      <div class="flex items-center gap-3">
        ${hasContact ? `<a href="#contact" class="hidden sm:inline-flex btn btn-primary !py-2 !px-4 !text-sm">Contact</a>` : ''}
      </div>
    </div>
    <!-- <details> opens and closes by itself, so the mobile menu needs no
         script; the document can then run with scripts disabled entirely. -->
    <details class="md:hidden nav-mobile">
      <summary class="flex items-center justify-end px-6 pb-3 cursor-pointer list-none" aria-label="Menu">
        <svg class="w-5 h-5 text-[color:var(--ink-2)]" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" d="M4 7h16M4 12h16M4 17h16"/></svg>
      </summary>
      <div class="bg-white px-6 pb-3" style="border-top:1px solid var(--line)">${mobileLinks}</div>
    </details>
  </nav>`;
  }

  private anchorFor(s: Section): string {
    const known = ['hero', 'about', 'services', 'products', 'gallery', 'testimonials', 'faq', 'contact'];
    return known.includes(s.type) ? `#${s.type}` : `#sec-${this.sid(s)}`;
  }

  private navLabel(s: Section): string {
    const map: Record<string, string> = {
      hero: 'Accueil', about: 'À propos', services: 'Services', products: 'Produits',
      gallery: 'Galerie', testimonials: 'Avis', faq: 'FAQ', contact: 'Contact',
    };
    return map[s.type] || s.data?.heading || s.data?.title || 'Section';
  }

  private renderFooter(content: WebsiteContent): string {
    const c = content.contact || {};
    const line = (iconName: string, inner: string) =>
      `<span class="inline-flex items-center gap-2">${this.icon(iconName, 'w-4 h-4 opacity-60')}${inner}</span>`;
    const lines = [
      c.phone ? `<a href="tel:${this.esc(c.phone)}" class="text-white/70 hover:text-white transition">${line('phone', this.esc(c.phone))}</a>` : '',
      c.email ? `<a href="mailto:${this.esc(c.email)}" class="text-white/70 hover:text-white transition">${line('mail', this.esc(c.email))}</a>` : '',
      c.address ? `<span class="text-white/70">${line('pin', this.esc(c.address))}</span>` : '',
    ].filter(Boolean).join('');
    return `<footer style="background:var(--ink)" class="text-white">
    <div class="shell py-14">
      <div class="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
        <div class="max-w-xs">
          ${this.renderLogo(content.logo, content.theme, { footer: true })}
          <p class="mt-3 text-sm leading-relaxed text-white/55">${this.esc(content.meta.description)}</p>
        </div>
        <div class="flex flex-col gap-3 text-sm md:items-end">${lines}</div>
      </div>
      <div class="mt-12 pt-6 text-xs text-white/40" style="border-top:1px solid rgba(255,255,255,.12)">© ${new Date().getFullYear()} ${this.esc(content.meta.title)}. Tous droits réservés.</div>
    </div>
  </footer>`;
  }

  // ---------- sections ----------

  private renderSection(s: Section, content: WebsiteContent): string {
    const p = `sections.${this.sid(s)}.data`;
    switch (s.type) {
      case 'hero': return this.hero(s, p, content);
      case 'about': return this.about(s, p);
      case 'services': return this.services(s, p);
      case 'products': return this.products(s, p, content.currency);
      case 'gallery': return this.gallery(s, p);
      case 'testimonials': return this.testimonials(s, p);
      case 'faq': return this.faq(s, p);
      case 'cta': return this.cta(s, p);
      case 'contact': return this.contact(s, p, content);
      case 'custom':
      default: return this.custom(s, p, content.currency);
    }
  }

  private img(url: string | undefined, path: string, cls: string): string {
    const src = this.asset(url);
    if (src) return `<img crossorigin="anonymous" src="${this.esc(src)}" data-edit="${path}" class="${cls}" alt="" loading="lazy" decoding="async">`;
    return `<div data-edit="${path}" class="${cls} image-placeholder"></div>`;
  }

  /**
   * Make a stored asset path absolute.
   *
   * The document is rendered outside this origin — in a sandboxed srcDoc
   * iframe on the public /site route, in a downloaded file, on a deployed
   * host — where "/uploads/x.webp" resolves against the host page and 404s.
   * Anything that is not an upload path, an https URL or an inline image is
   * dropped rather than emitted as a broken (or active) src.
   */
  private asset(url?: string | null): string | null {
    if (!url) return null;
    const v = String(url).trim();
    if (!v) return null;
    if (v.startsWith('/uploads/')) return `${publicApiUrl()}${v}`;
    if (/^https:\/\//i.test(v) || v.startsWith('data:image/')) return v;
    return null;
  }

  /**
   * Section header. Left-aligned by default (editorial hierarchy); centered is
   * reserved for short, symmetric sections such as FAQ and CTA.
   */
  private sectionHead(
    eyebrow: string,
    title: string,
    subtitle: string,
    p: string,
    opts: { center?: boolean } = {},
  ): string {
    const center = opts.center
      ? ' text-center mx-auto is-centered'
      : '';
    // An eyebrow that repeats the heading reads as a template artefact.
    const norm = (v: string) => (v || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const showEyebrow = !!eyebrow && norm(eyebrow) !== norm(title);
    return `<div class="max-w-2xl mb-12 reveal${center}">
      ${showEyebrow ? `<span class="eyebrow">${this.esc(eyebrow)}</span>` : ''}
      <h2 class="t-h2" data-edit="${p}.title">${this.esc(title)}</h2>
      ${subtitle ? `<p class="t-lead mt-4" data-edit="${p}.subtitle">${this.esc(subtitle)}</p>` : ''}
    </div>`;
  }

  /**
   * What a search engine and a shared link need, and a generated site had
   * neither of: a preview card and a machine-readable identity.
   *
   * A local business is found through Google's local results and through a
   * link pasted into a message. Without Open Graph tags that link shows a
   * bare URL; without LocalBusiness data the address, telephone and opening
   * hours are only prose and never reach a map listing.
   */
  private discovery(content: WebsiteContent): string {
    const c = content.contact || {};
    const title = content.meta.title;
    const description = content.meta.description;
    // The first photograph on the page doubles as the share image.
    const image = content.sections
      .flatMap((section) => [section.data?.imageUrl, ...(section.data?.images || []).map((i: any) => i?.url || i?.imageUrl)])
      .find((url: any) => typeof url === 'string' && url.trim());

    const schema: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: title,
      description,
      ...(image ? { image } : {}),
      ...(c.phone ? { telephone: c.phone } : {}),
      ...(c.email ? { email: c.email } : {}),
      ...(c.address ? { address: { '@type': 'PostalAddress', streetAddress: c.address } } : {}),
      ...(c.hours ? { openingHours: c.hours } : {}),
    };

    return [
      `  <meta property="og:type" content="website">`,
      `  <meta property="og:title" content="${this.esc(title)}">`,
      `  <meta property="og:description" content="${this.esc(description)}">`,
      `  <meta property="og:locale" content="${this.esc(content.meta.language || 'fr')}">`,
      image ? `  <meta property="og:image" content="${this.esc(image)}">` : '',
      `  <meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
      // JSON cannot contain "</script>"; escaping the slash is the standard guard.
      `  <script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private hero(s: Section, p: string, content: WebsiteContent): string {
    const d = s.data;
    const hasContact = content.sections.some((x) => x.type === 'contact' && x.visible !== false);
    // A generated hero occasionally comes back without a headline. Falling back
    // to the site title keeps the page presentable and the node editable.
    const title = d.title || content.meta.title || '';
    const subtitle = d.subtitle || '';
    const cta = hasContact
      ? `<a href="#contact" class="btn btn-primary" data-edit="${p}.ctaLabel">${this.esc(d.ctaLabel || 'Nous contacter')}</a>`
      : '';

    // With a photo: full-bleed image behind a flat scrim (no decorative
    // gradient) so the headline stays legible.
    //
    // The scrim is 58%, not 48%: generated interiors are often high-key —
    // a window, a lit wall — and over those the subtitle at white/80 fell
    // under the readable threshold, which is exactly what a visitor notices
    // first. A flat legibility scrim is not the decorative gradient the design
    // system rules out; it is what makes text on a photograph readable at all.
    if (this.asset(d.imageUrl)) {
      return `<section id="hero" class="relative flex items-end overflow-hidden text-white" style="min-height:min(78vh,44rem)">
    <img crossorigin="anonymous" src="${this.esc(this.asset(d.imageUrl))}" data-edit="${p}.imageUrl" class="absolute inset-0 w-full h-full object-cover" alt="" fetchpriority="high" decoding="async">
    <div class="absolute inset-0" style="background:color-mix(in srgb,var(--ink) 58%,transparent)"></div>
    <div class="relative shell w-full pb-20 pt-32">
      ${d.eyebrow ? `<span class="block text-xs font-semibold uppercase tracking-[.11em] text-white/75 mb-4" data-edit="${p}.eyebrow">${this.esc(d.eyebrow)}</span>` : ''}
      <h1 class="t-display max-w-3xl text-white" data-edit="${p}.title">${this.esc(title)}</h1>
      ${subtitle ? `<p class="t-lead mt-5 max-w-xl text-white/90" data-edit="${p}.subtitle">${this.esc(subtitle)}</p>` : ''}
      <div class="mt-9 flex flex-col sm:flex-row gap-3">
        ${cta ? `<a href="#contact" class="btn btn-invert" data-edit="${p}.ctaLabel">${this.esc(d.ctaLabel || 'Nous contacter')}</a>` : ''}
        <a href="#about" class="btn btn-ghost-light">En savoir plus</a>
      </div>
    </div>
  </section>`;
    }

    // Without a photo: an editorial type-led hero on a light ground, rather
    // than a full-bleed block of brand colour.
    return `<section id="hero" class="relative overflow-hidden surface" style="border-bottom:1px solid var(--line)">
    <div class="shell pt-36 pb-24">
      ${d.eyebrow ? `<span class="eyebrow" data-edit="${p}.eyebrow">${this.esc(d.eyebrow)}</span>` : ''}
      <h1 class="t-display max-w-3xl" data-edit="${p}.title">${this.esc(title)}</h1>
      ${subtitle ? `<p class="t-lead mt-5 max-w-xl" data-edit="${p}.subtitle">${this.esc(subtitle)}</p>` : ''}
      <div class="mt-9 flex flex-col sm:flex-row gap-3">
        ${cta}
        <a href="#about" class="btn btn-outline">En savoir plus</a>
      </div>
    </div>
  </section>`;
  }

  private about(s: Section, p: string): string {
    const d = s.data;
    const stats = (d.stats || [])
      .map((st: any, i: number) => `<div>
        <div class="text-2xl font-semibold tracking-[-0.02em] text-[color:var(--ink)]" data-edit="${p}.stats.${i}.value">${this.esc(st.value)}</div>
        <div class="t-meta mt-1" data-edit="${p}.stats.${i}.label">${this.esc(st.label)}</div></div>`)
      .join('');
    return `<section id="about" class="section bg-white">
    <div class="shell grid md:grid-cols-12 gap-x-16 gap-y-10 items-center">
      <div class="md:col-span-6 reveal">
        <span class="eyebrow">À propos</span>
        <h2 class="t-h2" data-edit="${p}.title">${this.esc(d.title || 'À propos')}</h2>
        <p class="t-body mt-5 measure" data-edit="${p}.body">${this.esc(d.body)}</p>
        ${stats ? `<div class="mt-10 pt-8 grid grid-cols-2 sm:grid-cols-3 gap-8" style="border-top:1px solid var(--line)">${stats}</div>` : ''}
      </div>
      <div class="md:col-span-6 reveal">
        <div class="media aspect-[4/3]">${this.img(d.imageUrl, `${p}.imageUrl`, 'w-full h-full object-cover')}</div>
      </div>
    </div>
  </section>`;
  }

  private services(s: Section, p: string): string {
    const d = s.data;
    const items = (d.items || [])
      .map((it: any, i: number) => (this.hasItemContent(it) ? `<div class="card p-7 reveal">
        <div class="w-9 h-9 flex items-center justify-center mb-5 text-[color:var(--primary)]">${this.icon(it.icon || 'check', 'w-5 h-5')}</div>
        <h3 class="t-h3" data-edit="${p}.items.${i}.name">${this.esc(it.name)}</h3>
        <p class="t-body mt-2 text-[.9375rem]" data-edit="${p}.items.${i}.description">${this.esc(it.description)}</p></div>` : ''))
      .join('');
    return `<section id="services" class="section surface">
    <div class="shell">
      ${this.sectionHead('Nos services', d.title || 'Nos services', d.subtitle || '', p)}
      <div class="grid md:grid-cols-3 gap-6 stagger">${items}</div>
    </div>
  </section>`;
  }

  private products(s: Section, p: string, currency: string): string {
    const d = s.data;
    const cards = (d.items || [])
      .map((it: any, i: number) => (this.hasItemContent(it) ? `<article class="reveal">
        <div class="media aspect-[4/3]">
          ${this.asset(it.imageUrl)
            ? `<img crossorigin="anonymous" src="${this.esc(this.asset(it.imageUrl))}" data-edit="${p}.items.${i}.imageUrl" class="w-full h-full object-cover" alt="" loading="lazy" decoding="async">`
            : `<div data-edit="${p}.items.${i}.imageUrl" class="w-full h-full image-placeholder"></div>`}
        </div>
        <div class="mt-4 flex items-baseline justify-between gap-4">
          <h3 class="t-h3" data-edit="${p}.items.${i}.name">${this.esc(it.name)}</h3>
          <span class="text-sm font-medium tabular-nums text-[color:var(--ink)] whitespace-nowrap" data-edit="${p}.items.${i}.price">${this.money(it.price, currency)}</span>
        </div>
        <p class="t-meta mt-1.5" data-edit="${p}.items.${i}.description">${this.esc(it.description || '')}</p>
      </article>` : ''))
      .join('');
    return `<section id="products" class="section bg-white">
    <div class="shell">
      ${this.sectionHead('Notre carte', d.title || 'Nos Produits', d.subtitle || '', p)}
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12 stagger">${cards}</div>
    </div>
  </section>`;
  }

  private gallery(s: Section, p: string): string {
    const d = s.data;
    const imgs = (d.images || [])
      .map((url: string, i: number) => `<div class="reveal media aspect-[4/3]">${this.img(url, `${p}.images.${i}`, 'w-full h-full object-cover')}</div>`)
      .join('');
    return `<section id="gallery" class="section surface">
    <div class="shell">
      ${this.sectionHead('Galerie', d.title || 'Galerie', d.subtitle || '', p)}
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">${imgs}</div>
    </div>
  </section>`;
  }

  private testimonials(s: Section, p: string): string {
    const d = s.data;
    const items = (d.items || [])
      .map((it: any, i: number) => (this.hasItemContent(it) ? `<figure class="reveal flex flex-col">
        <blockquote class="t-body text-[color:var(--ink)] flex-1" data-edit="${p}.items.${i}.quote">${this.esc(it.quote)}</blockquote>
        <figcaption class="mt-6 pt-5" style="border-top:1px solid var(--line)">
          <div class="text-sm font-medium text-[color:var(--ink)]" data-edit="${p}.items.${i}.author">${this.esc(it.author)}</div>
          <div class="t-meta" data-edit="${p}.items.${i}.role">${this.esc(it.role || '')}</div>
        </figcaption></figure>` : ''))
      .join('');
    return `<section id="testimonials" class="section bg-white">
    <div class="shell">
      ${this.sectionHead('Témoignages', d.title || 'Ils nous font confiance', d.subtitle || '', p)}
      <div class="grid md:grid-cols-3 gap-x-10 gap-y-12 stagger">${items}</div>
    </div>
  </section>`;
  }

  private faq(s: Section, p: string): string {
    const d = s.data;
    const items = (d.items || [])
      .map((it: any, i: number) => (this.hasItemContent(it) ? `<details class="group py-5" style="border-bottom:1px solid var(--line)">
        <summary class="flex justify-between items-start gap-6 cursor-pointer list-none text-[color:var(--ink)] font-medium">
          <span data-edit="${p}.items.${i}.question">${this.esc(it.question || it.name)}</span>
          <svg class="mt-1 w-4 h-4 flex-shrink-0 text-[color:var(--ink-3)] transition-transform duration-200 group-open:rotate-180" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6"/></svg>
        </summary>
        <p class="t-body mt-3 pr-10 text-[.9375rem]" data-edit="${p}.items.${i}.answer">${this.esc(it.answer || it.description)}</p>
      </details>` : ''))
      .join('');
    return `<section id="faq" class="section surface">
    <div class="shell-narrow">
      ${this.sectionHead('FAQ', d.title || 'Questions fréquentes', d.subtitle || '', p, { center: true })}
      <div style="border-top:1px solid var(--line)">${items}</div>
    </div>
  </section>`;
  }

  private cta(s: Section, p: string): string {
    const d = s.data;
    return `<section class="bg-white pb-2">
    <div class="shell">
      <div class="reveal text-center px-6 py-16 md:py-20 text-white" style="background:var(--ink);border-radius:var(--radius)">
        <h2 class="t-h2 text-white max-w-2xl mx-auto" data-edit="${p}.title">${this.esc(d.title)}</h2>
        <p class="t-lead mt-4 max-w-xl mx-auto text-white/70" data-edit="${p}.subtitle">${this.esc(d.subtitle || d.body || '')}</p>
        <div class="mt-8"><a href="#contact" class="btn btn-invert" data-edit="${p}.buttonLabel">${this.esc(d.buttonLabel || 'Commencer')}</a></div>
      </div>
    </div>
  </section>`;
  }

  private contact(s: Section, p: string, content: WebsiteContent): string {
    const d = s.data;
    const c = content.contact || {};
    const infoRow = (iconName: string, label: string, value: string, href?: string) =>
      `<div class="flex items-start gap-4 py-4" style="border-bottom:1px solid var(--line)">
        <span class="mt-0.5 text-[color:var(--ink-3)] flex-shrink-0">${this.icon(iconName, 'w-[18px] h-[18px]')}</span>
        <div class="min-w-0">
          <div class="t-meta">${label}</div>
          ${href
            ? `<a href="${this.esc(href)}" class="text-[.9375rem] font-medium text-[color:var(--ink)] hover:text-[color:var(--primary)] break-words transition">${this.esc(value)}</a>`
            : `<div class="text-[.9375rem] font-medium text-[color:var(--ink)] break-words">${this.esc(value)}</div>`}
        </div>
      </div>`;

    const info = [
      c.phone ? infoRow('phone', 'Téléphone', c.phone, `tel:${c.phone}`) : '',
      c.email ? infoRow('mail', 'Email', c.email, `mailto:${c.email}`) : '',
      c.address ? infoRow('pin', 'Adresse', c.address) : '',
      c.hours ? infoRow('clock', 'Horaires', c.hours) : '',
    ].filter(Boolean).join('');

    const buttons = [
      c.whatsapp
        ? `<a href="https://wa.me/${this.digits(c.whatsapp)}?text=${encodeURIComponent('Bonjour, ')}" target="_blank" rel="noreferrer" class="btn btn-outline">
             <svg class="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24"><path d="M17.5 14.4c-.3-.1-1.7-.9-2-1-.3-.1-.5-.1-.6.1-.2.3-.7 1-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5 0-.2 0-.4-.1-.5l-.9-2.1c-.2-.5-.4-.5-.6-.5h-.5c-.2 0-.5.1-.7.3-.3.3-1 .9-1 2.3s1 2.7 1.2 2.9c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3zM12 2a10 10 0 00-8.6 15l-1.3 4.8L7 20.5A10 10 0 1012 2z"/></svg>
             WhatsApp</a>`
        : '',
      this.httpUrl(c.googleReviewUrl)
        ? `<a href="${this.esc(this.httpUrl(c.googleReviewUrl))}" target="_blank" rel="noreferrer" class="btn btn-outline">${this.icon('star', 'w-[18px] h-[18px]')} Laisser un avis</a>`
        : '',
    ].filter(Boolean).join('');

    const mapQuery = c.mapQuery || c.address;
    const map = mapQuery
      ? `<div class="media h-full min-h-[22rem]"><iframe class="w-full h-full min-h-[22rem] border-0" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Carte"
           src="https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed"></iframe></div>`
      : '';

    // The old form built a mailto: URL in a submit handler. A form cannot post
    // anywhere useful from a static page anyway, so the honest version is the
    // link itself: it works with scripts disabled and shows where it leads.
    const form = c.email
      ? `<div class="mt-8">
        <a class="btn btn-primary w-full" href="mailto:${this.esc(c.email)}?subject=${encodeURIComponent('Contact site web')}">Nous ecrire</a>
        <p class="t-body mt-3 text-[.875rem]">Ou ecrivez directement a <a class="underline" href="mailto:${this.esc(c.email)}">${this.esc(c.email)}</a>.</p>
      </div>`
      : '';

    return `<section id="contact" class="section bg-white">
    <div class="shell">
      ${this.sectionHead('Contact', d.title || 'Contactez-nous', d.subtitle || 'Une question ? Écrivez-nous.', p)}
      <div class="grid lg:grid-cols-2 gap-x-16 gap-y-10 items-start">
        <div class="reveal">
          <div style="border-top:1px solid var(--line)">${info}</div>
          ${buttons ? `<div class="flex flex-wrap gap-3 pt-6">${buttons}</div>` : ''}
          ${c.email ? form : ''}
        </div>
        <div class="reveal h-full">${map || `<div class="media aspect-[4/3]">${this.img(undefined, `${p}.imageUrl`, 'w-full h-full')}</div>`}</div>
      </div>
    </div>
  </section>`;
  }

  private custom(s: Section, p: string, currency: string): string {
    const d = s.data;
    const items = (d.items || [])
      .map((it: any, i: number) => {
        if (!this.hasItemContent(it)) return '';
        // An AI-authored "custom" section may return items shaped like a FAQ
        // (question/answer) or a testimonial (quote/author). Render whichever
        // fields are present instead of dropping the content on the floor.
        const titleField = it.name ? 'name' : it.question ? 'question' : it.title ? 'title' : 'name';
        const textField = it.description ? 'description' : it.answer ? 'answer' : it.quote ? 'quote' : 'description';
        const titleValue = it[titleField] || '';
        const textValue = it[textField] || '';
        const media = this.asset(it.imageUrl)
          ? `<div class="media aspect-[4/3] mb-4">${this.img(it.imageUrl, `${p}.items.${i}.imageUrl`, 'w-full h-full object-cover')}</div>`
          : '';
        return `<article class="reveal">
        ${media}
        ${titleValue ? `<div class="flex items-baseline justify-between gap-4">
          <h3 class="t-h3" data-edit="${p}.items.${i}.${titleField}">${this.esc(titleValue)}</h3>
          ${it.price ? `<span class="text-sm font-medium tabular-nums text-[color:var(--ink)] whitespace-nowrap" data-edit="${p}.items.${i}.price">${this.money(it.price, currency)}</span>` : ''}
        </div>` : ''}
        ${textValue ? `<p class="t-body mt-2 text-[.9375rem]" data-edit="${p}.items.${i}.${textField}">${this.esc(textValue)}</p>` : ''}
      </article>`;
      })
      .join('');
    return `<section id="sec-${this.sid(s)}" class="section bg-white">
    <div class="shell">
      <div class="max-w-2xl mb-12 reveal">
        <h2 class="t-h2" data-edit="${p}.heading">${this.esc(d.heading || 'Section')}</h2>
        ${d.subheading ? `<p class="t-lead mt-4" data-edit="${p}.subheading">${this.esc(d.subheading)}</p>` : ''}
      </div>
      ${d.body ? `<p class="t-body measure mb-10 reveal" data-edit="${p}.body">${this.esc(d.body)}</p>` : ''}
      ${d.imageUrl ? `<div class="media aspect-[16/7] mb-12 reveal">${this.img(d.imageUrl, `${p}.imageUrl`, 'w-full h-full object-cover')}</div>` : ''}
      ${items ? `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12 stagger">${items}</div>` : ''}
    </div>
  </section>`;
  }

  /**
   * True when a list item has at least one field worth showing. Stored content
   * sometimes carries fully blank items, which would render as empty cards.
   */
  private hasItemContent(it: any): boolean {
    if (!it || typeof it !== 'object') return false;
    return ['name', 'description', 'quote', 'author', 'question', 'answer', 'price', 'imageUrl']
      .some((k) => String(it[k] ?? '').trim() !== '');
  }

  private digits(s: string): string {
    return (s || '').replace(/[^0-9]/g, '');
  }

  /** Format a price with the site currency (skips if the value already has a symbol). */
  private money(price: any, currency: string): string {
    const p = String(price ?? '').trim();
    if (!p) return '';
    if (/[€$£]|DH|MAD|USD|EUR|GBP/i.test(p)) return this.esc(p);
    const map: Record<string, { s: string; pre: boolean }> = {
      EUR: { s: '€', pre: false }, USD: { s: '$', pre: true }, GBP: { s: '£', pre: true },
      MAD: { s: 'DH', pre: false }, CAD: { s: '$', pre: true }, CHF: { s: 'CHF', pre: false },
      AED: { s: 'AED', pre: false }, SAR: { s: 'SAR', pre: false }, TND: { s: 'DT', pre: false },
    };
    const m = map[(currency || 'EUR').toUpperCase()] || { s: currency || '', pre: false };
    return this.esc(m.pre ? `${m.s}${p}` : `${p} ${m.s}`);
  }

  /** Inline line-icon (Lucide-style) by name; replaces emojis. Falls back to a check badge. */
  private icon(name: string, cls = 'w-6 h-6'): string {
    const P: Record<string, string> = {
      check: '<path d="M20 6L9 17l-5-5"/>',
      star: '<path d="M12 2l3 7 7 .5-5.3 4.6 1.7 6.9L12 17.8 5.9 21l1.7-6.9L2.3 9.5 9 9z"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      phone: '<path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3-8.6A2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.6a2 2 0 01-.5 2.1L9.1 9.9a16 16 0 006 6l1.4-1.1a2 2 0 012.1-.5c.8.3 1.7.5 2.6.6a2 2 0 011.7 2z"/>',
      mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/>',
      pin: '<path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>',
      heart: '<path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/>',
      shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
      truck: '<rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
      coffee: '<path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4z"/><path d="M6 1v3M10 1v3M14 1v3"/>',
      utensils: '<path d="M3 2v7a3 3 0 003 3v10M6 2v6M9 2v6M9 9v13"/><path d="M17 2a4 4 0 00-4 4v6h4z"/>',
      gift: '<rect x="3" y="8" width="18" height="13"/><path d="M12 8v13M3 12h18"/><path d="M12 8S10 2 7 4s5 4 5 4M12 8s2-6 5-4-5 4-5 4"/>',
      users: '<circle cx="9" cy="7" r="4"/><path d="M2 21a7 7 0 0114 0"/><path d="M16 3a4 4 0 010 8M22 21a7 7 0 00-6-6.9"/>',
      sparkles: '<path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>',
      tag: '<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7" cy="7" r="1.5"/>',
      wifi: '<path d="M5 12a10 10 0 0114 0M8.5 15.5a5 5 0 017 0"/><circle cx="12" cy="19" r="1"/>',
      leaf: '<path d="M11 20A7 7 0 014 13c0-6 8-10 16-10 0 8-4 16-9 17z"/><path d="M4 20l8-8"/>',
      home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
      camera: '<rect x="2" y="6" width="20" height="14" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8 6l2-3h4l2 3"/>',
      bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
      award: '<circle cx="12" cy="8" r="6"/><path d="M8.2 13.4L7 22l5-3 5 3-1.2-8.6"/>',
      workflow: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M9 6h4a2 2 0 012 2v7"/>',
      data: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
      chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
      settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1A1.7 1.7 0 008 19.4a1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H2a2 2 0 110-4h.1A1.7 1.7 0 004.6 8a1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V2a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H22a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
      link: '<path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7L12.3 19"/>',
      layers: '<path d="M12 2L2 7l10 5 10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
      code: '<path d="M16 18l6-6-6-6"/><path d="M8 6l-6 6 6 6"/>',
      lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>',
      support: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r=".5"/>',
      rocket: '<path d="M5 13l-2 6 6-2"/><path d="M14 4c3 0 6 3 6 6 0 4-5 9-9 11-2-2-4-4-6-6C7 13 10 4 14 4z"/><circle cx="14.5" cy="9.5" r="1.5"/>',
      target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
      chat: '<path d="M21 12a8 8 0 01-11.6 7.1L3 21l1.9-6.4A8 8 0 1121 12z"/>',
      calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
      map: '<path d="M9 3L3 5v16l6-2 6 2 6-2V3l-6 2z"/><path d="M9 3v16M15 5v16"/>',
    };
    const key = (name || '').toLowerCase().replace(/[^a-z]/g, '');
    const alias: Record<string, string> = {
      automation: 'workflow', process: 'workflow', flow: 'workflow', integration: 'link',
      api: 'link', analytics: 'chart', dashboard: 'chart', performance: 'chart',
      metrics: 'chart', database: 'data', storage: 'data', cloud: 'data',
      security: 'lock', privacy: 'lock', config: 'settings', tools: 'settings',
      team: 'users', people: 'users', help: 'support', service: 'support',
      launch: 'rocket', growth: 'rocket', goal: 'target', strategy: 'target',
      audit: 'search', diagnostic: 'search', message: 'chat', contact: 'chat',
      schedule: 'calendar', planning: 'calendar', location: 'map', delivery: 'truck',
      quality: 'award', design: 'sparkles', development: 'code',
    };
    const body = P[key] || P[alias[key] || ''] || P.check;
    return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  }

  /**
   * A colour safe to drop into a CSS custom property: hex, or an rgb()/hsl()
   * function of plain numbers. Anything else (e.g. `red}</style><script>`)
   * falls back to the default instead of breaking out of the stylesheet.
   */
  private cssColor(value: unknown, fallback: string): string {
    const v = String(value ?? '').trim();
    if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return v;
    if (/^(?:rgb|rgba|hsl|hsla)\([\d\s.,%/]+\)$/i.test(v)) return v;
    return fallback;
  }

  /** A font family name: letters, digits, spaces and hyphens only. */
  private cssFont(value: unknown): string {
    const v = String(value ?? '').replace(/[^\p{L}\p{N} \-]/gu, '').trim().slice(0, 60);
    return v || 'Inter';
  }

  /** Only http(s) links are emitted; `javascript:` and friends are dropped. */
  private httpUrl(value: unknown): string | null {
    const v = String(value ?? '').trim();
    return /^https?:\/\//i.test(v) ? v : null;
  }

  /** Section ids end up in ids, anchors and data-edit paths. */
  private sid(s: Section): string {
    return String(s.id ?? '').replace(/[^\w-]/g, '');
  }

  private esc(s: any): string {
    if (s === undefined || s === null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
