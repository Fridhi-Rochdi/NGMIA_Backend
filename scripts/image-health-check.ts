/**
 * Prove that generated imagery is a real photograph, not a black rectangle.
 *
 * A blocked generation answers 200 with a pure black 1024x1024 image and
 * `finishReason: "CONTENT_FILTERED"`. Nothing read that field, so the black
 * rectangles were stored and published as dish photographs and poster
 * visuals. Checking the status code is not enough — only the pixels are.
 *
 *   npm run test:images
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');

const API = process.env.E2E_API || 'http://localhost:4000';
const EMAIL = process.env.E2E_EMAIL || 'site-e2e-1789508413152@example.test';
const PASSWORD = process.env.E2E_PASSWORD || 'Test1234!site';

const prisma = new PrismaClient();
let token = '';
let slug = '';
let failures = 0;

function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}`, 'X-Tenant-Slug': slug } : {}),
    },
    signal: AbortSignal.timeout(900_000),
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  const message = Array.isArray(body?.message) ? body.message.join('; ') : body?.message || '';
  return { status: res.status, body: body?.data ?? body, msg: String(message).slice(0, 160) };
}

/** Mean luminance of a stored asset, and whether it is uniformly black. */
async function inspect(publicUrl: string) {
  const { readFileSync, existsSync } = await import('fs');
  const { join, resolve } = await import('path');
  const file = resolve(
    join(process.cwd(), 'storage', 'uploads', publicUrl.replace('/uploads/', '')),
  );
  if (!existsSync(file)) return { found: false, black: false, mean: 0, kb: 0 };
  const buf = readFileSync(file);
  const stats = await sharp(buf).stats();
  const mean = stats.channels.reduce((n: number, c: any) => n + c.mean, 0) / stats.channels.length;
  return {
    found: true,
    black: stats.channels.every((c: any) => c.max === 0),
    mean,
    kb: buf.length / 1024,
  };
}

async function main() {
  console.log(`\nAPI: ${API}`);

  let session = (await call('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })).body;
  if (session?.otpRequired) {
    session = (await call('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ challengeId: session.challengeId, code: session.devCode }),
    })).body;
  }
  token = session?.accessToken;
  slug = session?.user?.tenant?.slug;
  if (!token) throw new Error('connexion impossible');
  console.log(`Compte: ${EMAIL} (${slug})\n`);

  // ------------------------------------------------------------- 1. affiche
  console.log('1. Affiche');
  const poster = await call('/posters/generate', {
    method: 'POST',
    body: JSON.stringify({
      businessName: 'Trattoria Nonna Lidia',
      businessType: 'PIZZERIA',
      title: 'Soiree pizza du jeudi',
      description: 'Pate maturee 48h, four a bois, tous les jeudis soir.',
      size: 'A4',
      language: 'fr',
    }),
  });
  check('generation', poster.status < 300, poster.msg || `HTTP ${poster.status}`);

  if (poster.status < 300) {
    const html = String(poster.body?.content || '');
    check('un document est produit', html.length > 2500, `${(html.length / 1024).toFixed(1)} Ko`);

    const imageUrl = String(poster.body?.imageUrl || '');
    if (!imageUrl) {
      check('un visuel est attache', false, 'aucun imageUrl');
    } else {
      const img = await inspect(imageUrl);
      check('le visuel existe sur disque', img.found, imageUrl);
      check(
        'le visuel est une vraie image',
        img.found && !img.black,
        `${img.kb.toFixed(0)} Ko, luminance moyenne ${img.mean.toFixed(1)}${img.black ? ' — NOIRE' : ''}`,
      );
    }
  }

  // ---------------------------------------------------------------- 2. menu
  console.log('\n2. Menu (IA + photographie, plusieurs minutes)');
  const menu = await call('/menus/generate', {
    method: 'POST',
    body: JSON.stringify({
      businessName: 'Trattoria Nonna Lidia',
      businessType: 'PIZZERIA',
      description: 'Pizzeria napolitaine, pate maturee 48h, four a bois.',
      language: 'fr',
      currency: 'EUR',
    }),
  });
  check('generation', menu.status < 300, menu.msg || `HTTP ${menu.status}`);

  const menuId = menu.body?.id;
  if (menuId) {
    let visualStatus = '';
    for (let i = 0; i < 90; i += 1) {
      const m = await call(`/menus/${menuId}`);
      visualStatus = m.body?.visualStatus || '';
      if (['READY', 'PARTIAL', 'FAILED'].includes(visualStatus)) break;
      await new Promise((r) => setTimeout(r, 5000));
    }
    check('la photographie se termine', visualStatus === 'READY', visualStatus);

    const row = await prisma.menu.findUnique({ where: { id: menuId } });
    const categories: any[] = Array.isArray(row?.categories) ? (row!.categories as any) : [];
    const urls = [
      ...(row?.heroImageUrl ? [String(row.heroImageUrl)] : []),
      ...categories.flatMap((c) => (c.items || []).map((i: any) => i.imageUrl).filter(Boolean)),
    ];

    check('des visuels sont produits', urls.length > 0, `${urls.length} image(s)`);

    let black = 0;
    let missing = 0;
    let sumMean = 0;
    for (const url of urls) {
      const img = await inspect(String(url));
      if (!img.found) missing += 1;
      else if (img.black) black += 1;
      else sumMean += img.mean;
    }
    const real = urls.length - black - missing;
    check('aucun visuel noir', black === 0, `${black} noire(s) sur ${urls.length}`);
    check('aucun visuel manquant', missing === 0, `${missing} absente(s)`);
    if (real > 0) {
      console.log(`       luminance moyenne des ${real} images reelles: ${(sumMean / real).toFixed(1)}`);
    }
  }

  console.log(
    failures === 0
      ? '\nTOUT PASSE — les visuels sont de vraies images.\n'
      : `\n${failures} CONTROLE(S) EN ECHEC\n`,
  );
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
