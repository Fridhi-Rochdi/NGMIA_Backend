/**
 * Generate one reel on an existing account and report what came out.
 *
 * Unlike reel-e2e.ts this keeps the result, so it can be opened and watched.
 *
 *   npx ts-node scripts/reel-demo.ts <email> [motDePasse]
 */
import 'dotenv/config';
import { execFileSync } from 'child_process';
import { statSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

const API = process.env.E2E_API || 'http://localhost:4000';
const APP = process.env.E2E_APP || 'http://localhost:3000';
const prisma = new PrismaClient();

let token = '';
let slug = '';

async function call(path: string, init: RequestInit = {}, timeoutMs = 600_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(slug ? { 'X-Tenant-Slug': slug } : {}),
        ...((init.headers as any) || {}),
      },
    });
    const text = await res.text();
    let body: any = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* keep raw */
    }
    return {
      status: res.status,
      body: body?.data !== undefined && body?.statusCode !== undefined ? body.data : body,
      raw: body,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const email = process.argv[2] || 'demo409358@ngmia.test';
  const password = process.argv[3] || 'Demo1234!ngmia';

  const user = await prisma.user.findFirst({ where: { email }, include: { tenant: true } });
  if (!user) {
    console.error(`Utilisateur introuvable: ${email}`);
    process.exit(1);
  }
  slug = user.tenant.slug;

  // ------------------------------------------------------------------ login
  const login = await call('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  let session: any = login.body;
  if (session?.otpRequired) {
    if (!session.devCode) {
      console.error('OTP actif sans code expose (OTP_EXPOSE_CODE=true requis).');
      process.exit(1);
    }
    const verified = await call('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ challengeId: session.challengeId, code: session.devCode }),
    });
    session = verified.body;
  }
  token = session?.accessToken;
  if (!token) {
    console.error('Connexion impossible.');
    console.error(JSON.stringify(login.raw).slice(0, 300));
    process.exit(1);
  }
  console.log(`\nConnecte: ${email} (${user.tenant.name})`);

  // ------------------------------------------------------------- generation
  console.log('\nGeneration du reel...');
  const started = Date.now();
  const gen = await call('/reels/generate', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Notre carte de saison',
      description:
        'Table mediterraneenne a Tunis: poissons du jour, legumes de saison, patisseries maison',
      platform: 'INSTAGRAM',
      theme: 'BUSINESS',
      tone: 'FRIENDLY',
      durationSec: 25,
      keyPoints: ['Poissons du jour', 'Legumes de saison', 'Patisseries maison', 'Reservation'],
    }),
  });

  if (gen.status !== 201) {
    console.error(`Echec (${gen.status}): ${JSON.stringify(gen.raw).slice(0, 400)}`);
    process.exit(1);
  }

  const reelId: string = gen.body.id;
  console.log(`Script ecrit en ${((Date.now() - started) / 1000).toFixed(0)}s\n`);

  console.log('SCENES');
  for (const scene of gen.body.scenes || []) {
    console.log(`  ${scene.index}. [${scene.startSec}s +${scene.durationSec}s] ${scene.headline}`);
    if (scene.support) console.log(`     ${scene.support}`);
    if (scene.cta) console.log(`     CTA: ${scene.cta}`);
    if (scene.imagePrompt) console.log(`     photo: ${scene.imagePrompt.slice(0, 78)}`);
  }

  // -------------------------------------------------------------- rendering
  console.log('\nRendu (photos, frames, encodage)...');
  let current: any = gen.body;
  const deadline = Date.now() + 20 * 60 * 1000;
  let last = '';
  while (Date.now() < deadline) {
    const res = await call(`/reels/${reelId}`);
    current = res.body;
    if (current?.status !== last) {
      console.log(`  ${current?.status}`);
      last = current?.status;
    }
    if (['READY', 'PARTIAL', 'FAILED'].includes(current?.status)) break;
    await new Promise((r) => setTimeout(r, 8000));
  }

  const minutes = ((Date.now() - started) / 1000 / 60).toFixed(1);
  const scenes: any[] = current?.scenes || [];

  console.log('\n' + '='.repeat(60));
  console.log('RESULTAT');
  console.log('='.repeat(60));
  console.log(`  Statut        ${current?.status}   (${minutes} min)`);
  if (current?.error) console.log(`  Detail        ${current.error}`);
  console.log(`  Scenes        ${scenes.length}`);
  console.log(`  Photographiees ${scenes.filter((s) => s.imageUrl).length}/${scenes.length}`);
  console.log(`  Frames        ${scenes.filter((s) => s.frameUrl).length}/${scenes.length}`);
  console.log(
    `  Marque        ${current?.brand?.primaryColor} / ${current?.brand?.accentColor}` +
      `${current?.brand?.logoUrl ? ' + logo' : ''}`,
  );

  if (current?.videoUrl) {
    const file = join(process.cwd(), 'storage', 'uploads', current.videoUrl.replace('/uploads/', ''));
    const size = statSync(file).size;
    const ffmpeg = require('@ffmpeg-installer/ffmpeg').path;
    const info = (() => {
      try {
        execFileSync(ffmpeg, ['-i', file], { stdio: 'pipe' });
        return '';
      } catch (e: any) {
        return String(e.stderr || '');
      }
    })();
    const stream = /Stream #0:0.*?Video: ([^\n]+)/.exec(info);
    const dur = /Duration: ([\d:.]+)/.exec(info);

    console.log(`\n  Video         ${API}${current.videoUrl}`);
    console.log(`  Poids         ${(size / 1024).toFixed(0)} Ko`);
    console.log(`  Duree         ${dur ? dur[1] : '?'}`);
    console.log(`  Flux          ${stream ? stream[1].slice(0, 90) : '?'}`);
  } else {
    console.log('\n  Video         non produite');
  }

  if (current?.caption) {
    console.log(`\n  Legende       ${current.caption}`);
    if (current.hashtags?.length) {
      console.log(`  Hashtags      ${current.hashtags.map((h: string) => '#' + h).join(' ')}`);
    }
  }

  console.log(`\n  Dans l app    ${APP}/reels\n`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
