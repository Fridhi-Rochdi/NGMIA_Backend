/**
 * End-to-end reel generation against the running API.
 *
 * Proves the whole pipeline rather than any one layer: auth, AI script,
 * brand-consistent photography, 1080x1920 frame composition, MP4 encoding,
 * download, and the tenant isolation around all of it.
 *
 *   npx ts-node scripts/reel-e2e.ts
 */
import 'dotenv/config';
import { execFileSync } from 'child_process';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

const API = process.env.E2E_API || 'http://localhost:4000';
const prisma = new PrismaClient();

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  ok   ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const STAMP = Date.now().toString().slice(-7);
const EMAIL = `reel-${STAMP}@example.test`;
const PASSWORD = 'Test1234!reel';
const SLUG = `reel-e2e-${STAMP}`;

let token = '';
let slug = SLUG;

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
        'X-Tenant-Slug': slug,
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

async function signIn(email: string, password: string, tenantSlug: string) {
  slug = tenantSlug;
  const login = await call('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  let session: any = login.body;
  if (session?.otpRequired) {
    if (!session.devCode) throw new Error('OTP actif sans code expose (OTP_EXPOSE_CODE)');
    const verified = await call('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ challengeId: session.challengeId, code: session.devCode }),
    });
    session = verified.body;
  }
  if (!session?.accessToken) throw new Error(`connexion impossible: ${JSON.stringify(login.raw).slice(0, 200)}`);
  return session.accessToken as string;
}

