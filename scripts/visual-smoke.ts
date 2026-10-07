/**
 * End-to-end check of the image pipeline: art direction -> FLUX -> WebP file.
 *
 * This is the one that proves the platform actually produces visuals rather
 * than describing them. It hits the real provider, so it is slow and is not
 * part of the fast test suite.
 *
 *   npx ts-node scripts/visual-smoke.ts
 */
import 'dotenv/config';
import { statSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { BrandAssetService } from '../src/common/brand-kit/brand-asset.service';
import {
  buildArtDirection,
  composePrompt,
  seedFor,
} from '../src/common/brand-kit/art-direction';

async function main() {
  const direction = buildArtDirection({
    brandKey: 'smoke:Trattoria Nonna Lidia',
    style: 'RUSTIC',
    colors: ['#17402b', '#2c2c2c', '#b0472f'],
  });

  console.log('\nDirection artistique');
  console.log(`  nom      ${direction.name}`);
  console.log(`  palette  ${direction.palette}`);
  console.log(`  lumiere  ${direction.lighting}`);
  console.log(`  seed     ${direction.seedBase}`);

  console.log('\nDeterminisme');
  const again = buildArtDirection({
    brandKey: 'smoke:Trattoria Nonna Lidia',
    style: 'RUSTIC',
    colors: ['#17402b', '#2c2c2c', '#b0472f'],
  });
  console.log(
    `  meme marque -> meme seed : ${direction.seedBase === again.seedBase ? 'oui' : 'NON'}`,
  );
  const other = buildArtDirection({ brandKey: 'smoke:Autre', style: 'RUSTIC' });
  console.log(
    `  autre marque -> autre seed: ${direction.seedBase !== other.seedBase ? 'oui' : 'NON'}`,
  );
  const s1 = seedFor(direction, 'margherita');
  console.log(`  meme sujet -> meme seed  : ${s1 === seedFor(direction, 'margherita') ? 'oui' : 'NON'}`);
  console.log(
    `  autre sujet -> autre seed: ${s1 !== seedFor(direction, 'diavola') ? 'oui' : 'NON'}`,
  );

  console.log('\nPrompt compose (plat)');
  console.log(
    '  ' +
      composePrompt(direction, 'dish', 'a neapolitan margherita pizza with blistered crust').slice(
        0,
        260,
      ) +
      '...',
  );

  if (process.argv.includes('--dry')) {
    console.log('\n--dry: aucun appel au fournisseur.\n');
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const assets = app.get(BrandAssetService);

  const specs = [
    { kind: 'interior' as const, aspect: 'wide' as const, subject: 'the dining room of a neapolitan pizzeria' },
    { kind: 'dish' as const, aspect: 'landscape' as const, subject: 'a neapolitan margherita pizza with blistered crust, torn basil, on a dark steel tray' },
    { kind: 'dish' as const, aspect: 'landscape' as const, subject: 'a diavola pizza with spicy nduja and a drizzle of chestnut honey, on a dark steel tray' },
  ];

  console.log(`\nRendu de ${specs.length} visuels (reel, ~50s chacun)...`);
  const started = Date.now();
  const shots = await assets.renderAll(direction, specs, 'smoke');
  const seconds = ((Date.now() - started) / 1000).toFixed(0);

  let ok = 0;
  for (const shot of shots) {
    if (!shot.url) {
      console.log(`  ECHEC  ${shot.subject.slice(0, 50)}`);
      continue;
    }
    const file = join(process.cwd(), 'storage', 'uploads', shot.url.replace('/uploads/', ''));
    const kb = statSync(file).size / 1024;
    const stored = shot.url.startsWith('/uploads/');
    const webp = shot.url.endsWith('.webp');
    console.log(
      `  ok     ${shot.url}  ${kb.toFixed(0)} Ko  ${stored ? 'fichier' : 'INLINE'} ${webp ? 'webp' : ''}`,
    );
    ok += 1;
  }

  console.log(`\n${ok}/${specs.length} visuels rendus en ${seconds}s`);
  await app.close();
  process.exit(ok === specs.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
