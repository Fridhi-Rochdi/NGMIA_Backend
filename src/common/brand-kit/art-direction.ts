/**
 * The art-direction contract.
 *
 * Every image the platform generates — hero shots, dish photos, product packs,
 * poster visuals, social cards — is rendered from ONE of these per brand. That
 * is what stops a menu from mixing a studio-lit burger with a moody film-grain
 * pizza: the subject changes, the direction never does.
 *
 * It is derived deterministically (no LLM call, no cost, no drift) from the
 * business type and the chosen visual style, then frozen on the brand kit.
 */

export type VisualStyleKey =
  | 'MODERN'
  | 'CLASSIC'
  | 'MINIMAL'
  | 'BOLD'
  | 'ELEGANT'
  | 'RUSTIC';

/** What the image is FOR. Framing and background follow from this, not from taste. */
export type ShotKind =
  | 'hero' // wide establishing shot, room to overlay type
  | 'dish' // one plate/product, menu card crop
  | 'product' // packshot on a clean surface
  | 'detail' // texture / hands / close crop, used as filler
  | 'portrait' // a person at work
  | 'interior' // the place itself
  | 'lifestyle' // the product in use
  | 'background' // deliberately empty, for text to sit on
  | 'poster'; // a single strong subject, poster composition

export interface ArtDirection {
  /** Human-readable name, shown in the UI so the user knows what they got. */
  name: string;
  /** Film/quality stock words — the single biggest lever on perceived quality. */
  medium: string;
  lighting: string;
  palette: string;
  surface: string;
  mood: string;
  lens: string;
  grade: string;
  /**
   * The closing constraints, appended to every prompt.
   *
   * FLUX has no negative prompt: every word here is read as something to
   * draw. The twenty-item "no text, no logo, no watermark, no lens flare, no
   * bokeh balls…" lists named, and so primed, exactly what they forbade, and
   * pushed the subject out of the part of the prompt the model weighs most.
   * They are now a short positive description of the clean result.
   */
  negatives: string;
  /** Keeps a brand's images in the same family across separate generations. */
  seedBase: number;
}

/** Shared by every style: what a clean, usable brand photograph looks like. */
const CLEAN =
  'plain unlettered surfaces without any writing or watermark, one single subject, ' +
  'well-formed hands, uncluttered frame';

const STYLES: Record<VisualStyleKey, Omit<ArtDirection, 'palette' | 'seedBase'>> = {
  MODERN: {
    name: 'Editorial contemporain',
    medium: 'editorial photograph, shot on a full-frame digital camera, razor sharp',
    lighting: 'large soft north-facing window light from the left, gentle falloff, soft shadows',
    surface: 'pale microcement and light oak surfaces, uncluttered',
    mood: 'calm, precise, contemporary',
    lens: '50mm, f/2.8, eye-level',
    grade: 'neutral white balance, true-to-life colour, low contrast, no filter look',
    negatives:
      CLEAN + ', true-to-life colour, candid subjects looking away from the camera',
  },
  CLASSIC: {
    name: 'Nature morte classique',
    // "Dutch master" + "still-life" trips the provider's safety classifier —
    // classical painting correlates with academic nudes in its training — and a
    // blocked generation comes back as a pure black 1024x1024 image. Every
    // CLASSIC dish photo, poster visual and reel frame was that black rectangle.
    // The look is described directly instead of by art-historical reference.
    medium: 'styled still-life food photograph, medium format, fine grain',
    // Three darkness cues used to stack here — "deep controlled shadows",
    // "chiaroscuro" and "rich deep shadows" — and the model obeyed all three:
    // dishes came back at a mean luminance around 39/255, far too dark to sell
    // food. The mood is kept, but the subject is now explicitly lit.
    lighting:
      'single directional window light, soft fill on the shadow side, ' +
      'the subject clearly lit and legible',
    surface: 'aged walnut table, linen cloth, patinated brass',
    mood: 'warm, timeless, composed',
    lens: '80mm, f/4, three-quarter high angle',
    grade: 'warm amber highlights, gentle contrast, subtle film grain, well exposed',
    negatives:
      CLEAN + ', period-appropriate natural materials',
  },
  MINIMAL: {
    name: 'Minimal studio',
    medium: 'minimalist studio photograph, very high resolution, clinically sharp',
    lighting: 'broad even overhead softbox, almost shadowless, one soft contact shadow',
    surface: 'seamless off-white paper sweep, generous empty space',
    mood: 'quiet, exact, restrained',
    lens: '85mm, f/5.6, straight-on',
    grade: 'cool neutral, high key, very low contrast, no filter look',
    negatives:
      CLEAN + ', nothing else in frame, plain seamless ground',
  },
  BOLD: {
    name: 'Graphique contraste',
    medium: 'high-impact commercial photograph, crisp, poster-grade',
    lighting: 'single hard key light, crisp defined shadow, strong directional',
    surface: 'flat saturated colour backdrop, one solid block of colour',
    mood: 'confident, graphic, energetic',
    lens: '35mm, f/8, slightly low angle',
    grade: 'punchy contrast, clean saturated colour, pure blacks',
    negatives:
      CLEAN + ', flat colour ground without glow',
  },
  ELEGANT: {
    name: 'Luxe discret',
    medium: 'luxury campaign photograph, medium format, exquisite detail',
    lighting: 'low-key rim light with a soft fill, sculpted, pools of shadow',
    surface: 'honed dark stone, smoked glass, matte black metal',
    mood: 'refined, discreet, expensive',
    lens: '100mm, f/2.8, slightly above',
    grade: 'deep blacks, restrained warm highlights, no crushed detail',
    negatives:
      CLEAN + ', matte restrained finish',
  },
  RUSTIC: {
    name: 'Artisanal',
    medium: 'documentary food photograph, 35mm film, natural grain',
    lighting: 'overcast daylight through a workshop window, soft wrap, honest shadows',
    surface: 'reclaimed wood, unglazed stoneware, flour-dusted linen',
    mood: 'honest, handmade, unpolished',
    lens: '35mm, f/2, close and slightly tilted',
    grade: 'warm earthy tones, muted greens, gentle film grain',
    negatives:
      CLEAN + ', natural handmade materials only',
  },
};

