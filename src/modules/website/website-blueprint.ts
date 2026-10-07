/**
 * The site blueprint.
 *
 * A restaurant site and a SaaS site are not the same object, and shipping the
 * same seven sections to both is how a generator ends up producing generic
 * landing pages. This decides — from the trade — which sections exist, in what
 * order, what each one is for, which images it needs and what the site is
 * asking the visitor to do.
 *
 * Deterministic. The AI writes the copy; it does not get to decide the
 * architecture, because an unreliable model producing an unreliable structure
 * is how you get the same template every time.
 */

import { SectionType } from './website-content.types';
import { ShotKind } from '../../common/brand-kit/art-direction';
import { VisualStyleKey } from '../../common/brand-kit/art-direction';

export type BusinessCategory =
  | 'hospitality' // restaurants, cafes, bars, tea rooms: you sit down, you book
  | 'foodshop' // bakeries, pastry shops, chocolatiers, ice cream, caterers: you come in and buy
  | 'retail' // shops, boutiques, e-commerce
  | 'agency' // studios, consultancies, marketing, architecture
  | 'saas' // software products
  | 'health' // clinics, dentists, therapists, wellness
  | 'trades' // builders, plumbers, joiners, electricians
  | 'beauty' // salons, barbers, spas
  | 'realestate'
  | 'education'
  | 'events'
  | 'professional' // lawyers, accountants, notaries
  | 'fitness'
  | 'automotive'
  | 'other';

export interface BlueprintSection {
  type: SectionType;
  /** Stable identity for this slot — how a custom section knows what it is. */
  role: string;
  /** What the copywriter has to produce here. Goes into the prompt verbatim. */
  brief: string;
  /** Imagery this section needs; empty means it is a text section. */
  shots?: { kind: ShotKind; count: number; subject: string }[];
}

export interface SiteBlueprint {
  category: BusinessCategory;
  /** Human label, surfaced in the UI so the choice is visible, not magic. */
  label: string;
  sections: BlueprintSection[];
  /** What the site is asking for. Drives every CTA label. */
  primaryAction: string;
  secondaryAction?: string;
  visualStyle: VisualStyleKey;
  /**
   * The default palette for this trade. Every site used to open on the same
   * #3b82f6 blue with a #22c55e accent, which is the single most recognisable
   * tell of a generated page. Restrained on purpose: a near-neutral ink, a
   * supporting tone and one accent that only appears on buttons and rules.
   */
  palette: { primary: string; secondary: string; accent: string };
  /** Layout hints handed to the theme. */
  heroStyle: 'image' | 'minimal' | 'gradient';
  density: 'compact' | 'normal' | 'spacious';
}

/**
 * Reviews are never written by the model: a generated "customer comment" is a
 * fake review. The section shows only what the owner supplies.
 */
const REVIEWS_BRIEF = 'Customer reviews supplied by the owner, word for word; an empty list when none are supplied.';

// --------------------------------------------------------------- classifier

