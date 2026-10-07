/**
 * One reel frame, as SVG.
 *
 * A reel scene is a photograph with type composed over it. Rather than ask a
 * model to write layout markup — which is how the poster generator ends up
 * failing three times and returning a 503 — each frame is composed here,
 * deterministically, at exactly 1080x1920.
 *
 * SVG because sharp rasterises it natively: no browser, no headless Chrome, no
 * font server. The photograph is embedded as a data URI so the rasteriser needs
 * no network at all.
 */

export interface ReelFrameInput {
  /** 1-based, shown as a progress pip row. */
  index: number;
  total: number;
  /** The scene's headline. Kept short by the script generator. */
  headline: string;
  /** Optional supporting line under the headline. */
  support?: string;
  /** Small label above the headline: "01 / 05", a section name, a price. */
  kicker?: string;
  /** Base64 JPEG/WebP of the scene photograph, already sized. */
  photo?: { base64: string; mime: string } | null;
  /** Brand identity. */
  brand: {
    primary: string;
    secondary: string;
    accent: string;
    fontFamily: string;
    name: string;
    logo?: { base64: string; mime: string } | null;
  };
  /** The final scene carries the call to action. */
  cta?: string;
  /**
   * Type only, on a transparent background: the overlay composited over a
   * video clip. The scrim stays, so the copy reads over moving footage.
   */
  overlayOnly?: boolean;
}

export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;

