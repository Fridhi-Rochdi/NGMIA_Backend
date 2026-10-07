/**
 * Every art-direction style, checked against the image provider's safety filter.
 *
 * A blocked generation does not error: it answers 200 with a pure black
 * 1024x1024 image and `finishReason: "CONTENT_FILTERED"`. Nothing read that
 * field, so those black rectangles were stored and published as dish
 * photographs, poster visuals and reel frames — the CLASSIC style tripped on
 * "still-life photograph in the Dutch master tradition", and every classic
 * brand's imagery was black.
 *
 * The wording is deterministic, so this is worth running whenever the art
 * direction changes.
 *
 *   npm run test:art
 */
import 'dotenv/config';
import { buildArtDirection, composePrompt } from '../src/common/brand-kit/art-direction';

const KEY = process.env.NVIDIA_NIM_API_KEY!;
const BASE = process.env.NVIDIA_NIM_IMAGE_BASE_URL || 'https://ai.api.nvidia.com/v1/genai';
const MODEL = process.env.NVIDIA_NIM_IMAGE_MODEL || 'black-forest-labs/flux.1-dev';

const STYLES = ['MODERN', 'CLASSIC', 'MINIMAL', 'BOLD', 'ELEGANT', 'RUSTIC'] as const;
const SUBJECT = 'a margherita pizza on a wooden board';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failures = 0;

async function finishReason(prompt: string, tries = 3): Promise<string> {
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    const res = await fetch(`${BASE}/${MODEL}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      // flux.1-dev rejects steps below 5 outright.
      body: JSON.stringify({ prompt, width: 1024, height: 1024, steps: 8, seed: 12345 }),
      signal: AbortSignal.timeout(180_000),
    });
    if (res.status === 429) {
      await sleep(8000 * attempt);
      continue;
    }
    if (!res.ok) return `HTTP ${res.status}`;
    const data: any = await res.json();
    return data?.artifacts?.[0]?.finishReason || 'INCONNU';
  }
  return 'RATE_LIMITED';
}

async function main() {
  console.log(`\nModele: ${MODEL}`);
  console.log(`Sujet : "${SUBJECT}"\n`);

  for (const style of STYLES) {
    const direction = buildArtDirection({
      brandKey: `check:${style}`,
      style,
      colors: ['#8B0000', '#F5F5DC', '#C27A2C'],
    });
    const prompt = composePrompt(direction, 'lifestyle', SUBJECT);
    const reason = await finishReason(prompt);
    const ok = reason === 'SUCCESS';
    if (!ok) failures += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${style.padEnd(8)} ${reason}`);
    if (!ok && reason === 'CONTENT_FILTERED') {
      console.log(`       direction: ${direction.medium}`);
    }
    await sleep(2500);
  }

  console.log(
    failures === 0
      ? '\nAucun style bloque par le filtre.\n'
      : `\n${failures} style(s) bloque(s): leurs images seraient noires.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
