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

  // Guarantee FAQ + contact exist even if the model omitted them (they must
  // always appear on the site).
  if (!content.sections.some((s) => s.type === 'faq')) {
    const faq: Section = {
      id: randomUUID(),
      type: 'faq',
      visible: true,
      data: {
        title: 'Questions fréquentes',
        items: [
          { question: 'Quels sont vos horaires ?', answer: 'Retrouvez nos horaires dans la section contact ci-dessous.' },
          { question: 'Où êtes-vous situés ?', answer: 'Notre emplacement est indiqué sur la carte.' },
          { question: 'Comment vous contacter ?', answer: 'Par téléphone, email, WhatsApp ou le formulaire de contact.' },
        ],
      },
    };
    const contactIdx = content.sections.findIndex((s) => s.type === 'contact');
    if (contactIdx >= 0) content.sections.splice(contactIdx, 0, faq);
    else content.sections.push(faq);
  }
  if (!content.sections.some((s) => s.type === 'contact')) {
    content.sections.push({
      id: randomUUID(),
      type: 'contact',
      visible: true,
      data: { title: 'Contactez-nous', subtitle: 'Nous sommes à votre disposition' },
    });
  }

  // If the user supplied products, build a products section from their input
  // (name + price + photo) and insert it right after the hero. When products
  // exist we drop any AI-authored "services" section to avoid redundancy.
  if (input.products && input.products.length) {
    content.sections = content.sections.filter((s) => s.type !== 'services');
    const productsSection = buildProductsSection(input.products);
    const heroIdx = content.sections.findIndex((s) => s.type === 'hero');
    if (heroIdx >= 0) content.sections.splice(heroIdx + 1, 0, productsSection);
    else content.sections.unshift(productsSection);
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

export function buildProductsSection(products: ProductInput[]): Section {
  return {
    id: randomUUID(),
    type: 'products',
    visible: true,
    data: {
      title: 'Nos Produits',
      subtitle: 'Découvrez notre sélection',
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

  // Move any AI imagePrompt into a stable field; leave imageUrl empty so the
  // user chooses (upload / AI-generate) per slot later.
  if (data.imagePrompt && !data.imageUrl) data.imageUrl = undefined;

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
      : ['Service Premium', 'Support Expert', 'Solutions Sur Mesure'];
  const icons = ['star', 'sparkles', 'bolt', 'shield', 'gift', 'check'];
  return [
    {
      id: randomUUID(),
      type: 'hero',
      visible: true,
      data: {
        eyebrow: input.businessType,
        title: input.businessName,
        subtitle: `Votre ${input.businessType.toLowerCase()} de confiance`,
        ctaLabel: 'Nous contacter',
        imagePrompt: `professional ${input.businessType} interior, realistic, high quality photography`,
      },
    },
    {
      id: randomUUID(),
      type: 'services',
      visible: true,
      data: {
        title: 'Nos Services',
        subtitle: 'Des solutions adaptées à vos besoins',
        items: services.map((name, i) => ({
          name,
          description:
            'Une approche professionnelle et personnalisée pour répondre à vos attentes.',
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
        body: `Chez ${input.businessName}, nous mettons notre savoir-faire au service de votre satisfaction, avec passion et exigence à chaque étape.`,
        imagePrompt: `${input.businessType} team at work`,
        stats: [
          { value: '10+', label: "Ans d'expérience" },
          { value: '500+', label: 'Clients satisfaits' },
        ],
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
