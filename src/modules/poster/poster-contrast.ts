/**
 * Colour legibility for generated posters.
 *
 * The poster HTML is written by a model and there is no browser on the server
 * to look at it, so legibility has to be decided from the colours alone:
 * which colour is the ground, which is the ink, and whether the stylesheet the
 * model wrote puts its text on a ground it can be read against.
 *
 * A poster passed every check with dark-navy text on a navy ground (about
 * 1.1:1) because nothing measured it.
 */

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function rgb(hex: string): [number, number, number] | null {
  const v = String(hex || '').trim();
  if (!HEX.test(v)) return null;
  const h = v.length === 4 ? v.slice(1).replace(/./g, (c) => c + c) : v.slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number | null {
  const c = rgb(hex);
  if (!c) return null;
  const [r, g, b] = c.map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, or null when either colour is not a hex. */
export function contrast(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export interface PosterColourRoles {
  /** The poster's ground. */
  ground: string;
  /** Main text colour, guaranteed readable on the ground. */
  ink: string;
  /** Highlight colour; only for large text when its contrast is below 4.5. */
  accent: string;
  inkContrast: number;
  accentContrast: number;
}

/**
 * Decide ground and ink from the brand colours.
 *
 * The secondary colour is the ground. The ink is whichever brand colour reads
 * best on it; when neither reaches 4.5:1 (two dark brand colours, typically),
 * near-black or white is used instead, whichever reads better.
 */
export function colourRoles(primary: string, secondary: string, accent: string): PosterColourRoles {
  const ground = rgb(secondary) ? secondary : '#F4EFE6';
  const candidates = [primary, accent].filter((c) => rgb(c));
  let ink = candidates
    .map((c) => ({ c, r: contrast(c, ground) || 0 }))
    .sort((a, b) => b.r - a.r)[0];
  if (!ink || ink.r < 4.5) {
    const dark = { c: '#141414', r: contrast('#141414', ground) || 0 };
    const light = { c: '#FFFFFF', r: contrast('#FFFFFF', ground) || 0 };
    ink = dark.r >= light.r ? dark : light;
  }
  const accentColour = rgb(accent) ? accent : ink.c;
  return {
    ground,
    ink: ink.c,
    accent: accentColour,
    inkContrast: Math.round(ink.r * 10) / 10,
    accentContrast: Math.round((contrast(accentColour, ground) || 0) * 10) / 10,
  };
}

/** `--name: #hex` declarations, so `var(--name)` can be resolved. */
function variables(css: string): Map<string, string> {
  const vars = new Map<string, string>();
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-f]{3,6})\b/gi)) vars.set(m[1], m[2]);
  return vars;
}

function resolve(value: string, vars: Map<string, string>): string | null {
  const v = value.trim();
  const direct = /^#[0-9a-f]{3,6}\b/i.exec(v)?.[0];
  if (direct && HEX.test(direct)) return direct;
  const name = /var\(\s*(--[\w-]+)/.exec(v)?.[1];
  return name ? vars.get(name) || null : null;
}

/**
 * Text colours in the stylesheet that do not read on the poster's ground.
 *
 * The ground is the background of `.poster` (or of `body` when the poster
 * leaves it transparent). Every `color:` the stylesheet declares outside
 * `@media print` is checked against it at 3:1, the WCAG floor for large
 * text: a poster is mostly large text, and a stricter floor would reject
 * legitimate accent headings. Colours that cannot be resolved to a hex
 * (rgba, currentColor, named colours) are not judged.
 *
 * `otherGrounds` are surfaces text may legitimately sit on besides the
 * poster ground: with a photograph, light text on a dark scrim over the
 * picture is correct, and judging it against the light ground alone rejected
 * a sound poster ("#f5f5f5 on #F5F5F5"). A colour passes if it reads on any.
 */
export function illegibleTextColours(
  html: string,
  otherGrounds: string[] = [],
): { colour: string; ground: string; ratio: number }[] {
  const css = (html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) || [])
    .map((s) => s.replace(/<\/?style\b[^>]*>/gi, ''))
    .join('\n')
    // Print styles are for paper, not for the rendered poster.
    .replace(/@media\s+print\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gi, '');
  const vars = variables(css);

  const backgroundOf = (selector: RegExp): string | null => {
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!selector.test(rule[1])) continue;
      const decl = /background(?:-color)?\s*:\s*([^;]+)/i.exec(rule[2]);
      if (!decl) continue;
      const colour = resolve(decl[1], vars);
      if (colour) return colour;
    }
    return null;
  };

  const ground = backgroundOf(/\.poster\b/) || backgroundOf(/(^|[\s,])body\b/);
  if (!ground) return [];

  const bad = new Map<string, number>();
  for (const m of css.matchAll(/(?:^|[;{\s])color\s*:\s*([^;}]+)/gi)) {
    const colour = resolve(m[1], vars);
    if (!colour) continue;
    const ratio = contrast(colour, ground);
    const readsElsewhere = otherGrounds.some((g) => (contrast(colour, g) ?? 0) >= 3);
    if (ratio !== null && ratio < 3 && !readsElsewhere) {
      bad.set(colour.toLowerCase(), Math.round(ratio * 100) / 100);
    }
  }
  return Array.from(bad, ([colour, ratio]) => ({ colour, ground, ratio }));
}
