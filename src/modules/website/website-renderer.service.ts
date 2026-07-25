import { Injectable } from '@nestjs/common';
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
    const lang = content.meta.language || 'fr';
    const dir = lang === 'ar' ? ' dir="rtl"' : '';
    const font = t.fontFamily || 'Inter';

    // Deterministic design controls (changed instantly, no AI cost).
    const radius = ({ none: '0', small: '.4rem', medium: '.85rem', large: '1.25rem', full: '2rem' } as any)[t.radius || 'large'];
    const btnRadius = ({ pill: '9999px', rounded: '.75rem', square: '0' } as any)[t.buttonStyle || 'pill'];
    const animOff = t.animations === false;
    const pad = ({ compact: '4rem', normal: '6rem', spacious: '8rem' } as any)[t.density || 'normal'];

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
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root{--primary:${t.primaryColor};--secondary:${t.secondaryColor};--accent:${t.accentColor};--radius:${radius};--btn-radius:${btnRadius};--sec-pad:${pad};}
    *{scroll-margin-top:5rem;}
    html{scroll-behavior:smooth;}
    body{font-family:'${font}',system-ui,sans-serif;color:#1f2937;-webkit-font-smoothing:antialiased;}
    h1,h2,h3{letter-spacing:-0.02em;line-height:1.1;}
    .text-primary{color:var(--primary);} .text-accent{color:var(--accent);}
    .bg-primary{background:var(--primary);}
    .hero-grad{background:linear-gradient(135deg,var(--primary) 0%,var(--secondary) 100%);}
    .soft-grad{background:linear-gradient(135deg,color-mix(in srgb,var(--primary) 6%,white),color-mix(in srgb,var(--accent) 6%,white));}
    .grad-text{background:linear-gradient(120deg,var(--primary),var(--accent));-webkit-background-clip:text;background-clip:text;color:transparent;}
    .btn{display:inline-flex;align-items:center;gap:.5rem;padding:.85rem 1.75rem;border-radius:var(--btn-radius);font-weight:600;transition:.25s;}
    .btn-primary{background:var(--primary);color:#fff;box-shadow:0 10px 25px -5px color-mix(in srgb,var(--primary) 45%,transparent);}
    .btn-primary:hover{transform:translateY(-2px);box-shadow:0 16px 30px -6px color-mix(in srgb,var(--primary) 55%,transparent);}
    .btn-ghost{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.4);backdrop-filter:blur(6px);}
    .btn-ghost:hover{background:rgba(255,255,255,.22);}
    .card{background:#fff;border-radius:var(--radius);box-shadow:0 4px 6px -1px rgba(0,0,0,.04),0 10px 30px -8px rgba(0,0,0,.10);transition:.3s;border:1px solid rgba(0,0,0,.04);}
    .card:hover{transform:translateY(-6px);box-shadow:0 20px 40px -12px rgba(0,0,0,.18);}
    .eyebrow{display:inline-block;font-size:.8rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--primary);margin-bottom:1rem;}
    .reveal{opacity:0;transform:translateY(28px);transition:.7s cubic-bezier(.2,.7,.2,1);}
    .reveal.in{opacity:1;transform:none;}
    .grid > .reveal:nth-child(2){transition-delay:.08s}
    .grid > .reveal:nth-child(3){transition-delay:.16s}
    .grid > .reveal:nth-child(4){transition-delay:.24s}
    .grid > .reveal:nth-child(5){transition-delay:.32s}
    .grid > .reveal:nth-child(6){transition-delay:.40s}
    @keyframes floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:none}}
    @keyframes blob{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(30px,-20px) scale(1.1)}66%{transform:translate(-20px,20px) scale(.95)}}
    .hero-anim>*{animation:fadeUp .9s cubic-bezier(.2,.7,.2,1) both;}
    .hero-anim>*:nth-child(2){animation-delay:.12s}.hero-anim>*:nth-child(3){animation-delay:.24s}.hero-anim>*:nth-child(4){animation-delay:.36s}
    .blob{position:absolute;border-radius:9999px;filter:blur(50px);opacity:.35;animation:blob 14s ease-in-out infinite;}
    .float{animation:floaty 6s ease-in-out infinite;}
    img{transition:transform .5s;}
    .field{width:100%;padding:.8rem 1rem;border:1px solid #e5e7eb;border-radius:var(--radius);outline:none;transition:.2s;background:#fff;}
    .field:focus{border-color:var(--primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--primary) 18%,transparent);}
    main section iframe, .card > img{border-radius:var(--radius);}
    ${animOff ? '.reveal{opacity:1!important;transform:none!important;transition:none!important}.hero-anim>*{animation:none!important}.blob,.float{display:none!important}img{transition:none!important}' : ''}
  </style>
