import { colourRoles, contrast, illegibleTextColours } from './poster-contrast';

const doc = (css: string) => `<!DOCTYPE html><html><head><style>${css}</style></head><body><main class="poster"></main></body></html>`;

describe('poster legibility', () => {
  it('rejects the poster from the live test: navy text on a navy ground', () => {
    // The stylesheet the model actually wrote (trimmed).
    const html = doc(`
      :root{--primary-color:#1a1a2e;--background-color:#16213e;--accent-color:#e94560;}
      body{background-color:var(--background-color);}
      main.poster{color:var(--primary-color);}
      footer{color:var(--accent-color);}
      @media print{main.poster{color:#000000;background:#ffffff;}}`);
    const bad = illegibleTextColours(html);
    expect(bad.map((b) => b.colour)).toEqual(['#1a1a2e']);
    expect(bad[0].ratio).toBeLessThan(1.5);
  });

  it('accepts dark ink on a light ground', () => {
    const html = doc(`.poster{background:#F3EEE6;color:#1F2328;} h1{color:#B5482F;}`);
    expect(illegibleTextColours(html)).toEqual([]);
  });

  it('accepts light text meant for a dark scrim over the photograph', () => {
    // Seen live: "#f5f5f5 on #F5F5F5" rejected a poster whose text sat on a dark scrim.
    const html = doc(`.poster{background:#F5F5F5;} .on-photo{color:#f5f5f5;}`);
    expect(illegibleTextColours(html).length).toBe(1);
    expect(illegibleTextColours(html, ['#1A1A1A'])).toEqual([]);
  });

  it('does not judge colours it cannot resolve', () => {
    const html = doc(`.poster{background:url(x.webp);} h1{color:rgba(255,255,255,.9);}`);
    expect(illegibleTextColours(html)).toEqual([]);
  });

  it('never hands the model two dark colours as ink and ground', () => {
    const roles = colourRoles('#1a1a2e', '#16213e', '#e94560');
    expect(roles.ground).toBe('#16213e');
    expect(roles.ink).toBe('#FFFFFF');
    expect(contrast(roles.ink, roles.ground)!).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the brand ink when it already reads on the ground', () => {
    const roles = colourRoles('#1F2328', '#F3EEE6', '#B5482F');
    expect(roles.ink).toBe('#1F2328');
    expect(roles.inkContrast).toBeGreaterThanOrEqual(4.5);
  });
});