/** Framing rules per shot kind — applied on top of the brand direction. */
const FRAMING: Record<ShotKind, string> = {
  hero: 'wide establishing shot, subject offset to one side, generous negative space on the opposite side for a text overlay, horizontal composition',
  dish: 'one single plated portion centred in frame, 45-degree angle, shallow depth of field, tight crop, nothing else in shot',
  product: 'one single product centred, straight-on packshot, full product visible, even margins',
  detail: 'extreme close-up on texture and material, macro, abstract crop',
  portrait:
    'one person at work, hands and craft visible, candid, not looking at the camera, waist-up',
  interior: 'wide interior view of the space, natural perspective, no people in frame',
  lifestyle: 'the product in real use, candid documentary moment, environment visible',
  background:
    'deliberately empty composition, texture and light only, no focal subject, flat even field for text to sit on top',
  poster:
    'one single bold subject dead centre, dramatic isolation, strong silhouette, clean uncluttered surround',
};

/** Shots of an object on a surface — the only ones the brand surface applies to. */
const TABLETOP = new Set<ShotKind>(['dish', 'product', 'detail', 'poster']);

/** Stable 31-bit hash — the same brand always seeds the same image family. */
function seedFrom(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 2147483647;
}

function normaliseStyle(value?: string | null): VisualStyleKey {
  const key = String(value || '').toUpperCase();
  return (key in STYLES ? key : 'MODERN') as VisualStyleKey;
}

/**
 * Turn brand colours into words a diffusion model actually understands.
 * A hex code in a prompt is noise; "deep forest green with warm brass" is not.
 */
export function describePalette(colors: (string | undefined | null)[]): string {
  const named = colors
    .filter((c): c is string => typeof c === 'string' && /^#?[0-9a-f]{6}$/i.test(c.trim()))
    .slice(0, 3)
    .map((c) => colourName(c.trim()));
  if (!named.length) return 'restrained natural colour';
  if (named.length === 1) return `${named[0]}`;
  return `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
}

function colourName(hex: string): string {
  const v = hex.replace('#', '');
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

  if (s < 0.12) {
    if (l > 0.85) return 'off-white';
    if (l > 0.6) return 'light grey';
    if (l > 0.35) return 'mid grey';
    if (l > 0.12) return 'charcoal';
    return 'near-black';
  }

  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;

  const hue =
    h < 15 || h >= 345
      ? 'red'
      : h < 40
        ? 'terracotta'
        : h < 65
          ? 'amber'
          : h < 90
            ? 'olive'
            : h < 160
              ? 'green'
              : h < 195
                ? 'teal'
                : h < 250
                  ? 'blue'
                  : h < 290
                    ? 'violet'
                    : h < 330
                      ? 'plum'
                      : 'crimson';

  const tone = l < 0.3 ? 'deep ' : l > 0.72 ? 'pale ' : s > 0.6 ? 'vivid ' : 'muted ';
  return `${tone}${hue}`;
}

/** Build the brand's single art direction. Deterministic: same input, same look. */
export function buildArtDirection(input: {
  brandKey: string;
  style?: string | null;
  colors?: (string | undefined | null)[];
}): ArtDirection {
  const style = STYLES[normaliseStyle(input.style)];
  return {
    ...style,
    palette: describePalette(input.colors || []),
    seedBase: seedFrom(input.brandKey || 'brand'),
  };
}

/**
 * Compose the final prompt for one image.
 *
 * Order matters for diffusion models: subject first, then medium, then light,
 * then the constraints. `subject` is the ONLY part that varies between two
 * images of the same brand.
 */
export function composePrompt(
  direction: ArtDirection,
  kind: ShotKind,
  subject: string,
  extra?: string,
): string {
  return [
    subject.trim().replace(/[.\s]+$/, ''),
    FRAMING[kind],
    direction.medium,
    direction.lighting,
    // A tabletop surface ("seamless off-white paper sweep", "honed dark
    // stone") only makes sense under an object. Applied to an interior, a
    // portrait or a hero it contradicted the framing and flattened the room.
    TABLETOP.has(kind) ? direction.surface : '',
    `${direction.palette} palette`,
    direction.mood,
    direction.lens,
    direction.grade,
    extra?.trim(),
    direction.negatives,
  ]
    .filter(Boolean)
    .join(', ');
}

/** A per-image seed that stays inside the brand's family. */
export function seedFor(direction: ArtDirection, subject: string): number {
  return (direction.seedBase + seedFrom(subject)) % 2147483647;
}

export const VISUAL_STYLE_KEYS = Object.keys(STYLES) as VisualStyleKey[];

export function artDirectionName(style?: string | null): string {
  return STYLES[normaliseStyle(style)].name;
}
