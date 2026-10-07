import { extractPalette } from './palette';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');

/** A logo: a green disc and a small gold bar on a white plate. */
async function logo(plate = '#ffffff') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <rect width="200" height="200" fill="${plate}"/>
    <circle cx="100" cy="90" r="60" fill="#1f6b3a"/>
    <rect x="50" y="165" width="100" height="16" fill="#d9a52b"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe('extractPalette', () => {
  const near = (hex: string, target: string) => {
    const d = [1, 3, 5].map((i) => Math.abs(parseInt(hex.slice(i, i + 2), 16) - parseInt(target.slice(i, i + 2), 16)));
    return Math.max(...d) <= 12;
  };

  it('reads the dominant colour as primary and the other one as accent, ignoring the white plate', async () => {
    const p = await extractPalette(await logo());
    expect(p).not.toBeNull();
    expect(near(p!.primary, '#1f6b3a')).toBe(true);
    expect(near(p!.accent, '#d9a52b')).toBe(true);
    expect(p!.secondary).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('ignores a coloured plate the logo sits on', async () => {
    const p = await extractPalette(await logo('#f1e7d2'));
    expect(near(p!.primary, '#1f6b3a')).toBe(true);
  });

  it('returns null for a blank image', async () => {
    const blank = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#ffffff' } }).png().toBuffer();
    expect(await extractPalette(blank)).toBeNull();
  });
});