async function main() {
  console.log(`\nAPI: ${API}`);

  // ------------------------------------------------------------- 1. account
  console.log('\n1. Compte');
  const reg = await call('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      firstName: 'Reel',
      lastName: 'E2E',
      tenantName: 'Cafe Nomade',
      tenantSlug: SLUG,
      industry: 'Restauration',
      businessType: 'CAFE',
      description: 'Cafe de specialite a Tunis, torrefaction maison et patisseries du jour',
    }),
  });
  check('inscription', reg.status === 201, `status ${reg.status}`);
  if (reg.status !== 201) {
    console.log(JSON.stringify(reg.raw).slice(0, 300));
    process.exit(1);
  }
  token = reg.body.accessToken;
  const tenantId: string = reg.body.user.tenantId;

  // ------------------------------------------------------- 2. authorisation
  console.log('\n2. Autorisation');
  {
    const saved = token;
    token = '';
    const anon = await call('/reels');
    check('sans authentification -> 401', anon.status === 401, `status ${anon.status}`);
    token = saved;

    const mine = await call('/reels');
    check('authentifie -> 200', mine.status === 200, `status ${mine.status}`);
    check('la bibliotheque demarre vide', Array.isArray(mine.body) && mine.body.length === 0);
  }

  // -------------------------------------------------------- 3. generation
  console.log('\n3. Generation (IA + photos + encodage)');
  const started = Date.now();
  const gen = await call('/reels/generate', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Notre cafe de specialite',
      description: 'Torrefaction maison, grains d origine, patisseries du jour',
      platform: 'INSTAGRAM',
      theme: 'BUSINESS',
      tone: 'FRIENDLY',
      durationSec: 20,
      keyPoints: ['Torrefaction maison', 'Patisseries du jour', 'Ouvert tous les jours'],
    }),
  });
  check('la generation repond 201', gen.status === 201, `status ${gen.status}`);
  if (gen.status !== 201) {
    console.log(JSON.stringify(gen.raw).slice(0, 400));
    process.exit(1);
  }
  const reelId: string = gen.body.id;
  console.log(`  (script en ${((Date.now() - started) / 1000).toFixed(0)}s, id ${reelId})`);

  const scenes: any[] = gen.body.scenes || [];
  check('des scenes sont ecrites', scenes.length >= 3, `${scenes.length} scenes`);
  check(
    'le decoupage suit la duree demandee',
    Math.abs(scenes.reduce((t, s) => t + s.durationSec, 0) - 20) <= 2,
    `${scenes.reduce((t: number, s: any) => t + s.durationSec, 0)}s`,
  );
  check('chaque scene a un titre', scenes.every((s) => String(s.headline || '').trim()));
  check(
    'chaque scene a une direction photo',
    scenes.filter((s) => s.imagePrompt).length >= scenes.length - 1,
    `${scenes.filter((s: any) => s.imagePrompt).length}/${scenes.length}`,
  );
  check(
    'seule la derniere scene porte le CTA',
    scenes.filter((s) => s.cta).length === 1 && Boolean(scenes[scenes.length - 1].cta),
  );
  const banned = /incontournable|d'exception|explosion de saveurs|n'hesitez pas/i;
  check(
    'pas de remplissage marketing',
    !scenes.some((s) => banned.test(`${s.headline} ${s.support || ''}`)),
  );
  check('la marque est figee sur le reel', Boolean(gen.body.brand?.primaryColor));

  // ----------------------------------------------------------- 4. rendering
  console.log('\n4. Rendu (photos, frames, MP4)');
  let current: any = gen.body;
  const deadline = Date.now() + 20 * 60 * 1000;
  let last = '';
  while (Date.now() < deadline) {
    const res = await call(`/reels/${reelId}`);
    current = res.body;
    if (current?.status !== last) {
      console.log(`  statut: ${current?.status}`);
      last = current?.status;
    }
    if (['READY', 'PARTIAL', 'FAILED'].includes(current?.status)) break;
    await new Promise((r) => setTimeout(r, 8000));
  }
  console.log(`  (total ${((Date.now() - started) / 1000 / 60).toFixed(1)} min)`);

  check('le rendu se termine', ['READY', 'PARTIAL'].includes(current?.status), current?.status);
  if (current?.error) console.log(`  detail: ${current.error}`);

  const rendered: any[] = current?.scenes || [];
  const photographed = rendered.filter((s) => s.imageUrl).length;
  const framed = rendered.filter((s) => s.frameUrl).length;
  check('les scenes sont photographiees', photographed >= rendered.length * 0.6,
    `${photographed}/${rendered.length}`);
  check('chaque scene a sa frame composee', framed === rendered.length, `${framed}/${rendered.length}`);
  check('aucun placeholder: toutes les frames sont des fichiers',
    rendered.every((s) => !s.frameUrl || String(s.frameUrl).startsWith('/uploads/')));
  check('une vignette de couverture existe', Boolean(current?.posterUrl));
  check('une video est produite', Boolean(current?.videoUrl), current?.videoUrl || '-');
  // The storage whitelist used to rewrite unknown extensions to .png, so the
  // encoded MP4 was stored as an image and served as image/png.
  check(
    "la video porte bien l'extension .mp4",
    String(current?.videoUrl || '').endsWith('.mp4'),
    current?.videoUrl?.slice(-8),
  );

  // ------------------------------------------------------- 5. the file itself
  console.log('\n5. Le fichier video');
  if (current?.videoUrl) {
    const file = join(process.cwd(), 'storage', 'uploads', current.videoUrl.replace('/uploads/', ''));
    const ffmpeg = require('@ffmpeg-installer/ffmpeg').path;
    const info = (() => {
      try {
        execFileSync(ffmpeg, ['-i', file], { stdio: 'pipe' });
        return '';
      } catch (e: any) {
        return String(e.stderr || '');
      }
    })();
    check('le format est 1080x1920 (9:16)', /1080x1920/.test(info), (info.match(/\d{3,4}x\d{3,4}/) || ['?'])[0]);
    check('le codec est H.264', /h264/i.test(info));
    check('le pixel format est yuv420p (lisible partout)', /yuv420p/.test(info));

    // A reel is an advert, not a slideshow: it has to speak. This encoded
    // silent for as long as the feature existed, because the voiceover line
    // was written into every scene and never synthesised — and nothing here
    // looked at the audio, so the pipeline reported success throughout.
    const written = (current.scenes || []).filter((s: any) => s.voiceover?.trim()).length;
    const spoken = (current.scenes || []).filter((s: any) => s.voiceUrl).length;
    check('les repliques sont ecrites', written > 0, `${written} scene(s)`);
    check('elles sont synthetisees', spoken === written, `${spoken}/${written}`);
    check('le MP4 porte une piste audio', /Audio:\s*aac/i.test(info), (info.match(/Audio: [^\n]*/) || ['aucune'])[0].slice(0, 60));

    const dur = /Duration: (\d+):(\d+):([\d.]+)/.exec(info);
    const seconds = dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : 0;
    // The floor is the requested duration; scenes are stretched to fit their
    // spoken line, so a reel that runs long is correct, not a failure.
    check(
      'la duree couvre la demande',
      seconds >= 20 - 2 && seconds <= 20 * 2.5,
      `${seconds.toFixed(1)}s pour 20s demandees`,
    );

    // The download endpoint has to serve it as a real attachment.
    const dl = await fetch(`${API}/reels/${reelId}/download`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Tenant-Slug': slug },
    });
    const bytes = Buffer.from(await dl.arrayBuffer());
    check('le telechargement repond 200', dl.status === 200, `status ${dl.status}`);
    check('le type est video/mp4', (dl.headers.get('content-type') || '').includes('video/mp4'));
    check('la piece jointe est nommee', (dl.headers.get('content-disposition') || '').includes('.mp4'));
    check('le fichier telecharge est un MP4', bytes.slice(4, 8).toString() === 'ftyp',
      `${(bytes.length / 1024).toFixed(0)} Ko`);
  }

  // ------------------------------------------------- 6. tenant isolation
  console.log('\n6. Isolation entre comptes');
  {
    const otherSlug = `reel-other-${STAMP}`;
    const other = await call('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: `other-${STAMP}@example.test`,
        password: PASSWORD,
        firstName: 'Other',
        lastName: 'Tenant',
        tenantName: 'Autre Commerce',
        tenantSlug: otherSlug,
      }),
      headers: { 'X-Tenant-Slug': otherSlug },
    });
    const otherToken = other.body?.accessToken;
    check("un second compte est cree", Boolean(otherToken), `status ${other.status}`);

    const mine = token;
    const mySlug = slug;
    token = otherToken;
    slug = otherSlug;

    const peek = await call(`/reels/${reelId}`);
    check("un autre tenant ne lit pas ce reel -> 404", peek.status === 404, `status ${peek.status}`);
    const peekList = await call('/reels');
    check("sa bibliotheque ne contient pas ce reel",
      Array.isArray(peekList.body) && !peekList.body.some((r: any) => r.id === reelId));
    const peekDl = await fetch(`${API}/reels/${reelId}/download`, {
      headers: { Authorization: `Bearer ${otherToken}`, 'X-Tenant-Slug': otherSlug },
    });
    check("il ne telecharge pas la video -> 404", peekDl.status === 404, `status ${peekDl.status}`);

    token = mine;
    slug = mySlug;
    await prisma.tenant.deleteMany({ where: { slug: otherSlug } });
  }

  // ---------------------------------------------------------- 7. edit/delete
  console.log('\n7. Edition et suppression');
  {
    const edited = await call(`/reels/${reelId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Titre modifie', hashtags: ['cafe', 'tunis'] }),
    });
    check('le titre se modifie', edited.body?.title === 'Titre modifie', `status ${edited.status}`);
    check('les hashtags se modifient', (edited.body?.hashtags || []).includes('tunis'));

    const removed = await call(`/reels/${reelId}`, { method: 'DELETE' });
    check('la suppression repond 200', removed.status === 200, `status ${removed.status}`);
    const gone = await call(`/reels/${reelId}`);
    check('le reel supprime est introuvable -> 404', gone.status === 404, `status ${gone.status}`);
  }

  // ------------------------------------------------------------- teardown
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();

  console.log(`\nRESULTAT: ${pass} PASS / ${fail} FAIL\n`);
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
