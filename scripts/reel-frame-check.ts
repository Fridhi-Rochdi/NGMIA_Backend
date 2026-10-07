/**
 * Frame and encoding checks for the reel pipeline.
 *
 * Asserts the things a reel must never ship with: wrong aspect, clipped
 * headlines, a blank scene, an unplayable file. Runs offline — no model, no
 * image provider — so it is fast and deterministic.
 *
 *   npm run test:reel
 */
import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import {
  REEL_HEIGHT,
  REEL_WIDTH,
  renderReelFrame,
} from '../src/modules/reels/reel-frame';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${label}${detail ? ` — ${detail}` : ''}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const brand = {
  primary: '#1C3F63',
  secondary: '#F5F5F5',
  accent: '#C27A2C',
  fontFamily: 'Inter',
  name: 'Maison Safran',
  logo: null,
};

async function main() {
  const out = join(process.cwd(), 'storage', 'preview', 'reel');
  mkdirSync(out, { recursive: true });

  console.log('\n1. Composition de la frame');
  {
    const svg = renderReelFrame({
      index: 1,
      total: 5,
      headline: 'Poissons du jour',
      support: 'Arrives ce matin du port de Sidi Bou Said',
      kicker: 'La carte',
      photo: null,
      brand,
    });
    check('le SVG est bien forme', svg.startsWith('<svg') && svg.trimEnd().endsWith('</svg>'));
    check('le format est 1080x1920', svg.includes('width="1080"') && svg.includes('height="1920"'));
    check('le ratio est 9:16', REEL_WIDTH / REEL_HEIGHT === 9 / 16);
    check("la couleur d'accent de la marque est utilisee", svg.includes('#C27A2C'));
    check('le nom de la marque apparait', svg.includes('Maison Safran'));
    check('les pastilles de progression sont rendues', (svg.match(/<rect[^>]*y="74"/g) || []).length === 5);

    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const meta = await sharp(png).metadata();
    check('la rasterisation donne 1080x1920', meta.width === 1080 && meta.height === 1920,
      `${meta.width}x${meta.height}`);
    writeFileSync(join(out, 'scene-1.png'), png);
  }

  console.log('\n2. Le texte ne deborde jamais');
  {
    const cases: [string, string][] = [
      ['court', 'Ouvert'],
      ['normal', 'Poissons du jour et patisseries'],
      ['long', 'Une table mediterraneenne ouverte tous les jours de la semaine a Tunis'],
      ['mot interminable', 'Anticonstitutionnellementsupercalifragilistic'],
    ];
    for (const [label, headline] of cases) {
      const svg = renderReelFrame({ index: 2, total: 4, headline, photo: null, brand });
      const lines = (svg.match(/font-size="(118|100|84)"/g) || []).length;
      check(`"${label}" tient en 4 lignes au plus`, lines >= 1 && lines <= 4, `${lines} ligne(s)`);
      // Every text baseline must sit inside the frame.
      const ys = [...svg.matchAll(/<text[^>]*y="([\d.]+)"/g)].map((m) => Number(m[1]));
      check(`"${label}" reste dans le cadre`, ys.every((y) => y > 0 && y < REEL_HEIGHT),
        `min ${Math.min(...ys).toFixed(0)}, max ${Math.max(...ys).toFixed(0)}`);
    }
  }

  console.log('\n3. Aucune scene vide');
  {
    // No photograph, no support line, no kicker: still a designed frame.
    const svg = renderReelFrame({ index: 1, total: 3, headline: 'Maison Safran', photo: null, brand });
    check('sans photo, un fond de marque est pose', svg.includes(`fill="${brand.primary}"`));
    check('le titre est toujours rendu', svg.includes('Maison Safran'));
    check("aucun href d'image vide", !svg.includes('href=""') && !svg.includes('base64,"'));
  }

  console.log('\n4. Echappement');
  {
    const svg = renderReelFrame({
      index: 1,
      total: 2,
      headline: 'Plats "maison" & <script>alert(1)</script>',
      support: "L'ardoise du jour",
      photo: null,
      brand,
    });
    check('le balisage injecte est echappe', !svg.includes('<script>alert'));
    check("l'esperluette est echappee", svg.includes('&amp;'));
    check("l'apostrophe est echappee", svg.includes('&apos;'));
    check('le SVG reste parsable', svg.split('<svg').length === 2);
  }

  console.log('\n5. Appel a l action sur la derniere scene');
  {
    const withCta = renderReelFrame({
      index: 3, total: 3, headline: 'Reservez votre table', photo: null, brand, cta: 'Reserver',
    });
    const without = renderReelFrame({ index: 1, total: 3, headline: 'Ouvert', photo: null, brand });
    check("le CTA est rendu quand il est fourni", withCta.includes('RESERVER'));
    check("le fond du CTA prend l'accent", withCta.includes(`fill="${brand.accent}"`));
    check("aucun CTA sur les autres scenes", !without.includes('rx="8"'));
  }

  console.log('\n6. Encodage MP4');
  {
    const ffmpeg = require('@ffmpeg-installer/ffmpeg').path;
    const frames: string[] = [];
    for (let i = 1; i <= 3; i += 1) {
      const svg = renderReelFrame({
        index: i, total: 3,
        headline: ['Poissons du jour', 'Cuisine de saison', 'Reservez votre table'][i - 1],
        photo: null, brand,
        cta: i === 3 ? 'Reserver' : undefined,
      });
      const file = join(out, `enc-${i}.png`);
      writeFileSync(file, await sharp(Buffer.from(svg)).png().toBuffer());
      frames.push(file);
    }

    const list = join(out, 'frames.txt');
    writeFileSync(
      list,
      frames.map((f) => `file '${f.replace(/\\/g, '/')}'\nduration 2.00`).join('\n') +
        `\nfile '${frames[frames.length - 1].replace(/\\/g, '/')}'`,
      'utf8',
    );
    const mp4 = join(out, 'reel.mp4');
    execFileSync(
      ffmpeg,
      ['-y', '-f', 'concat', '-safe', '0', '-i', list,
       '-vf', 'fps=30,format=yuv420p',
       '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'veryfast', '-crf', '20',
       '-movflags', '+faststart', '-pix_fmt', 'yuv420p', mp4],
      { stdio: 'pipe' },
    );

    const size = statSync(mp4).size;
    check('un fichier MP4 est produit', size > 1000, `${(size / 1024).toFixed(0)} Ko`);

    // Ask ffmpeg what it actually made rather than assuming. With no output
    // file it exits non-zero after printing the stream description, so the
    // report has to be read from stderr.
    const info = (() => {
      try {
        execFileSync(ffmpeg, ['-i', mp4], { stdio: 'pipe' });
        return '';
      } catch (e: any) {
        return String(e.stderr || '');
      }
    })();
    check('la video est en 1080x1920', /1080x1920/.test(info), (info.match(/\d{3,4}x\d{3,4}/) || ['?'])[0]);
    check('le codec est H.264', /h264/i.test(info));
    check('le pixel format est yuv420p', /yuv420p/.test(info));
    const dur = /Duration: (\d+):(\d+):([\d.]+)/.exec(info);
    const seconds = dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : 0;
    check('la duree correspond aux scenes (~6s)', seconds >= 5 && seconds <= 8, `${seconds.toFixed(1)}s`);
  }


  console.log('\n7. Reparations du script');
  {
    // The two rules the model keeps ignoring, enforced in code. Instantiated
    // bare: neither repair touches an injected dependency.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ReelsService } = require('../src/modules/reels/reels.service');
    const svc: any = new ReelsService(null, null, null, null, null, null, null);
    svc.logger = { warn: () => undefined, log: () => undefined, error: () => undefined };

    const scene = (index: number, headline: string, extra: any = {}) => ({
      index,
      startSec: (index - 1) * 5,
      durationSec: 5,
      headline,
      ...extra,
    });

    // -- opening ----------------------------------------------------------
    const greeting = svc.repairOpening(
      [
        scene(1, 'Bienvenue a Maison Safran'),
        scene(2, 'Poissons du jour'),
        scene(3, 'Reserver', { cta: 'Reserver' }),
      ],
      'Maison Safran',
    );
    check(
      'une salutation ne reste pas en ouverture',
      greeting[0].headline === 'Poissons du jour',
      greeting[0].headline,
    );
    check('le CTA reste en derniere position', Boolean(greeting[greeting.length - 1].cta));
    check(
      'les timings sont recalcules',
      greeting.map((x: any) => x.startSec).join(',') === '0,5,10',
      greeting.map((x: any) => x.startSec).join(','),
    );

    const nameOnly = svc.repairOpening(
      [scene(1, 'Maison Safran'), scene(2, 'Peche du matin')],
      'Maison Safran',
    );
    check('le nom seul ne reste pas en ouverture', nameOnly[0].headline === 'Peche du matin');

    const fine = svc.repairOpening(
      [scene(1, 'Peche du matin'), scene(2, 'Legumes de saison')],
      'Maison Safran',
    );
    check('une bonne ouverture est laissee intacte', fine[0].headline === 'Peche du matin');

    // -- image prompts ----------------------------------------------------
    const cleaned = svc.repairImagePrompt(
      'Phone showing a reservation screen, in a cozy corner of the restaurant, warm light',
      'repli',
    );
    check("l'ecran est retire de la prise de vue", !/phone|screen/i.test(cleaned), cleaned);
    check('le reste du sujet est conserve', /restaurant/i.test(cleaned));

    const logoStripped = svc.repairImagePrompt(
      'A plated fish on a dark tray, restaurant logo visible, wooden table',
      'repli',
    );
    check('le logo est retire de la prise de vue', !/logo/i.test(logoStripped), logoStripped);

    const untouched = svc.repairImagePrompt(
      'Fresh fish on a wooden platter, herbs, Mediterranean kitchen',
      'repli',
    );
    check(
      'une prise de vue propre est laissee intacte',
      untouched === 'Fresh fish on a wooden platter, herbs, Mediterranean kitchen',
    );

    const gutted = svc.repairImagePrompt('A phone screen', 'sujet de repli');
    check('un sujet vide apres nettoyage retombe sur le repli', gutted === 'sujet de repli');
  }

  console.log(`\nApercus: ${out}`);
  console.log(failures ? `\n${failures} verification(s) en echec\n` : '\nToutes les verifications passent\n');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