function esc(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Readable ink for text sitting on a brand colour. */
function onColor(hex: string): string {
  const v = String(hex || '').replace('#', '');
  if (v.length !== 6) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.05 ? '#ffffff' : '#111111';
}

/**
 * Break a headline into lines that fit the frame.
 *
 * SVG has no text wrapping, so the wrap is computed here from an average
 * glyph width. Erring narrow is deliberate: a line that overflows 1080px is
 * cropped by the viewport and unreadable, whereas a slightly short line is
 * merely a slightly short line.
 */
function wrap(text: string, fontSize: number, maxWidth: number): string[] {
  const clean = String(text || '').trim().replace(/\s+/g, ' ');
  if (!clean) return [];
  // Heavy uppercase display type averages ~0.58em per glyph.
  const perChar = fontSize * 0.58;
  const maxChars = Math.max(8, Math.floor(maxWidth / perChar));

  const lines: string[] = [];
  let line = '';
  for (const word of clean.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      // A single word longer than the line gets hard-split rather than clipped.
      if (word.length > maxChars) {
        let rest = word;
        while (rest.length > maxChars) {
          lines.push(rest.slice(0, maxChars - 1) + '-');
          rest = rest.slice(maxChars - 1);
        }
        line = rest;
      } else {
        line = word;
      }
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

/** Compose one 1080x1920 frame. */
export function renderReelFrame(input: ReelFrameInput): string {
  const { brand } = input;
  const W = REEL_WIDTH;
  const H = REEL_HEIGHT;
  const margin = 88;
  const safeWidth = W - margin * 2;

  // --- background -----------------------------------------------------------
  // Without a photograph the frame falls back to the brand colour rather than
  // an empty rectangle: a blank scene in a finished reel reads as a bug.
  const photo = input.overlayOnly
    ? ''
    : input.photo
    ? `<image href="data:${input.photo.mime};base64,${input.photo.base64}"
        x="0" y="0" width="${W}" height="${H}"
        preserveAspectRatio="xMidYMid slice"/>`
    : `<rect x="0" y="0" width="${W}" height="${H}" fill="${esc(brand.primary)}"/>`;

  // A flat scrim, heavier at the bottom where the type sits, so the photograph
  // stays visible at the top while the copy stays legible.
  const scrim = `
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0.15"/>
      <stop offset="45%" stop-color="#000" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.82"/>
    </linearGradient>`;

  // --- type -----------------------------------------------------------------
  const headlineSize = input.headline.length > 42 ? 84 : input.headline.length > 24 ? 100 : 118;
  const headlineLines = wrap(input.headline, headlineSize, safeWidth);
  const supportLines = input.support ? wrap(input.support, 44, safeWidth) : [];

  const blockBottom = input.cta ? H - 430 : H - 300;
  const supportHeight = supportLines.length * 60;
  const headlineHeight = headlineLines.length * headlineSize * 1.05;
  let y = blockBottom - supportHeight - headlineHeight;

  const kicker = input.kicker
    ? `<text x="${margin}" y="${y - 46}" fill="${esc(brand.accent)}"
         font-family="${esc(brand.fontFamily)}, Inter, Helvetica, Arial, sans-serif"
         font-size="34" font-weight="700" letter-spacing="6">${esc(input.kicker.toUpperCase())}</text>
       <rect x="${margin}" y="${y - 28}" width="76" height="5" fill="${esc(brand.accent)}"/>`
    : '';

  const headline = headlineLines
    .map((line, i) => {
      const lineY = y + headlineSize * 0.82 + i * headlineSize * 1.05;
      return `<text x="${margin}" y="${lineY}" fill="#ffffff"
        font-family="${esc(brand.fontFamily)}, Inter, Helvetica, Arial, sans-serif"
        font-size="${headlineSize}" font-weight="800" letter-spacing="-2">${esc(line)}</text>`;
    })
    .join('');

  y += headlineHeight + 24;
  const support = supportLines
    .map((line, i) => {
      const lineY = y + 40 + i * 60;
      return `<text x="${margin}" y="${lineY}" fill="#ffffff" fill-opacity="0.88"
        font-family="${esc(brand.fontFamily)}, Inter, Helvetica, Arial, sans-serif"
        font-size="44" font-weight="400">${esc(line)}</text>`;
    })
    .join('');

  // --- call to action -------------------------------------------------------
  const cta = input.cta
    ? `<rect x="${margin}" y="${H - 380}" rx="8" width="${Math.min(
        safeWidth,
        input.cta.length * 30 + 120,
      )}" height="118" fill="${esc(brand.accent)}"/>
       <text x="${margin + 56}" y="${H - 302}" fill="${onColor(brand.accent)}"
         font-family="${esc(brand.fontFamily)}, Inter, Helvetica, Arial, sans-serif"
         font-size="46" font-weight="700" letter-spacing="2">${esc(input.cta.toUpperCase())}</text>`
    : '';

  // --- progress pips --------------------------------------------------------
  // Short-form viewers expect to see how far through they are.
  const pipWidth = Math.floor((safeWidth - (input.total - 1) * 10) / Math.max(1, input.total));
  const pips = Array.from({ length: input.total }, (_, i) => {
    const x = margin + i * (pipWidth + 10);
    const done = i <= input.index - 1;
    return `<rect x="${x}" y="74" width="${pipWidth}" height="7" rx="3.5" fill="#ffffff" fill-opacity="${
      done ? '0.95' : '0.32'
    }"/>`;
  }).join('');

  // --- brand lockup ---------------------------------------------------------
  const logo = brand.logo
    ? `<image href="data:${brand.logo.mime};base64,${brand.logo.base64}"
        x="${margin}" y="${H - 190}" width="96" height="96"
        preserveAspectRatio="xMidYMid meet"/>
       <text x="${margin + 124}" y="${H - 126}" fill="#ffffff" fill-opacity="0.92"
         font-family="${esc(brand.fontFamily)}, Inter, Helvetica, Arial, sans-serif"
         font-size="40" font-weight="700">${esc(brand.name)}</text>`
    : `<text x="${margin}" y="${H - 126}" fill="#ffffff" fill-opacity="0.92"
         font-family="${esc(brand.fontFamily)}, Inter, Helvetica, Arial, sans-serif"
         font-size="40" font-weight="700" letter-spacing="1">${esc(brand.name)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
  width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${scrim}</defs>
  ${photo}
  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#scrim)"/>
  ${pips}
  ${kicker}
  ${headline}
  ${support}
  ${cta}
  ${logo}
</svg>`;
}
