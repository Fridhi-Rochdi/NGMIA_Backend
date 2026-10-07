// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');

export interface BrandPalette {
  primary: string;
  secondary: string;
  accent: string;
}

interface Swatch {
  r: number;
  g: number;
  b: number;
  count: number;
  saturation: number;
  lightness: number;
}

const toHex = ({ r, g, b }: { r: number; g: number; b: number }) =>
  `#${[r, g, b].map((v) => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

function hsl(r: number, g: number, b: number) {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));
  return { saturation, lightness };
}

const distance = (a: Swatch, b: Swatch) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

/** A shade of `c` at a given lightness, for when the logo has a single colour. */
function shade(c: Swatch, factor: number): string {
  return toHex({ r: c.r * factor, g: c.g * factor, b: c.b * factor });
}

/**
 * The brand colours of a logo.
 *
 * A logo is mostly background — white, transparent or a flat plate — and a
 * few deliberate colours. Pixels are bucketed (5 bits per channel), the
 * background is discarded (transparent pixels, near-white, and the colour of
 * the image border), and the remaining buckets are ranked:
 *
 *  - primary: the most present real colour, the one people remember;
 *  - accent: the most saturated colour clearly different from the primary;
 *  - secondary: a dark colour for text and backgrounds — the logo's own when
 *    it has one, otherwise a deep shade of the primary.
 *
 * Returns null for an image with no usable colour (blank, all white).
 */
export async function extractPalette(input: Buffer): Promise<BrandPalette | null> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .resize(96, 96, { fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const buckets = new Map<number, Swatch>();
  const border = new Map<number, number>();
  const key = (r: number, g: number, b: number) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const i = (y * info.width + x) * 4;
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a < 128) continue;
      const k = key(r, g, b);
      if (x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1) {
        border.set(k, (border.get(k) || 0) + 1);
      }
      const s = buckets.get(k) || { r: 0, g: 0, b: 0, count: 0, saturation: 0, lightness: 0 };
      s.r += r;
      s.g += g;
      s.b += b;
      s.count += 1;
      buckets.set(k, s);
    }
  }

  // The colour that fills the border is the plate the logo sits on.
  const perimeter = 2 * (info.width + info.height);
  const plate = [...border.entries()].sort((a, b) => b[1] - a[1])[0];
  const plateKey = plate && plate[1] > perimeter * 0.35 ? plate[0] : null;

  const swatches: Swatch[] = [];
  for (const [k, s] of buckets) {
    if (k === plateKey) continue;
    const c = { ...s, r: s.r / s.count, g: s.g / s.count, b: s.b / s.count };
    Object.assign(c, hsl(c.r, c.g, c.b));
    if (c.lightness > 0.94) continue; // paper white
    swatches.push(c);
  }
  const total = swatches.reduce((n, s) => n + s.count, 0);
  if (!total) return null;

  // Ignore specks: anti-aliasing produces hundreds of one-pixel buckets.
  const visible = swatches.filter((s) => s.count / total > 0.01).sort((a, b) => b.count - a.count);
  if (!visible.length) return null;

  const chromatic = visible.filter((s) => s.saturation > 0.2 && s.lightness > 0.12 && s.lightness < 0.88);
  const primary = chromatic[0] || visible[0];

  const accent =
    [...chromatic]
      .filter((s) => distance(s, primary) > 90)
      .sort((a, b) => b.saturation * Math.sqrt(b.count) - a.saturation * Math.sqrt(a.count))[0] || null;

  const dark = visible.find((s) => s.lightness < 0.25 && distance(s, primary) > 40) || null;

  return {
    primary: toHex(primary),
    secondary: dark ? toHex(dark) : shade(primary, 0.35),
    accent: accent ? toHex(accent) : shade(primary, primary.lightness > 0.5 ? 0.7 : 1.45),
  };
}
