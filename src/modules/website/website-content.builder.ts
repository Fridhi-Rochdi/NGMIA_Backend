import { randomUUID } from 'crypto';
import {
  Section,
  SectionType,
  WebsiteContent,
} from './website-content.types';

export interface ProductInput {
  name: string;
  price: string;
  imageUrl?: string;
  imagePrompt?: string;
  description?: string;
}

export interface GalleryInput {
  enabled?: boolean;
  images?: { imageUrl?: string; imagePrompt?: string }[];
}

export interface BuildInput {
  businessName: string;
  businessType: string;
  description: string;
  services?: string[];
  products?: ProductInput[];
  gallery?: GalleryInput;
  currency?: string;
  targetAudience?: string;
  tone?: string;
  context?: string;
  contact?: {
    phone?: string;
    email?: string;
    address?: string;
    whatsapp?: string;
    googleReviewUrl?: string;
    hours?: string;
    mapQuery?: string;
  };
  colors?: { primary?: string; secondary?: string; accent?: string };
  fontFamily?: string;
  template?: 'modern' | 'classic' | 'minimal' | 'bold';
  logoUrl?: string;
  language?: string;
}

const KNOWN_TYPES: SectionType[] = [
  'hero',
  'about',
  'services',
  'products',
  'gallery',
  'testimonials',
  // 'faq' belongs here: the blueprint asks the model for FAQ sections on most
  // trades and the renderer has a dedicated accordion for them. While it was
  // missing, every generated FAQ was silently downgraded to 'custom', losing
  // its styling and its entry in the nav.
  'faq',
  'cta',
  'contact',
  'custom',
];

/**
 * Normalizes raw AI JSON (or nothing) into a valid, fully-populated
 * WebsiteContent. Never throws — always yields a renderable document.
 */
export function buildContent(input: BuildInput, ai?: any): WebsiteContent {
  const language = input.language || 'fr';

  const content: WebsiteContent = {
    meta: {
      title: ai?.meta?.title || input.businessName,
      description:
        ai?.meta?.description || input.description?.slice(0, 155) || input.businessName,
      language,
    },
    theme: {
      template: input.template || 'modern',
      primaryColor: input.colors?.primary || '#3b82f6',
      secondaryColor: input.colors?.secondary || '#1e3a8a',
      accentColor: input.colors?.accent || '#22c55e',
      fontFamily: input.fontFamily || 'Inter',
      radius: 'medium',
      buttonStyle: 'rounded',
      heroStyle: 'minimal',
    },
    logo: input.logoUrl
      ? { type: 'image', imageUrl: input.logoUrl, text: input.businessName }
      : { type: 'wordmark', text: input.businessName },
    currency: input.currency || 'EUR',
    contact: {
      phone: input.contact?.phone || undefined,
      email: input.contact?.email || undefined,
      address: input.contact?.address || undefined,
      whatsapp: input.contact?.whatsapp || undefined,
      googleReviewUrl: input.contact?.googleReviewUrl || undefined,
      hours: input.contact?.hours || undefined,
      mapQuery: input.contact?.mapQuery || input.contact?.address || undefined,
    },
    sections: [],
  };

  const aiSections: any[] = Array.isArray(ai?.sections) ? ai.sections : [];
  if (aiSections.length) {
    content.sections = aiSections
      .map((raw) => normalizeSection(raw))
      .filter((s): s is Section => !!s);
  }

  if (!content.sections.length) {
    content.sections = fallbackSections(input);
  }

  // A contact section is non-negotiable; an FAQ is not. The blueprint decides
  // whether this trade has one, and the canned three-question FAQ that used to
  // be injected here ("Retrouvez nos horaires dans la section contact") was
  // pure filler — and appended a second FAQ to any site that already had one.
  if (!content.sections.some((s) => s.type === 'contact')) {
    content.sections.push({
      id: randomUUID(),
      type: 'contact',
      visible: true,
      data: { title: 'Contactez-nous', subtitle: 'Nous sommes à votre disposition' },
    });
  }

  // The user's products are the authority on what is sold and at what price.
  //
  // When the blueprint had the model write a products section, that section
  // used to be kept AND a second one built from the user's input was inserted
  // after the hero: two "Produits" sections, two nav entries, and the model's
  // own items (named after the services) next to the real ones. Now the
  // user's products go INTO the model's section, which only contributes its
  // heading and, for a matching name, a description. Without such a section,
  // one is built after the hero as before.
  if (input.products && input.products.length) {
    content.sections = content.sections.filter((s) => s.type !== 'services');
    const generated = content.sections.filter((s) => s.type === 'products');
    const productsSection = buildProductsSection(input.products);

    if (generated.length) {
      const [host, ...extra] = generated;
      // What the model wrote for a product of the same name: its description,
      // and the English photo subject (the owner's French product name alone
      // can be refused by the image provider's filter).
      const written = new Map<string, { description?: string; imagePrompt?: string }>();
      for (const item of generated.flatMap((s) => (Array.isArray(s.data.items) ? s.data.items : []))) {
        if (item?.name) {
          written.set(foldName(item.name), {
            description: item.description ? String(item.description) : undefined,
            imagePrompt: item.imagePrompt ? String(item.imagePrompt) : undefined,
          });
        }
      }
      host.data = {
        ...host.data,
        title: host.data.title || productsSection.data.title,
        heading: host.data.heading || host.data.title || productsSection.data.title,
        items: productsSection.data.items.map((item: any) => {
          const match = written.get(foldName(item.name));
          return {
            ...item,
            description: item.description || match?.description || '',
            imagePrompt: item.imagePrompt || match?.imagePrompt || undefined,
          };
        }),
      };
      content.sections = content.sections.filter((s) => !extra.includes(s));
    } else {
      const heroIdx = content.sections.findIndex((s) => s.type === 'hero');
      if (heroIdx >= 0) content.sections.splice(heroIdx + 1, 0, productsSection);
      else content.sections.unshift(productsSection);
    }
  }

  // Gallery is opt-in: only added if the user enabled it. Uploaded photos are
  // used as-is; empty slots keep their per-slot prompt for later AI generation.
  if (input.gallery?.enabled && !content.sections.some((s) => s.type === 'gallery')) {
    const slots = input.gallery.images?.length ? input.gallery.images : [{}, {}, {}];
    const gallery: Section = {
      id: randomUUID(),
      type: 'gallery',
      visible: true,
      data: {
        title: 'Galerie',
        subtitle: '',
        images: slots.map((s) => s.imageUrl || ''),
        imagePrompts: slots.map((s) => s.imagePrompt || ''),
        imagePrompt: `${input.businessType} ambiance, interior, atmosphere, realistic professional photography`,
      },
    };
    const aboutIdx = content.sections.findIndex((s) => s.type === 'about');
    if (aboutIdx >= 0) content.sections.splice(aboutIdx + 1, 0, gallery);
    else content.sections.push(gallery);
  }

  return content;
}