</head>
<body class="bg-white">
  ${this.renderNav(content)}
  <main>${sectionsHtml}</main>
  ${this.renderFooter(content)}
  <script>
    // reveal-on-scroll
    const io=new IntersectionObserver((es)=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}}),{threshold:.12});
    document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
    // smooth anchor scroll
    document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',function(e){const el=document.querySelector(this.getAttribute('href'));if(el){e.preventDefault();el.scrollIntoView({behavior:'smooth'});}}));
    // mobile menu
    const mb=document.getElementById('menu-btn'),mm=document.getElementById('mobile-menu');
    if(mb)mb.addEventListener('click',()=>mm.classList.toggle('hidden'));
    document.querySelectorAll('#mobile-menu a').forEach(a=>a.addEventListener('click',()=>mm.classList.add('hidden')));
    // contact form -> mailto
    const cf=document.getElementById('contact-form');
    if(cf)cf.addEventListener('submit',function(e){e.preventDefault();
      const to=cf.dataset.email||'';const n=cf.querySelector('[name=name]').value;const em=cf.querySelector('[name=email]').value;const msg=cf.querySelector('[name=message]').value;
      const sub=encodeURIComponent('Contact site web - '+n);const body=encodeURIComponent('Nom: '+n+'\\nEmail: '+em+'\\n\\n'+msg);
      window.location.href='mailto:'+to+'?subject='+sub+'&body='+body;});
  </script>
