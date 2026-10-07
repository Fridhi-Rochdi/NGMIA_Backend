import { readFileSync } from 'fs';
import { join } from 'path';
import { WEBSITE_UTILITIES_CSS } from './website-utilities.css';

/**
 * The compiled utilities must cover every colour class the renderer writes.
 *
 * The stylesheet is compiled by hand (`npm run build:css`) and had drifted: the
 * renderer moved the hero subtitle to `text-white/90`, the CSS still only had
 * `/80`, so the class matched nothing and the subtitle fell back to dark ink on
 * a dark photograph. Nothing failed; the text just became unreadable.
 */
describe('compiled website utilities', () => {
  const renderer = readFileSync(join(__dirname, 'website-renderer.service.ts'), 'utf8');

  // Static class tokens (no template interpolation) that colour things.
  const colourClasses = Array.from(
    new Set(
      Array.from(renderer.matchAll(/class="([^"$]*)"/g))
        .flatMap((m) => m[1].split(/\s+/))
        .map((token) => token.trim())
        .filter((token) => /^(?:[a-z]+:)*(?:text|bg|border)-(?:white|black)(?:\/\d+)?$/.test(token)),
    ),
  );

  const selector = (token: string) => `.${token.replace(/([:/])/g, '\\$1')}`;

  it('finds the colour classes it is meant to guard', () => {
    expect(colourClasses).toEqual(expect.arrayContaining(['text-white/90', 'text-white/75']));
  });

  it.each(colourClasses)('%s exists in the compiled CSS (else run npm run build:css)', (token) => {
    expect(WEBSITE_UTILITIES_CSS).toContain(selector(token));
  });
});