const KEYWORDS: { category: BusinessCategory; test: RegExp }[] = [
  // Checked before hospitality. A bakery used to be filed as a restaurant, so
  // its site, reel and CTAs asked visitors to "book a table", and its practical
  // section promised group bookings and parking: a shop you walk into and buy
  // from is not a dining room.
  {
    category: 'foodshop',
    test: /boulang|bakery|patiss|pâtiss|viennois|chocolat(?:ier|erie)|glacier|ice.?cream|gelat|traiteur|food.?truck|fromager|boucher|charcut|torr[ée]fact/i,
  },
  {
    category: 'hospitality',
    // "Salon de thé" sits you down, so it stays here even when the
    // description mentions pastries.
    test: /restaurant|pizzeria|pizza|café|cafe|bar|brasserie|bistro|salon\s+de\s+th[eé]|tea.?room|sushi|burger|trattoria|resto|cuisine|chef|hotel|hôtel|auberge|gastronom/i,
  },
  {
    category: 'beauty',
    test: /coiffure|coiffeur|salon\s+de\s+(?:coiffure|beaut|manucure)|barbier|barber|beaut[ée]|esthetic|esthétic|\bspa\b|onglerie|nail|massage|institut\s+de\s+beaut/i,
  },
  {
    category: 'health',
    test: /clinique|cabinet\s+(?:dentaire|medical|médical|infirmier|de\s+(?:kine|kiné|sant|psycho))|dentiste|dental|medic|médec|docteur|\bkine\b|\bkiné\b|osteo|ostéo|therap|thérap|psycho|pharmac|sant[ée]|opticien|veterinaire|vétérinaire|infirmier/i,
  },
  {
    category: 'fitness',
    test: /salle de sport|fitness|gym|coach sportif|crossfit|yoga|pilates|musculation|personal.?train/i,
  },
  {
    category: 'trades',
    test: /menuis|plombier|plomberie|électric|electric|maçon|macon|charpent|couvreur|peintre|carrel|chauffag|serrur|renovation|rénovation|bâtiment|batiment|artisan|construction|paysagis|jardin/i,
  },
  { category: 'realestate', test: /immobili|real.?estate|agence immo|promoteur|syndic|location saisonn/i },
  {
    category: 'agency',
    test: /agence|agency|studio|conseil|consult|marketing|communication|design|architect|graphis|web|digital|creative|créativ|publicit|photograph|videast|vidéast/i,
  },
  {
    category: 'saas',
    test: /saas|logiciel|software|platform|plateforme|application|app\b|api\b|startup|tech\b|cloud|data\b|ia\b|\bai\b/i,
  },
  {
    category: 'retail',
    test: /boutique|magasin|shop|store|commerce|vente|concept.?store|epicerie|épicerie|librairie|fleuriste|bijout|pret.?a.?porter|prêt.?à.?porter|mode\b/i,
  },
  { category: 'education', test: /école|ecole|formation|cours|academy|académie|institut de formation|tutorat|coaching scolaire|université|universit/i },
  { category: 'events', test: /événement|evenement|event|mariage|wedding|traiteur événement|organisation|séminaire|seminaire|dj\b|animation/i },
  { category: 'professional', test: /avocat|notaire|expert.?comptable|comptab|juridique|fiscal|assurance|courtier|audit|rh\b|recrutement/i },
  { category: 'automotive', test: /garage|automobile|auto\b|carross|pneu|concession|mécanique|mecanique|lavage auto|moto\b/i },
];

/** Category from the declared type and the free-text description. */
export function classifyBusiness(businessType?: string | null, description?: string | null): BusinessCategory {
  // The declared type is the stronger signal; the description only breaks ties.
  const declared = String(businessType || '');
  for (const { category, test } of KEYWORDS) {
    if (test.test(declared)) return category;
  }
  const text = `${declared} ${description || ''}`;
  for (const { category, test } of KEYWORDS) {
    if (test.test(text)) return category;
  }
  return 'other';
}

// --------------------------------------------------------------- blueprints

const S = (
  type: SectionType,
  role: string,
  brief: string,
  shots?: BlueprintSection['shots'],
): BlueprintSection => ({ type, role, brief, shots });

const HERO = (subject: string) =>
  S('hero', 'hero', 'The one sentence that says what this business does and for whom.', [
    { kind: 'hero', count: 1, subject },
  ]);

const CONTACT = S(
  'contact',
  'contact',
  'How to reach the business. No invented details: only what the brief provides.',
);

