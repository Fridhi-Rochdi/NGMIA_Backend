/**
 * The typographic and spatial foundation every generated poster is built on.
 *
 * The model used to start each poster from nothing: it picked pixel font
 * sizes, margins and line-heights itself, so quality depended on the roll.
 * Worse, a post-processing step then forced every h1 to 64px and every
 * paragraph to 16px with !important, flattening whatever hierarchy the model
 * had designed, identically for a square, a story and an A3.
 *
 * This supplies what a studio's poster template would: the brand fonts
 * loaded, a type scale and a spacing scale proportional to the poster width
 * (container query units, so the poster scales like an image from preview to
 * print), safe margins, professional leading and tracking, and the computed
 * ink/ground/accent colours. The model composes with these variables instead
 * of inventing them.
 */

export interface PosterFormat {
  width: number;
  height: number;
}

/** The sizes the poster form sends when the user has not moved a slider. */
const FORM_DEFAULTS: Record<string, number> = { title: 64, subtitle: 28, body: 16, detail: 13 };

/**
 * Type scale in cqw (percent of the poster width).
 *
 * Defaults are a designer's scale for the format: a portrait or story poster
 * carries a bigger headline than a landscape banner, which has little height.
 * Sizes the user actually chose on the form are honoured, read as pixels on
 * the full-size poster.
 */
export function typeScale(
  format: PosterFormat,
  fontSizes?: Record<string, number> | null,
): Record<'display' | 'title' | 'subtitle' | 'body' | 'detail', number> {
  const ratio = format.height / format.width;
  const base =
    ratio >= 1.5
      ? { title: 12, subtitle: 4.6, body: 3.1, detail: 2.3 } // story
      : ratio >= 1.15
        ? { title: 11, subtitle: 4.2, body: 2.8, detail: 2.1 } // portrait, A4, A3
        : ratio >= 0.9
          ? { title: 9.5, subtitle: 3.8, body: 2.6, detail: 2 } // square
          : { title: 6.4, subtitle: 2.7, body: 1.9, detail: 1.5 }; // landscape banner

  const chosen = (key: keyof typeof base): number => {
    const value = Number(fontSizes?.[key]);
    if (!Number.isFinite(value) || value <= 0 || value === FORM_DEFAULTS[key]) return base[key];
    return Math.round((value / format.width) * 1000) / 10;
  };

  const title = chosen('title');
  return {
    display: Math.round(title * 1.3 * 10) / 10,
    title,
    subtitle: chosen('subtitle'),
    body: chosen('body'),
    detail: chosen('detail'),
  };
}

function googleFontsHref(families: string[]): string {
  const unique = Array.from(new Set(families.map((f) => f.trim()).filter(Boolean)));
  const params = unique
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;500;600;700;800`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

/** A generic family to fall back on, so a font that fails to load degrades gracefully. */
function fallbackFor(family: string): string {
  return /serif|garamond|baskerville|playfair|lora|merriweather|fraunces|cormorant|dm serif/i.test(family) &&
    !/sans/i.test(family)
    ? 'Georgia, serif'
    : 'system-ui, sans-serif';
}

export interface FoundationInput {
  format: PosterFormat;
  headingFont: string;
  bodyFont: string;
  ground: string;
  ink: string;
  accent: string;
  fontSizes?: Record<string, number> | null;
}

/** The `<link>` and `<style>` to place first in the poster's `<head>`. */
export function posterFoundation(input: FoundationInput): string {
  const s = typeScale(input.format, input.fontSizes);
  const heading = input.headingFont || 'Inter';
  const body = input.bodyFont || heading;
  return `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${googleFontsHref([heading, body])}">
<style id="poster-foundation">
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{background:${input.ground}}
body{min-height:100vh;display:grid;place-items:center}
.poster{
  width:min(100%, ${input.format.width}px);aspect-ratio:${input.format.width}/${input.format.height};
  position:relative;overflow:hidden;container-type:inline-size;
  --ground:${input.ground};--ink:${input.ink};--accent:${input.accent};
  --ink-soft:color-mix(in srgb, var(--ink) 74%, var(--ground));
  --rule:color-mix(in srgb, var(--ink) 18%, transparent);
  --font-display:'${heading}', ${fallbackFor(heading)};
  --font-text:'${body}', ${fallbackFor(body)};
  --step-display:${s.display}cqw;--step-title:${s.title}cqw;--step-subtitle:${s.subtitle}cqw;
  --step-body:${s.body}cqw;--step-detail:${s.detail}cqw;
  --space-1:1cqw;--space-2:2cqw;--space-3:3.5cqw;--space-4:5.5cqw;--space-5:8cqw;--space-6:12cqw;
  --margin:7cqw;
  background:var(--ground);color:var(--ink);font-family:var(--font-text);
  font-kerning:normal;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
}
.poster :is(h1,h2,h3){font-family:var(--font-display);font-weight:700;text-wrap:balance}
.poster h1{font-size:var(--step-title);line-height:1;letter-spacing:-0.025em}
.poster h2{font-size:var(--step-subtitle);line-height:1.12;letter-spacing:-0.012em}
.poster h3{font-size:var(--step-body);line-height:1.2}
.poster :is(p,li){font-size:var(--step-body);line-height:1.45;text-wrap:pretty;max-width:34ch}
.poster img{display:block;max-width:100%}
@media print{html,body{background:#fff}body{display:block}.poster{width:100%}}
</style>`;
}

/** Put the foundation first in `<head>`, so the model's own stylesheet builds on it. */
export function withFoundation(html: string, foundation: string): string {
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, (m) => `${m}\n${foundation}`);
  return `${foundation}\n${html}`;
}
