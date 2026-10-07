/**
 * End-to-end check of the reel encoder: voice synthesis -> timed scenes ->
 * encoded MP4 -> verification that the file really carries both streams.
 *
 * This is the check that would have caught the original defect, where a reel
 * encoded "successfully" and played silent. Asserting on the produced file's
 * streams is the only way to know a voice track survived the mux.
 *
 *   npm run test:reel:voice
 */
import { StorageService } from '../src/common/storage/storage.service';
import { ReelShot, ReelVideoService } from '../src/modules/reels/reel-video.service';
import { VoiceoverService } from '../src/modules/reels/voiceover.service';

const LINES = [
  'Chaque matin, le poisson arrive du port avant l ouverture.',
  'Nos braises attendent, le service commence a midi.',
  'Reservez votre table des ce soir.',
];

/** A readable stand-in for a composed scene frame. */
function frameSvg(index: number, headline: string): string {
  const hues = ['#173B2F', '#8C3A2B', '#1F2A44'];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
  <rect width="1080" height="1920" fill="${hues[index % hues.length]}"/>
  <circle cx="540" cy="700" r="260" fill="#ffffff" opacity="0.08"/>
  <text x="80" y="1500" font-family="Helvetica,Arial" font-size="72" font-weight="bold"
        fill="#ffffff">Scene ${index + 1}</text>
  <text x="80" y="1600" font-family="Helvetica,Arial" font-size="36"
        fill="#ffffff" opacity="0.85">${headline}</text>
</svg>`;
}

async function main() {
  const storage = new StorageService();
  const video = new ReelVideoService(storage);
  const voice = new VoiceoverService();

  console.log(`Fournisseur de voix : ${voice.provider ?? 'AUCUN (le reel sera muet)'}`);

  const shots: ReelShot[] = [];
  let spoken = 0;

  for (let i = 0; i < LINES.length; i += 1) {
    const png = await video.rasterise(frameSvg(i, LINES[i]));

    const line = await voice.speak(LINES[i]);
    let seconds = 3;
    if (line) {
      spoken += 1;
      const measured = await video.measureAudio(line.buffer, line.extension);
      // Same rule as the service: the scene outlasts its own line.
      seconds = Math.max(3, Math.round((measured + 1.1) * 10) / 10);
      console.log(
        `  scene ${i + 1}: ${measured.toFixed(2)}s de voix -> scene de ${seconds.toFixed(1)}s`,
      );
    } else {
      console.log(`  scene ${i + 1}: pas de voix, scene de ${seconds}s`);
    }

    shots.push({ png, seconds, voice: line ? { buffer: line.buffer, extension: line.extension } : null });
  }

  const expected = shots.reduce((total, shot) => total + shot.seconds, 0);
  console.log(`Encodage de ${shots.length} scenes (~${expected.toFixed(1)}s attendues)...`);

  const url = await video.encode(shots, 'voice-check');
  if (!url) throw new Error('ECHEC: encode() a renvoye null');

  const stored = storage.readByPublicUrl(url);
  if (!stored) throw new Error(`ECHEC: fichier introuvable a ${url}`);
  console.log(`Fichier : ${url} (${(stored.buffer.length / 1024 / 1024).toFixed(2)} Mo, ${stored.mime})`);

  // The point of the check: does the produced file actually carry a voice?
  const probe = await describe(video, storage, url);
  console.log(probe.summary);

  const problems: string[] = [];
  if (stored.mime !== 'video/mp4') problems.push(`mime ${stored.mime} au lieu de video/mp4`);
  if (!probe.hasVideo) problems.push('aucun flux video');
  if (spoken > 0 && !probe.hasAudio) problems.push('aucun flux audio alors que la voix a ete synthetisee');
  if (probe.duration < expected - 1.5) {
    problems.push(`duree ${probe.duration.toFixed(1)}s < ${expected.toFixed(1)}s attendues`);
  }

  if (problems.length) {
    console.error(`\nECHEC:\n - ${problems.join('\n - ')}`);
    process.exit(1);
  }

  console.log(`\nOK: ${spoken}/${LINES.length} repliques dites, ${probe.duration.toFixed(1)}s, image + son.`);
}

/** Read back the encoded file's streams through ffmpeg's own report. */
async function describe(
  video: ReelVideoService,
  storage: StorageService,
  url: string,
): Promise<{ hasVideo: boolean; hasAudio: boolean; duration: number; summary: string }> {
  const { mkdtemp, writeFile, rm } = await import('fs/promises');
  const { tmpdir } = await import('os');
  const { join } = await import('path');

  const stored = storage.readByPublicUrl(url)!;
  const work = await mkdtemp(join(tmpdir(), 'ngmia-verify-'));
  try {
    const file = join(work, 'out.mp4');
    await writeFile(file, stored.buffer);

    const report = await video.ffmpegReport(['-i', file, '-f', 'null', '-']);
    const streams = report
      .split('\n')
      .filter((line) => line.includes('Stream #'))
      .map((line) => `    ${line.trim()}`)
      .join('\n');

    return {
      hasVideo: /Stream #.*Video:/.test(report),
      hasAudio: /Stream #.*Audio:/.test(report),
      duration: await video.probeDuration(file),
      summary: `Flux detectes :\n${streams || '    (aucun)'}`,
    };
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