const BLUEPRINTS: Record<BusinessCategory, Omit<SiteBlueprint, 'category'>> = {
  hospitality: {
    label: 'Restauration',
    primaryAction: 'Reserver une table',
    secondaryAction: 'Voir la carte',
    visualStyle: 'RUSTIC',
    palette: { primary: '#2E4034', secondary: '#2B2A28', accent: '#B0552F' },
    heroStyle: 'image',
    density: 'normal',
    sections: [
      HERO('the dining room, warm and occupied, seen from the entrance'),
      S('about', 'story', 'Who cooks, where the produce comes from, how long it has been going.', [
        { kind: 'portrait', count: 1, subject: 'the chef working at the pass' },
      ]),
      S('custom', 'menu-highlights', 'Four to six signature dishes with their real ingredients and prices.', [
        { kind: 'dish', count: 4, subject: 'a signature plated dish' },
      ]),
      S('gallery', 'gallery', 'The room, the plates, the details.', [
        { kind: 'detail', count: 3, subject: 'a close detail of the food and the room' },
      ]),
      S('custom', 'practical', 'Opening hours, how to book, group bookings, parking. Facts only.'),
      S('testimonials', 'reviews', REVIEWS_BRIEF),
      S('cta', 'book', 'A direct invitation to book.'),
      CONTACT,
    ],
  },
  foodshop: {
    label: 'Commerce de bouche',
    // Neutral on purpose: whether the shop takes orders or pre-orders is a
    // fact only the brief can state, so the default CTA assumes neither.
    primaryAction: 'Nous trouver',
    secondaryAction: 'Voir nos produits',
    visualStyle: 'RUSTIC',
    palette: { primary: '#3B2A1E', secondary: '#5C4636', accent: '#C8913A' },
    heroStyle: 'image',
    density: 'normal',
    sections: [
      HERO('the shop counter with the day\'s production on display'),
      S('products', 'products', 'What is actually made and sold here. Prices only when the owner gave them.', [
        { kind: 'product', count: 4, subject: 'a single item from the range, on a clean surface' },
      ]),
      S('about', 'story', 'Who makes it and how it is made — only what the brief states.', [
        { kind: 'portrait', count: 1, subject: 'a hand at work at the workbench' },
      ]),
      S('gallery', 'gallery', 'The shop, the counter, the workshop, the details.', [
        { kind: 'detail', count: 3, subject: 'a close detail of the products and the shop' },
      ]),
      S(
        'custom',
        'practical',
        'Opening hours, where to find the shop, and how to order or pre-order only if the brief says it is possible. Facts only; no seating, no table booking.',
      ),
      S('testimonials', 'reviews', REVIEWS_BRIEF),
      S('cta', 'visit', 'A plain invitation to come to the shop.'),
      CONTACT,
    ],
  },
  retail: {
    label: 'Commerce',
    primaryAction: 'Voir la boutique',
    secondaryAction: 'Nous rendre visite',
    visualStyle: 'MINIMAL',
    palette: { primary: '#15161A', secondary: '#4B4F58', accent: '#A8725A' },
    heroStyle: 'image',
    density: 'normal',
    sections: [
      HERO('the shop interior, shelves styled and well lit'),
      S('products', 'products', 'The products actually sold, with prices when known.', [
        { kind: 'product', count: 4, subject: 'a single product on a clean surface' },
      ]),
      S('about', 'story', 'What the shop selects and why.', [
        { kind: 'interior', count: 1, subject: 'the shop interior' },
      ]),
      S('gallery', 'gallery', 'The shop and its pieces.', [
        { kind: 'lifestyle', count: 3, subject: 'a product in real use' },
      ]),
      S('testimonials', 'reviews', REVIEWS_BRIEF),
      S('custom', 'visit', 'Address, opening hours, how to find it, click and collect if relevant.'),
      S('cta', 'visit-cta', 'An invitation to come in or to order.'),
      CONTACT,
    ],
  },
  agency: {
    label: 'Agence / Studio',
    primaryAction: 'Demander un devis',
    secondaryAction: 'Voir les realisations',
    visualStyle: 'MODERN',
    palette: { primary: '#111317', secondary: '#3A4048', accent: '#2B59C3' },
    heroStyle: 'minimal',
    density: 'spacious',
    sections: [
      HERO('the studio at work, desks and screens, people mid-task'),
      S('services', 'services', 'The services sold, named the way a client would ask for them.'),
      S('custom', 'work', 'Three to six pieces of work, each with what was done and for whom.', [
        { kind: 'lifestyle', count: 3, subject: 'a finished project shown in context' },
      ]),
      S('custom', 'method', 'How a project runs, step by step. Four steps maximum.'),
      S('about', 'team', 'Who the team is and what they are good at.', [
        { kind: 'portrait', count: 1, subject: 'the team working together' },
      ]),
      S('testimonials', 'reviews', REVIEWS_BRIEF),
      S('faq', 'faq', 'The questions a prospect asks before signing: budget, timeline, process.'),
      S('cta', 'quote', 'An invitation to describe a project.'),
      CONTACT,
    ],
  },
  saas: {
    label: 'Logiciel / SaaS',
    primaryAction: 'Essayer gratuitement',
    secondaryAction: 'Demander une demo',
    visualStyle: 'MINIMAL',
    palette: { primary: '#0F172A', secondary: '#334155', accent: '#2563EB' },
    heroStyle: 'minimal',
    density: 'spacious',
    sections: [
      HERO('a focused workspace, a laptop in use, clean desk'),
      S('services', 'features', 'What the product does, one capability per item, in the user\'s words.'),
      S('custom', 'how-it-works', 'The product in three steps, from signup to result.', [
        { kind: 'detail', count: 1, subject: 'hands using a laptop, close crop' },
      ]),
      S('custom', 'use-cases', 'Three concrete situations where the product is the right tool.'),
      S('custom', 'pricing', 'The plans and what separates them. No invented prices.'),
      S('testimonials', 'reviews', REVIEWS_BRIEF),
      S('faq', 'faq', 'Data, migration, cancellation, support.'),
      S('cta', 'trial', 'An invitation to start.'),
      CONTACT,
    ],
  },
  health: {
    label: 'Sante',
    primaryAction: 'Prendre rendez-vous',
    visualStyle: 'MINIMAL',
    palette: { primary: '#17494D', secondary: '#35555A', accent: '#4E8D7C' },
    heroStyle: 'image',
    density: 'normal',
    sections: [
      HERO('a calm, bright consulting room'),
      S('services', 'care', 'The treatments and consultations offered, in plain language.'),
      S('about', 'practitioner', 'Who practises here, their training and approach.', [
        { kind: 'portrait', count: 1, subject: 'the practitioner in the consulting room' },
      ]),
      S('custom', 'first-visit', 'What happens at a first appointment, what to bring, how long it takes.'),
      S('faq', 'faq', 'Appointments, cover, cancellation, accessibility.'),
      S('custom', 'practical', 'Hours, address, access, parking, public transport.'),
      S('cta', 'appointment', 'An invitation to book.'),
      CONTACT,
    ],
  },
  trades: {
    label: 'Artisanat / Batiment',
    primaryAction: 'Demander un devis',
    secondaryAction: 'Voir les chantiers',
    visualStyle: 'RUSTIC',
    palette: { primary: '#3A2E26', secondary: '#5A4A3E', accent: '#C06B2E' },
    heroStyle: 'image',
    density: 'normal',
    sections: [
      HERO('a craftsman at work on site, tools and material visible'),
      S('services', 'services', 'The jobs actually taken on, named the way a customer describes them.'),
      S('custom', 'projects', 'Three to six completed jobs: what was done, where, what it involved.', [
        { kind: 'lifestyle', count: 3, subject: 'a finished piece of work in place' },
      ]),
      S('custom', 'process', 'From first call to handover, in four steps. Mention the free quote.'),
      S('about', 'workshop', 'The workshop, the materials, how long the trade has been practised.', [
        { kind: 'interior', count: 1, subject: 'the workshop' },
      ]),
      S('testimonials', 'reviews', REVIEWS_BRIEF),
      S('faq', 'faq', 'Quotes, lead times, coverage area, guarantees.'),
      S('cta', 'quote', 'An invitation to describe the job and get a quote.'),
      CONTACT,
    ],
  },
  beauty: {
    label: 'Beaute / Bien-etre',
    primaryAction: 'Prendre rendez-vous',
    visualStyle: 'ELEGANT',
    palette: { primary: '#2A2226', secondary: '#4A3F45', accent: '#A88A6B' },
    heroStyle: 'image',
    density: 'normal',
    sections: [
      HERO('the salon interior, styled and softly lit'),
      S('custom', 'services-prices', 'The treatments with their durations and prices.', [
        { kind: 'detail', count: 3, subject: 'a close detail of the treatment being performed' },
      ]),
      S('gallery', 'results', 'Finished work on real clients: what was done, on whom, in one line.', [
        { kind: 'lifestyle', count: 3, subject: 'a finished result on a client' },
      ]),
      S('about', 'team', 'Who works here and what they trained in.', [
        { kind: 'portrait', count: 1, subject: 'a stylist at work' },
      ]),
      S('testimonials', 'reviews', REVIEWS_BRIEF),
      S('custom', 'practical', 'Hours, booking, cancellation policy, address.'),
      S('cta', 'book', 'An invitation to book.'),
      CONTACT,
    ],
  },
  realestate: {
    label: 'Immobilier',
    primaryAction: 'Estimer mon bien',
    secondaryAction: 'Voir les biens',
    visualStyle: 'ELEGANT',
    palette: { primary: '#1C2733', secondary: '#3C4A59', accent: '#8C7B5C' },
    heroStyle: 'image',
    density: 'normal',
    sections: [
      HERO('a bright, well-staged living room'),
      S('services', 'services', 'Sales, lettings, valuation, management — whichever apply.'),
      S('custom', 'listings', 'A sample of properties handled, with their key facts.', [
        { kind: 'interior', count: 3, subject: 'a staged interior of a property' },
      ]),
      S('custom', 'process', 'How a sale or a let runs, step by step.'),
      S('about', 'agency', 'The agency, its patch, how long it has been there.'),
      S('testimonials', 'reviews', REVIEWS_BRIEF),
      S('faq', 'faq', 'Fees, timelines, documents, valuation.'),
      S('cta', 'valuation', 'An invitation to request a valuation.'),
      CONTACT,
    ],
  },
  education: {
    label: 'Formation',
    primaryAction: 'S inscrire',
    secondaryAction: 'Voir le programme',
    visualStyle: 'MODERN',
    palette: { primary: '#1B2A4A', secondary: '#3C4E70', accent: '#D0803A' },
    heroStyle: 'image',
    density: 'normal',
    sections: [
      HERO('a classroom or workshop in session'),
      S('custom', 'programmes', 'The courses offered: level, duration, format, price.'),
      S('custom', 'outcomes', 'What a learner can do at the end. Concrete skills, no promises of results.'),
      S('about', 'teachers', 'Who teaches and what they have done.', [
        { kind: 'portrait', count: 1, subject: 'a teacher with students' },
      ]),
      S('testimonials', 'reviews', REVIEWS_BRIEF),
      S('faq', 'faq', 'Entry requirements, funding, schedule, certification.'),
      S('cta', 'enrol', 'An invitation to enrol or ask for the syllabus.'),
      CONTACT,
    ],
  },
  events: {
    label: 'Evenementiel',
    primaryAction: 'Demander un devis',
    secondaryAction: 'Voir les realisations',
    visualStyle: 'ELEGANT',
    palette: { primary: '#241F2B', secondary: '#463D52', accent: '#9C6B8E' },
    heroStyle: 'image',
    density: 'spacious',
    sections: [
      HERO('an event in progress, the room dressed and full'),
      S('services', 'formats', 'The kinds of event handled and what is included.'),
      S('gallery', 'gallery', 'Past events: the kind of occasion, the scale, the setting.', [
        { kind: 'lifestyle', count: 4, subject: 'a moment from a dressed event' },
      ]),
      S('custom', 'process', 'From brief to the day itself, step by step.'),
      S('testimonials', 'reviews', REVIEWS_BRIEF),
      S('faq', 'faq', 'Capacity, budget, dates, cancellation.'),
      S('cta', 'quote', 'An invitation to describe the event.'),
      CONTACT,
    ],
  },
  professional: {
    label: 'Services professionnels',
    primaryAction: 'Prendre rendez-vous',
    visualStyle: 'CLASSIC',
    palette: { primary: '#14202E', secondary: '#33455C', accent: '#7A6A4F' },
    heroStyle: 'minimal',
    density: 'normal',
    sections: [
      HERO('a quiet, orderly office'),
      S('services', 'practice-areas', 'The areas actually practised, named as a client would.'),
      S('about', 'firm', 'The practice, its people, their qualifications.', [
        { kind: 'portrait', count: 1, subject: 'a professional at their desk' },
      ]),
      S('custom', 'how-we-work', 'First meeting, fees, confidentiality, what to bring.'),
      S('faq', 'faq', 'Fees, timelines, documents, confidentiality.'),
      S('testimonials', 'reviews', REVIEWS_BRIEF),
      S('cta', 'appointment', 'An invitation to arrange a first meeting.'),
      CONTACT,
    ],
  },
  fitness: {
    label: 'Sport',
    primaryAction: 'Reserver une seance',
    secondaryAction: 'Voir les tarifs',
    visualStyle: 'BOLD',
    palette: { primary: '#17181C', secondary: '#2E3136', accent: '#E0533A' },
    heroStyle: 'image',
    density: 'normal',
    sections: [
      HERO('the training floor in use'),
      S('services', 'classes', 'The classes and sessions offered, with level and duration.'),
      S('custom', 'pricing', 'Memberships and drop-in rates.'),
      S('about', 'coaches', 'The coaches and what they are qualified in.', [
        { kind: 'portrait', count: 1, subject: 'a coach training someone' },
      ]),
      S('gallery', 'gallery', 'The space and the sessions.', [
        { kind: 'lifestyle', count: 3, subject: 'a training session in progress' },
      ]),
      S('testimonials', 'reviews', REVIEWS_BRIEF),
      S('cta', 'trial', 'An invitation to book a first session.'),
      CONTACT,
    ],
  },
  automotive: {
    label: 'Automobile',
    primaryAction: 'Demander un devis',
    visualStyle: 'BOLD',
    palette: { primary: '#191A1D', secondary: '#35383D', accent: '#D2882B' },
    heroStyle: 'image',
    density: 'normal',
    sections: [
      HERO('the workshop with a vehicle on the lift'),
      S('services', 'services', 'The work carried out: servicing, repair, bodywork, tyres.'),
      S('custom', 'pricing', 'Standard jobs and what they cost, when known.'),
      S('about', 'garage', 'The garage, its people, how long it has been there.', [
        { kind: 'interior', count: 1, subject: 'the workshop' },
      ]),
      S('testimonials', 'reviews', REVIEWS_BRIEF),
      S('faq', 'faq', 'Lead times, courtesy car, guarantees, payment.'),
      S('cta', 'quote', 'An invitation to request a quote.'),
      CONTACT,
    ],
  },
  other: {
    label: 'Entreprise',
    primaryAction: 'Nous contacter',
    visualStyle: 'MODERN',
    palette: { primary: '#16181D', secondary: '#3A3E47', accent: '#4A6FA5' },
    heroStyle: 'image',
    density: 'normal',
    sections: [
      HERO('the place of work, in use'),
      S('services', 'services', 'What the business actually does, one item per offer.'),
      S('about', 'about', 'Who runs it, since when, and what they are known for.', [
        { kind: 'interior', count: 1, subject: 'the place of work' },
      ]),
      S('testimonials', 'reviews', REVIEWS_BRIEF),
      S('faq', 'faq', 'The questions a customer asks before buying.'),
      S('cta', 'contact-cta', 'An invitation to get in touch.'),
      CONTACT,
    ],
  },
};

/**
 * Build the blueprint for one business.
 *
 * Supplied products replace the generated offer section, and a business with
 * no gallery material does not get an empty gallery.
 */
export function planSite(input: {
  businessType?: string | null;
  description?: string | null;
  hasProducts?: boolean;
  hasGallery?: boolean;
  template?: string | null;
}): SiteBlueprint {
  const category = classifyBusiness(input.businessType, input.description);
  const plan = BLUEPRINTS[category];

  let sections = plan.sections;

  // Real products beat a generated offer list.
  if (input.hasProducts) {
    sections = sections.filter((s) => s.role !== 'services' && s.role !== 'menu-highlights');
    if (!sections.some((s) => s.type === 'products')) {
      sections = [
        sections[0],
        S('products', 'products', 'The products the user supplied. Enrich the descriptions only.'),
        ...sections.slice(1),
      ];
    }
  }

  // A gallery with nothing in it is worse than no gallery.
  if (input.hasGallery === false) {
    sections = sections.filter((s) => s.type !== 'gallery');
  }

  return { category, ...plan, sections };
}

export const BLUEPRINT_CATEGORIES = Object.keys(BLUEPRINTS) as BusinessCategory[];
