import { posterFoundation, typeScale, withFoundation } from './poster-foundation';
import { illegibleTextColours } from './poster-contrast';

const portrait = { width: 1080, height: 1350 };
const landscape = { width: 1200, height: 628 };

describe('poster foundation', () => {
  it('uses a designer scale when the form sends its untouched defaults', () => {
    // The form always posts 64/28/16/13; those used to be forced with !important.
    const s = typeScale(portrait, { title: 64, subtitle: 28, body: 16, detail: 13 });
    expect(s.title).toBe(11);
    expect(s.title / s.body).toBeGreaterThanOrEqual(3);
  });

  it('honours sizes the user actually chose, relative to the poster width', () => {
    expect(typeScale(portrait, { title: 120 }).title).toBe(11.1); // 120px of 1080
  });

  it('gives a landscape banner a smaller headline than a portrait poster', () => {
    expect(typeScale(landscape).title).toBeLessThan(typeScale(portrait).title);
  });

  it('loads the brand fonts and defines the scale on the poster', () => {
    const css = posterFoundation({
      format: portrait, headingFont: 'Fraunces', bodyFont: 'Inter',
      ground: '#F3EEE6', ink: '#1F2328', accent: '#B5482F',
    });
    expect(css).toContain('family=Fraunces:wght@');
    expect(css).toContain('family=Inter:wght@');
    expect(css).toContain('container-type:inline-size');
    expect(css).toContain('--step-title:11cqw');
    expect(css).toContain('aspect-ratio:1080/1350');
  });

  it('goes first in <head> so the model stylesheet builds on it', () => {
    const html = withFoundation('<!DOCTYPE html><html><head><style>.x{}</style></head><body></body></html>', '<style id="poster-foundation"></style>');
    expect(html.indexOf('poster-foundation')).toBeLessThan(html.indexOf('.x{}'));
  });

  it('lets the contrast check read the ground from the foundation', () => {
    const foundation = posterFoundation({
      format: portrait, headingFont: 'Inter', bodyFont: 'Inter',
      ground: '#1A1A1A', ink: '#FFFFFF', accent: '#FF6F61',
    });
    // The model wrote dark text and left the ground to the foundation.
    const bad = withFoundation(
      '<!DOCTYPE html><html><head><style>.poster h1{color:#222222}</style></head><body><main class="poster"></main></body></html>',
      foundation,
    );
    expect(illegibleTextColours(bad).map((b) => b.colour)).toEqual(['#222222']);
  });
});