</body>
</html>`;
  }

  /** Render for deployment: inline local images as data URIs -> self-contained. */
  renderForDeploy(content: WebsiteContent): string {
    return this.inlineLocalImages(this.render(content));
  }

  private inlineLocalImages(html: string): string {
    return html.replace(/(src|href)="([^"]+)"/g, (full, attr, url) => {
      const file = this.storage.readByPublicUrl(url);
      if (!file) return full;
      const b64 = file.buffer.toString('base64');
      return `${attr}="data:${file.mime};base64,${b64}"`;
    });
  }

  // ---------- logo / nav / footer ----------

  private renderLogo(logo: WebsiteLogo, theme: WebsiteTheme, opts: { footer?: boolean } = {}): string {
    if (logo.type === 'image' && logo.imageUrl) {
      return `<img src="${this.esc(logo.imageUrl)}" alt="logo" class="h-10 w-auto object-contain" data-edit="logo.imageUrl">`;
    }
    const color = opts.footer ? '#fff' : theme.primaryColor;
    return `<span class="text-2xl font-extrabold tracking-tight" style="color:${color}" data-edit="logo.text">${this.esc(logo.text || '')}</span>`;
  }

  private renderNav(content: WebsiteContent): string {
    const navSections = content.sections.filter((s) => s.visible !== false && s.type !== 'cta');
    const links = navSections
      .map((s) => `<a href="${this.anchorFor(s)}" class="text-sm font-medium text-gray-600 hover:text-primary transition whitespace-nowrap">${this.esc(this.navLabel(s))}</a>`)
      .join('');
    const mobileLinks = navSections
      .map((s) => `<a href="${this.anchorFor(s)}" class="block px-2 py-2 text-gray-700 hover:text-primary">${this.esc(this.navLabel(s))}</a>`)
      .join('');
    const hasContact = content.sections.some((s) => s.visible !== false && s.type === 'contact');
    return `<nav class="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
    <div class="max-w-6xl mx-auto px-6 h-16 flex justify-between items-center gap-6">
      ${this.renderLogo(content.logo, content.theme)}
      <div class="hidden md:flex items-center gap-7">${links}</div>
      <div class="flex items-center gap-3">
        ${hasContact ? `<a href="#contact" class="hidden sm:inline-flex btn btn-primary !py-2 !px-5 text-sm">Contact</a>` : ''}
        <button id="menu-btn" class="md:hidden p-2 text-gray-700" aria-label="Menu">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
      </div>
    </div>
    <div id="mobile-menu" class="hidden md:hidden border-t border-gray-100 bg-white px-6 py-3">${mobileLinks}</div>
  </nav>`;
  }

  private anchorFor(s: Section): string {
    const known = ['hero', 'about', 'services', 'products', 'gallery', 'testimonials', 'faq', 'contact'];
    return known.includes(s.type) ? `#${s.type}` : `#sec-${s.id}`;
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
    const fl = (iconName: string, inner: string) =>
      `<span class="inline-flex items-center gap-2">${this.icon(iconName, 'w-4 h-4')} ${inner}</span>`;
    const lines = [
      c.phone ? `<a href="tel:${this.esc(c.phone)}" class="hover:text-white transition">${fl('phone', this.esc(c.phone))}</a>` : '',
      c.email ? `<a href="mailto:${this.esc(c.email)}" class="hover:text-white transition">${fl('mail', this.esc(c.email))}</a>` : '',
      c.address ? fl('pin', this.esc(c.address)) : '',
    ].filter(Boolean).join('');
    return `<footer class="bg-gray-950 text-white py-14">
    <div class="max-w-6xl mx-auto px-6">
      <div class="flex flex-col md:flex-row justify-between items-center gap-6">
        <div>${this.renderLogo(content.logo, content.theme, { footer: true })}</div>
        <div class="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-gray-400">${lines}</div>
      </div>
      <div class="border-t border-white/10 mt-10 pt-6 text-center text-gray-500 text-sm">© ${new Date().getFullYear()} ${this.esc(content.meta.title)}. Tous droits réservés.</div>
    </div>
  </footer>`;
  }

  // ---------- sections ----------

  private renderSection(s: Section, content: WebsiteContent): string {
    const p = `sections.${s.id}.data`;
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
    if (url) return `<img src="${this.esc(url)}" data-edit="${path}" class="${cls}" alt="">`;
    return `<div data-edit="${path}" class="${cls}" style="background:linear-gradient(135deg,var(--primary),var(--accent));opacity:.9"></div>`;
  }

  private sectionHead(eyebrow: string, title: string, subtitle: string, p: string): string {
    return `<div class="text-center max-w-2xl mx-auto mb-14 reveal">
      ${eyebrow ? `<span class="eyebrow">${this.esc(eyebrow)}</span>` : ''}
      <h2 class="text-3xl md:text-5xl font-bold text-gray-900 mb-4" data-edit="${p}.title">${this.esc(title)}</h2>
      ${subtitle ? `<p class="text-lg text-gray-500" data-edit="${p}.subtitle">${this.esc(subtitle)}</p>` : ''}
    </div>`;
  }

  private hero(s: Section, p: string, content: WebsiteContent): string {
    const d = s.data;
    const hasContact = content.sections.some((x) => x.type === 'contact' && x.visible !== false);
    const bg = d.imageUrl
      ? `<img src="${this.esc(d.imageUrl)}" data-edit="${p}.imageUrl" class="absolute inset-0 w-full h-full object-cover" alt="">
         <div class="absolute inset-0 hero-grad opacity-90"></div>`
      : `<div class="absolute inset-0 hero-grad"></div>
         <div class="absolute inset-0" style="background:radial-gradient(circle at 20% 20%,rgba(255,255,255,.15),transparent 40%),radial-gradient(circle at 80% 80%,rgba(255,255,255,.12),transparent 40%)"></div>`;
    return `<section id="hero" class="relative min-h-[92vh] flex items-center justify-center text-white overflow-hidden">
    ${bg}
    <div class="blob" style="width:22rem;height:22rem;background:var(--accent);top:-4rem;left:-4rem"></div>
    <div class="blob" style="width:26rem;height:26rem;background:#fff;bottom:-6rem;right:-6rem;animation-delay:-5s"></div>
    <div class="relative max-w-4xl mx-auto px-6 text-center py-28 hero-anim">
      ${d.eyebrow ? `<span class="inline-block px-4 py-1.5 mb-6 rounded-full bg-white/15 backdrop-blur text-sm font-medium border border-white/25" data-edit="${p}.eyebrow">${this.esc(d.eyebrow)}</span>` : ''}
      <h1 class="text-4xl md:text-7xl font-extrabold mb-6 leading-[1.05]" data-edit="${p}.title">${this.esc(d.title)}</h1>
      <p class="text-lg md:text-2xl text-white/85 mb-10 max-w-2xl mx-auto font-light" data-edit="${p}.subtitle">${this.esc(d.subtitle || '')}</p>
      <div class="flex flex-col sm:flex-row gap-4 justify-center">
        ${hasContact ? `<a href="#contact" class="btn bg-white !text-gray-900 hover:!bg-gray-100" data-edit="${p}.ctaLabel">${this.esc(d.ctaLabel || 'Nous contacter')}</a>` : ''}
        <a href="#about" class="btn btn-ghost">En savoir plus</a>
      </div>
    </div>
  </section>`;
  }

  private about(s: Section, p: string): string {
    const d = s.data;
    const stats = (d.stats || [])
      .map((st: any, i: number) => `<div class="reveal">
        <div class="text-4xl font-extrabold grad-text mb-1" data-edit="${p}.stats.${i}.value">${this.esc(st.value)}</div>
        <div class="text-gray-500 text-sm font-medium" data-edit="${p}.stats.${i}.label">${this.esc(st.label)}</div></div>`)
      .join('');
    return `<section id="about" class="py-24 bg-white">
    <div class="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-14 items-center">
      <div class="reveal">
        <span class="eyebrow">À propos</span>
        <h2 class="text-3xl md:text-5xl font-bold text-gray-900 mb-6" data-edit="${p}.title">${this.esc(d.title)}</h2>
        <p class="text-gray-500 text-lg leading-relaxed mb-10" data-edit="${p}.body">${this.esc(d.body)}</p>
        ${stats ? `<div class="grid grid-cols-3 gap-6">${stats}</div>` : ''}
      </div>
      <div class="reveal">${this.img(d.imageUrl, `${p}.imageUrl`, 'rounded-3xl h-[26rem] w-full object-cover shadow-xl')}</div>
    </div>
  </section>`;
  }

  private services(s: Section, p: string): string {
    const d = s.data;
    const items = (d.items || [])
      .map((it: any, i: number) => `<div class="card p-8 reveal group">
        <div class="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 text-primary group-hover:scale-110 transition" style="background:color-mix(in srgb,var(--primary) 12%,white)">${this.icon(it.icon || 'check', 'w-7 h-7')}</div>
        <h3 class="text-xl font-bold text-gray-900 mb-3" data-edit="${p}.items.${i}.name">${this.esc(it.name)}</h3>
        <p class="text-gray-500 leading-relaxed" data-edit="${p}.items.${i}.description">${this.esc(it.description)}</p></div>`)
      .join('');
    return `<section id="services" class="py-24 soft-grad">
    <div class="max-w-6xl mx-auto px-6">
      ${this.sectionHead('Nos services', d.title, d.subtitle || '', p)}
      <div class="grid md:grid-cols-3 gap-8">${items}</div>
    </div>
  </section>`;
  }

  private products(s: Section, p: string, currency: string): string {
    const d = s.data;
    const cards = (d.items || [])
      .map((it: any, i: number) => `<div class="card overflow-hidden reveal group">
        <div class="relative overflow-hidden h-60">
          ${it.imageUrl
            ? `<img src="${this.esc(it.imageUrl)}" data-edit="${p}.items.${i}.imageUrl" class="w-full h-full object-cover group-hover:scale-110 transition duration-500" alt="">`
            : `<div data-edit="${p}.items.${i}.imageUrl" class="w-full h-full" style="background:linear-gradient(135deg,var(--primary),var(--accent));opacity:.9"></div>`}
          <span class="absolute top-3 right-3 px-3 py-1 rounded-full bg-white/95 text-sm font-extrabold text-primary shadow" data-edit="${p}.items.${i}.price">${this.money(it.price, currency)}</span>
        </div>
        <div class="p-6">
          <h3 class="text-lg font-bold text-gray-900 mb-1" data-edit="${p}.items.${i}.name">${this.esc(it.name)}</h3>
          <p class="text-gray-500 text-sm" data-edit="${p}.items.${i}.description">${this.esc(it.description || '')}</p>
        </div></div>`)
      .join('');
    return `<section id="products" class="py-24 bg-white">
    <div class="max-w-6xl mx-auto px-6">
      ${this.sectionHead('Notre carte', d.title || 'Nos Produits', d.subtitle || '', p)}
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">${cards}</div>
    </div>
  </section>`;
  }

  private gallery(s: Section, p: string): string {
    const d = s.data;
    const imgs = (d.images || [])
      .map((url: string, i: number) => `<div class="reveal overflow-hidden rounded-2xl">${this.img(url, `${p}.images.${i}`, 'h-64 w-full object-cover hover:scale-105 transition duration-500')}</div>`)
      .join('');
    return `<section id="gallery" class="py-24 soft-grad">
    <div class="max-w-6xl mx-auto px-6">
      ${this.sectionHead('Galerie', d.title || 'Galerie', d.subtitle || '', p)}
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">${imgs}</div>
    </div>
  </section>`;
  }

  private testimonials(s: Section, p: string): string {
    const d = s.data;
    const items = (d.items || [])
      .map((it: any, i: number) => `<div class="card p-8 reveal">
        <div class="text-4xl grad-text mb-3">“</div>
        <p class="text-gray-700 italic mb-6" data-edit="${p}.items.${i}.quote">${this.esc(it.quote)}</p>
        <div class="font-bold text-gray-900" data-edit="${p}.items.${i}.author">${this.esc(it.author)}</div>
        <div class="text-sm text-gray-400" data-edit="${p}.items.${i}.role">${this.esc(it.role || '')}</div></div>`)
      .join('');
    return `<section id="testimonials" class="py-24 bg-white">
    <div class="max-w-6xl mx-auto px-6">
      ${this.sectionHead('Témoignages', d.title || 'Ils nous font confiance', d.subtitle || '', p)}
      <div class="grid md:grid-cols-3 gap-8">${items}</div>
    </div>
  </section>`;
  }

  private faq(s: Section, p: string): string {
    const d = s.data;
    const items = (d.items || [])
      .map((it: any, i: number) => `<details class="group card p-6 reveal">
        <summary class="flex justify-between items-center cursor-pointer font-semibold text-gray-900 list-none">
          <span data-edit="${p}.items.${i}.question">${this.esc(it.question || it.name)}</span>
          <span class="ml-4 text-primary transition group-open:rotate-45 text-2xl leading-none">+</span>
        </summary>
        <p class="text-gray-500 mt-4 leading-relaxed" data-edit="${p}.items.${i}.answer">${this.esc(it.answer || it.description)}</p>
      </details>`)
      .join('');
    return `<section id="faq" class="py-24 soft-grad">
    <div class="max-w-3xl mx-auto px-6">
      ${this.sectionHead('FAQ', d.title || 'Questions fréquentes', d.subtitle || '', p)}
      <div class="space-y-4">${items}</div>
    </div>
  </section>`;
  }

  private cta(s: Section, p: string): string {
    const d = s.data;
    return `<section class="py-8">
    <div class="max-w-6xl mx-auto px-6">
      <div class="hero-grad rounded-3xl px-8 py-16 text-center text-white reveal shadow-xl">
        <h2 class="text-3xl md:text-5xl font-bold mb-4" data-edit="${p}.title">${this.esc(d.title)}</h2>
        <p class="text-white/85 text-lg mb-8 max-w-2xl mx-auto" data-edit="${p}.subtitle">${this.esc(d.subtitle || '')}</p>
        <a href="#contact" class="btn bg-white !text-gray-900 hover:!bg-gray-100" data-edit="${p}.buttonLabel">${this.esc(d.buttonLabel || 'Commencer')}</a>
      </div>
    </div>
  </section>`;
  }

  private contact(s: Section, p: string, content: WebsiteContent): string {
    const d = s.data;
    const c = content.contact || {};
    const infoRow = (iconName: string, label: string, value: string, href?: string) =>
      `<div class="flex items-start gap-4">
        <div class="w-11 h-11 rounded-xl flex items-center justify-center text-primary flex-shrink-0" style="background:color-mix(in srgb,var(--primary) 12%,white)">${this.icon(iconName, 'w-5 h-5')}</div>
        <div><div class="text-sm text-gray-400">${label}</div>${href ? `<a href="${href}" class="font-medium text-gray-800 hover:text-primary break-words">${this.esc(value)}</a>` : `<div class="font-medium text-gray-800 break-words">${this.esc(value)}</div>`}</div>
      </div>`;

    const info = [
      c.phone ? infoRow('phone', 'Téléphone', c.phone, `tel:${c.phone}`) : '',
      c.email ? infoRow('mail', 'Email', c.email, `mailto:${c.email}`) : '',
      c.address ? infoRow('pin', 'Adresse', c.address) : '',
      c.hours ? infoRow('clock', 'Horaires', c.hours) : '',
    ].filter(Boolean).join('');

    const buttons = [
      c.whatsapp
        ? `<a href="https://wa.me/${this.digits(c.whatsapp)}?text=${encodeURIComponent('Bonjour, ')}" target="_blank" rel="noreferrer" class="btn" style="background:#25D366;color:#fff">
             <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.5 14.4c-.3-.1-1.7-.9-2-1-.3-.1-.5-.1-.6.1-.2.3-.7 1-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5 0-.2 0-.4-.1-.5l-.9-2.1c-.2-.5-.4-.5-.6-.5h-.5c-.2 0-.5.1-.7.3-.3.3-1 .9-1 2.3s1 2.7 1.2 2.9c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3zM12 2a10 10 0 00-8.6 15l-1.3 4.8L7 20.5A10 10 0 1012 2z"/></svg>
             WhatsApp</a>`
        : '',
      c.googleReviewUrl
        ? `<a href="${this.esc(c.googleReviewUrl)}" target="_blank" rel="noreferrer" class="btn bg-gray-900 text-white hover:bg-gray-800">${this.icon('star', 'w-5 h-5')} Laisser un avis Google</a>`
        : '',
    ].filter(Boolean).join('');

    const mapQuery = c.mapQuery || c.address;
    const map = mapQuery
      ? `<iframe class="w-full h-64 md:h-full min-h-[16rem] rounded-2xl border-0" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
           src="https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed"></iframe>`
      : '';

    const form = `<form id="contact-form" data-email="${this.esc(c.email || '')}" class="space-y-3">
        <input name="name" required placeholder="Votre nom" class="field">
        <input name="email" type="email" required placeholder="Votre email" class="field">
        <textarea name="message" required rows="4" placeholder="Votre message" class="field"></textarea>
        <button type="submit" class="btn btn-primary w-full justify-center">Envoyer</button>
      </form>`;

    return `<section id="contact" class="py-24 bg-white">
    <div class="max-w-6xl mx-auto px-6">
      ${this.sectionHead('Contact', d.title || 'Contactez-nous', d.subtitle || 'Une question ? Écrivez-nous.', p)}
      <div class="grid lg:grid-cols-2 gap-10 items-stretch">
        <div class="reveal space-y-6">
          <div class="space-y-5">${info}</div>
          ${buttons ? `<div class="flex flex-wrap gap-3 pt-2">${buttons}</div>` : ''}
          ${c.email ? form : ''}
        </div>
        <div class="reveal">${map || this.img(undefined, `${p}.imageUrl`, 'w-full h-full min-h-[16rem] rounded-2xl')}</div>
      </div>
    </div>
  </section>`;
  }

  private custom(s: Section, p: string, currency: string): string {
    const d = s.data;
    const items = (d.items || [])
      .map((it: any, i: number) => {
        const priceBadge = it.price
          ? `<span class="absolute top-3 right-3 px-3 py-1 rounded-full bg-white/95 text-sm font-extrabold text-primary shadow" data-edit="${p}.items.${i}.price">${this.money(it.price, currency)}</span>`
          : '';
        const media = it.imageUrl
          ? `<div class="relative overflow-hidden h-48"><img src="${this.esc(it.imageUrl)}" data-edit="${p}.items.${i}.imageUrl" class="w-full h-full object-cover group-hover:scale-110 transition duration-500" alt="">${priceBadge}</div>`
          : '';
        return `<div class="card overflow-hidden reveal text-left group">
        ${media}
        <div class="p-6">
          <div class="flex items-start justify-between gap-3 mb-1">
            <h3 class="font-bold text-gray-900" data-edit="${p}.items.${i}.name">${this.esc(it.name)}</h3>
            ${!it.imageUrl && it.price ? `<span class="font-extrabold text-primary whitespace-nowrap" data-edit="${p}.items.${i}.price">${this.money(it.price, currency)}</span>` : ''}
          </div>
          <p class="text-gray-500" data-edit="${p}.items.${i}.description">${this.esc(it.description)}</p>
        </div></div>`;
      })
      .join('');
    return `<section id="sec-${s.id}" class="py-24 bg-white">
    <div class="max-w-5xl mx-auto px-6 text-center">
      <div class="max-w-2xl mx-auto mb-12 reveal">
        <h2 class="text-3xl md:text-5xl font-bold text-gray-900 mb-4" data-edit="${p}.heading">${this.esc(d.heading || '')}</h2>
        ${d.subheading ? `<p class="text-lg text-gray-500" data-edit="${p}.subheading">${this.esc(d.subheading)}</p>` : ''}
      </div>
      ${d.body ? `<p class="text-gray-600 max-w-3xl mx-auto mb-10" data-edit="${p}.body">${this.esc(d.body)}</p>` : ''}
      ${d.imageUrl ? this.img(d.imageUrl, `${p}.imageUrl`, 'rounded-2xl h-80 w-full object-cover mb-10 reveal') : ''}
      ${items ? `<div class="grid md:grid-cols-3 gap-6">${items}</div>` : ''}
    </div>
  </section>`;
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
    };
    const body = P[(name || '').toLowerCase().replace(/[^a-z]/g, '')] || P.check;
    return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
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
