/**
 * The structured, editable representation of a generated website.
 * This — not the compiled HTML — is the source of truth. The renderer
 * compiles it into a single self-contained HTML document for preview/deploy.
 */

export type SectionType =
  | 'hero'
  | 'about'
  | 'services'
  | 'products'
  | 'gallery'
  | 'testimonials'
  | 'faq'
  | 'cta'
  | 'contact'
  | 'custom';

export interface ProductItem {
  name: string;
  price: string;
  imageUrl?: string;
  description?: string;
}

export interface WebsiteTheme {
  template: 'modern' | 'classic' | 'minimal' | 'bold';
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  // Deterministic design controls (no AI cost to change).
  radius?: 'none' | 'small' | 'medium' | 'large' | 'full';
  animations?: boolean;
  density?: 'compact' | 'normal' | 'spacious';
  buttonStyle?: 'pill' | 'rounded' | 'square';
  heroStyle?: 'gradient' | 'image' | 'minimal';
}

export interface WebsiteLogo {
  // 'wordmark' = generated text logo (default when the user uploads nothing).
  // 'image'    = an uploaded / AI-generated logo image.
  type: 'wordmark' | 'image';
  text?: string;
  imageUrl?: string;
}

export interface WebsiteMeta {
  title: string;
  description: string;
  language: string; // e.g. 'fr'
}

export interface WebsiteContact {
  phone?: string;
  email?: string;
  address?: string;
  whatsapp?: string;
  googleReviewUrl?: string;
  hours?: string; // e.g. "Lun-Ven 9h-18h, Sam 9h-13h"
  mapQuery?: string; // "lat,lng" from the picker, or the address, for the embedded map
}

export interface StatItem {
  value: string;
  label: string;
}
export interface ServiceItem {
  name: string;
  description: string;
  icon?: string;
}
export interface TestimonialItem {
  quote: string;
  author: string;
  role?: string;
}

export interface Section {
  id: string;
  type: SectionType;
  visible: boolean;
  // Free-form typed content; shape depends on `type` (see renderer).
  data: Record<string, any>;
}

export interface WebsiteContent {
  meta: WebsiteMeta;
  theme: WebsiteTheme;
  logo: WebsiteLogo;
  contact: WebsiteContact;
  currency: string; // ISO code: EUR, USD, GBP, MAD, ...
  sections: Section[];
}