/** Accent-, case- and punctuation-insensitive name, for matching items. */
function foldName(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function buildProductsSection(products: ProductInput[]): Section {
  return {
    id: randomUUID(),
    type: 'products',
    visible: true,
    data: {
      title: 'Nos Produits',
      subtitle: '',
      items: products.map((p) => ({
        name: p.name,
        price: p.price,
        imageUrl: p.imageUrl || undefined,
        imagePrompt: p.imagePrompt || undefined,
        description: p.description || '',
      })),
    },
  };
}

/** Normalize one AI section object into a typed Section (or null if invalid). */
export function normalizeSection(raw: any): Section | null {
  if (!raw || typeof raw !== 'object') return null;
  const type: SectionType = KNOWN_TYPES.includes(raw.type) ? raw.type : 'custom';
  const d = raw.data || {};
  const data: Record<string, any> = { ...d };

  // The AI contract uses "heading/subheading"; the renderer and editor use
  // "title/subtitle" for most built-in sections. Keep both so old content and
  // newly generated content render consistently.
  if (!data.title && data.heading) data.title = data.heading;
  if (!data.subtitle && data.subheading) data.subtitle = data.subheading;
  if (!data.heading && data.title) data.heading = data.title;
  if (!data.subheading && data.subtitle) data.subheading = data.subtitle;
  if (!data.body && data.description && type === 'about') data.body = data.description;
  // The AI contract uses "body" for the CTA paragraph while the renderer reads
  // "subtitle" — without this the CTA text was dropped.
  if (!data.subtitle && data.body && type === 'cta') data.subtitle = data.body;

  // Move any AI imagePrompt into a stable field; leave imageUrl empty so the
  // user chooses (upload / AI-generate) per slot later.
  if (data.imagePrompt && !data.imageUrl) data.imageUrl = undefined;

  // The blueprint role is what tells two "custom" sections apart (a pricing
  // table from a how-it-works list), both when rendering and when planning
  // which images each one needs.
  if (raw.role && !data.role) data.role = String(raw.role);

  return {
    id: raw.id || randomUUID(),
    type,
    visible: raw.visible !== false,
    data,
  };
}

function fallbackSections(input: BuildInput): Section[] {
  const services =
    input.services && input.services.length
      ? input.services
      : [];
  const icons = ['star', 'sparkles', 'bolt', 'shield', 'gift', 'check'];
  const hasServices = services.length > 0;
  return [
    {
      id: randomUUID(),
      type: 'hero',
      visible: true,
      data: {
        eyebrow: input.businessType,
        title: input.businessName,
        subtitle: input.description?.slice(0, 140) || '',
        ctaLabel: 'Nous contacter',
        imagePrompt: `professional ${input.businessType} interior, realistic, high quality photography`,
      },
    },
    {
      id: randomUUID(),
      type: 'services',
      visible: hasServices,
      data: {
        title: 'Nos Services',
        subtitle: 'Des solutions adaptées à vos besoins',
        items: services.map((name, i) => ({
          name,
          description: '',
          icon: icons[i % icons.length],
        })),
      },
    },
    {
      id: randomUUID(),
      type: 'about',
      visible: true,
      data: {
        title: 'À propos de nous',
        body: input.description || `${input.businessName} en quelques mots.`,
        imagePrompt: `${input.businessType} team at work`,
        // No stats by default: inventing "10+ years" / "500+ clients" for a
        // business we know nothing about is a credibility risk. The owner can
        // add real figures from the editor.
        stats: [],
      },
    },
    {
      id: randomUUID(),
      type: 'faq',
      visible: true,
      data: {
        title: 'Questions fréquentes',
        items: [
          { question: 'Quels sont vos horaires ?', answer: 'Contactez-nous pour connaître nos horaires d’ouverture.' },
          { question: 'Où êtes-vous situés ?', answer: 'Retrouvez notre adresse dans la section contact ci-dessous.' },
          { question: 'Comment vous contacter ?', answer: 'Par téléphone, email ou via le formulaire de contact.' },
        ],
      },
    },
    {
      id: randomUUID(),
      type: 'contact',
      visible: true,
      data: {
        title: 'Contactez-nous',
        subtitle: 'Nous sommes à votre disposition',
      },
    },
  ];
}
