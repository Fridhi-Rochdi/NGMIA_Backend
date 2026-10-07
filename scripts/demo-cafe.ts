/**
 * Create a brand-new tenant and produce its whole marketing kit.
 *
 * A café, from nothing: account, business context, brand identity with a real
 * logo, digital menu with photographed dishes published to Vercel with its QR,
 * a website published to Vercel, a marketing image, a spoken reel, and a
 * poster. Prints every artefact's URL at the end so the result can be opened
 * and judged rather than taken on trust.
 *
 *   npm run demo:cafe
 */
import 'dotenv/config';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');

const API = process.env.E2E_API || 'http://localhost:4000';
const STAMP = Date.now().toString().slice(-6);
const EMAIL = `cafe-${STAMP}@example.test`;
const PASSWORD = 'Test1234!cafe';
const SLUG = `cafe-lumiere-${STAMP}`;
const NAME = 'Café Lumière';

let token = '';
let tenantSlug = SLUG;
const artefacts: { what: string; where: string }[] = [];
const problems: string[] = [];

function ok(label: string, detail = '') {
  console.log(`  ok   ${label}${detail ? ` — ${detail}` : ''}`);
}
function bad(label: string, detail = '') {
  problems.push(`${label}: ${detail}`);
  console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

/**
 * One API call, over node:http rather than fetch.
 *
 * Node's fetch enforces undici's 300-second headers timeout and does not
 * expose a way to raise it; AbortSignal.timeout() does not override it. Brand
 * generation with a logo, a menu with its photography and a reel encode all
 * run longer than that, so every one of them died client-side with
 * UND_ERR_HEADERS_TIMEOUT while the server was still working normally.
 */
function call(
  path: string,
  init: { method?: string; body?: string } = {},
): Promise<{ status: number; body: any; msg: string }> {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const url = new URL(`${API}${path}`);
    const payload = init.body;

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: init.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {}),
        },
      },
      (res: any) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let body: any = null;
          try {
            body = JSON.parse(text);
          } catch {
            body = text;
          }
          const message = Array.isArray(body?.message)
            ? body.message.join('; ')
            : body?.message || '';
          resolve({
            status: res.statusCode,
            body: body?.data !== undefined ? body.data : body,
            msg: String(message).slice(0, 150),
          });
        });
      },
    );

    req.setTimeout(20 * 60 * 1000, () => req.destroy(new Error('timeout 20 min')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Real image or black rectangle? Only the pixels can say. */
async function luminance(publicUrl: string): Promise<string> {
  try {
    const { readFileSync, existsSync } = await import('fs');
    const { join, resolve } = await import('path');
    const file = resolve(join(process.cwd(), 'storage', 'uploads', publicUrl.replace('/uploads/', '')));
    if (!existsSync(file)) return 'fichier absent';
    const stats = await sharp(readFileSync(file)).stats();
    const mean = stats.channels.reduce((n: number, c: any) => n + c.mean, 0) / stats.channels.length;
    return stats.channels.every((c: any) => c.max === 0)
      ? 'NOIRE'
      : `luminance ${mean.toFixed(0)}`;
  } catch {
    return 'illisible';
  }
}

async function main() {
  console.log(`\n${'='.repeat(62)}`);
  console.log(`  ${NAME} — kit marketing complet`);
  console.log(`  ${EMAIL} / ${PASSWORD}`);
  console.log(`${'='.repeat(62)}`);

  // ------------------------------------------------------------- 1. compte
  console.log('\n1. Creation du compte');
  const reg = await call('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      firstName: 'Camille',
      lastName: 'Bertin',
      tenantName: NAME,
      tenantSlug: SLUG,
      industry: 'Restauration',
    }),
  });
  token = reg.body?.accessToken || '';
  if (!token) {
    bad('inscription', `HTTP ${reg.status} ${reg.msg}`);
    process.exit(1);
  }
  ok('compte cree', tenantSlug);

  // ------------------------------------------------------------ 2. contexte
  console.log('\n2. Contexte business');
  const ctx = await call('/business-context', {
    method: 'PUT',
    body: JSON.stringify({
      businessName: NAME,
      businessType: 'CAFE',
      industry: 'Restauration',
      description:
        "Cafe de quartier ouvert de 7h a 19h. Torrefaction artisanale a Lyon, extraction espresso et filtre, patisseries maison livrees chaque matin.",
      services: ['Espresso et filtre', 'Patisseries maison', 'Brunch le week-end'],
      targetAudience: 'Habitants du quartier, teletravailleurs, etudiants',
      tone: 'friendly',
      language: 'fr',
      currency: 'EUR',
      contactPhone: '+33 4 72 00 00 00',
      contactEmail: 'bonjour@cafe-lumiere.test',
      contactAddress: '8 rue Sainte-Catherine, 69001 Lyon',
    }),
  });
  ctx.status < 300 ? ok('contexte enregistre') : bad('contexte', `HTTP ${ctx.status}`);

  // ------------------------------------------------------------ 3. branding
  console.log('\n3. Identite de marque');
  const brand = await call('/branding/generate', {
    method: 'POST',
    body: JSON.stringify({
      brandName: NAME,
      industry: 'Restauration',
      description: 'Cafe de quartier, torrefaction artisanale, patisseries maison.',
      style: 'modern',
      values: ['artisanat', 'quartier'],
    }),
  });
  if (brand.status >= 300) {
    bad('branding', `HTTP ${brand.status} ${brand.msg}`);
  } else {
    const b = brand.body;
    ok('palette', `${b.primaryColor} / ${b.secondaryColor} / ${b.accentColor}`);
    ok('slogan', String(b.tagline || '').slice(0, 60));
    if (b.logo) {
      ok('logo', `${await luminance(b.logo)} — ${Object.keys(b.logoVariants || {}).length} variantes`);
      artefacts.push({ what: 'Logo', where: `${API}${b.logo}` });
    } else {
      bad('logo', 'aucun logo produit');
    }
  }

  // ---------------------------------------------------------------- 4. menu
  console.log('\n4. Menu (IA + photographie, plusieurs minutes)');
  const menu = await call('/menus/generate', {
    method: 'POST',
    body: JSON.stringify({
      businessName: NAME,
      businessType: 'CAFE',
      description: 'Cafe de quartier, torrefaction artisanale, patisseries maison.',
      language: 'fr',
      currency: 'EUR',
    }),
  });
  if (menu.status >= 300) {
    bad('menu', `HTTP ${menu.status} ${menu.msg}`);
  } else {
    const cats = menu.body?.categories || [];
    const items = cats.reduce((n: number, c: any) => n + (c.items?.length || 0), 0);
    ok('carte ecrite', `${cats.length} categories, ${items} references`);

    // Photography runs after the response.
    let visual = '';
    for (let i = 0; i < 120; i += 1) {
      const m = await call(`/menus/${menu.body.id}`);
      visual = m.body?.visualStatus || '';
      if (['READY', 'PARTIAL', 'FAILED'].includes(visual)) break;
      await new Promise((r) => setTimeout(r, 5000));
    }
    const full = await call(`/menus/${menu.body.id}`);
    const shots: string[] = (full.body?.categories || [])
      .flatMap((c: any) => (c.items || []).map((i: any) => i.imageUrl))
      .filter(Boolean);
    const blacks: string[] = [];
    for (const s of shots.slice(0, 8)) {
      if ((await luminance(s)) === 'NOIRE') blacks.push(s);
    }
    blacks.length
      ? bad('photos des plats', `${blacks.length} noire(s)`)
      : ok('photos des plats', `${shots.length} images, aucune noire (${visual})`);

    const pub = await call(`/menus/${menu.body.id}/publish`, { method: 'POST' });
    const menuUrl = String(pub.body?.vercelUrl || '');
    /vercel\.app/i.test(menuUrl)
      ? ok('menu publie sur Vercel')
      : bad('publication du menu', menuUrl || `HTTP ${pub.status}`);
    if (menuUrl) artefacts.push({ what: 'Menu public', where: menuUrl });

    const qr = await call(`/menus/${menu.body.id}/generate-qr`, { method: 'POST' });
    qr.status < 300
      ? ok('QR du menu', `pointe sur ${String(qr.body?.url || '').slice(0, 60)}`)
      : bad('QR du menu', `HTTP ${qr.status}`);
  }

  // ---------------------------------------------------------------- 5. site
  console.log('\n5. Site web (IA + visuels, plusieurs minutes)');
  const site = await call('/websites/generate', {
    method: 'POST',
    body: JSON.stringify({
      businessName: NAME,
      businessType: 'CAFE',
      industry: 'Restauration',
      description: 'Cafe de quartier a Lyon, torrefaction artisanale, patisseries maison.',
      services: ['Espresso et filtre', 'Patisseries maison', 'Brunch le week-end'],
      language: 'fr',
    }),
  });
  if (site.status >= 300) {
    bad('site', `HTTP ${site.status} ${site.msg}`);
  } else {
    const sections = (site.body?.content?.sections || []).map((s: any) => s.type);
    ok('site genere', `${sections.length} sections: ${sections.join(', ')}`);

    for (let i = 0; i < 120; i += 1) {
      const w = await call(`/websites/${site.body.id}`);
      if (['READY', 'PARTIAL', 'FAILED'].includes(w.body?.visualStatus || '')) break;
      await new Promise((r) => setTimeout(r, 5000));
    }

    const pub = await call(`/websites/${site.body.id}/publish`, { method: 'POST' });
    const siteUrl = String(pub.body?.publishedUrl || '');
    /vercel\.app/i.test(siteUrl)
      ? ok('site publie sur Vercel')
      : bad('publication du site', siteUrl || `HTTP ${pub.status} ${pub.msg}`);
    if (siteUrl) artefacts.push({ what: 'Site public', where: siteUrl });
  }

  // --------------------------------------------------------------- 6. image
  console.log('\n6. Image marketing');
  const image = await call('/images/generate', {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'Latte art sur un comptoir en bois, lumiere du matin, ambiance de cafe de quartier',
      style: 'realistic',
      size: '1024x1024',
    }),
  });
  if (image.status >= 300 || !image.body?.url) {
    bad('image', `HTTP ${image.status} ${image.msg}`);
  } else {
    const url = String(image.body.url);
    ok('image generee', url.startsWith('data:') ? 'data URI (non stockee en fichier)' : await luminance(url));
    if (!url.startsWith('data:')) artefacts.push({ what: 'Image marketing', where: `${API}${url}` });
  }

  // ---------------------------------------------------------------- 7. reel
  console.log('\n7. Reel video (script + photos + voix + encodage)');
  const reel = await call('/reels/generate', {
    method: 'POST',
    body: JSON.stringify({
      businessName: NAME,
      businessType: 'CAFE',
      description: 'Cafe de quartier a Lyon, torrefaction artisanale, patisseries maison.',
      platform: 'INSTAGRAM',
      theme: 'BUSINESS',
      tone: 'FRIENDLY',
      durationSec: 20,
    }),
  });
  if (reel.status >= 300) {
    bad('reel', `HTTP ${reel.status} ${reel.msg}`);
  } else {
    let final: any = null;
    for (let i = 0; i < 120; i += 1) {
      const r = await call(`/reels/${reel.body.id}`);
      if (['READY', 'PARTIAL', 'FAILED'].includes(r.body?.status)) {
        final = r.body;
        break;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    if (!final?.videoUrl) {
      bad('reel', final?.error || 'aucune video produite');
    } else {
      const scenes = final.scenes || [];
      const spoken = scenes.filter((s: any) => s.voiceUrl).length;
      const lines = scenes.filter((s: any) => s.voiceover?.trim()).length;
      ok('reel encode', `${final.status}, ${scenes.length} scenes, ${spoken}/${lines} repliques dites`);
      artefacts.push({ what: 'Reel MP4', where: `${API}${final.videoUrl}` });
    }
  }

  // ------------------------------------------------------------- 8. affiche
  console.log('\n8. Affiche');
  const poster = await call('/posters/generate', {
    method: 'POST',
    body: JSON.stringify({
      businessName: NAME,
      businessType: 'CAFE',
      title: 'Brunch du samedi',
      description: 'Tous les samedis de 9h a 14h, patisseries maison et filtre du jour.',
      size: 'A4',
      language: 'fr',
    }),
  });
  if (poster.status >= 300) {
    bad('affiche', `HTTP ${poster.status} ${poster.msg}`);
  } else {
    const html = String(poster.body?.content || '');
    ok('affiche generee', `${(html.length / 1024).toFixed(1)} Ko`);
    if (poster.body?.imageUrl) {
      ok('visuel de l affiche', await luminance(String(poster.body.imageUrl)));
    }
    const pub = await call(`/posters/${poster.body.id}/publish`, { method: 'POST' });
    if (pub.body?.vercelUrl) artefacts.push({ what: 'Affiche', where: String(pub.body.vercelUrl) });
  }

  // ----------------------------------------------------------------- bilan
  console.log(`\n${'='.repeat(62)}`);
  console.log('  LIVRABLES');
  console.log(`${'='.repeat(62)}`);
  for (const a of artefacts) console.log(`  ${a.what.padEnd(18)} ${a.where}`);
  console.log(`\n  Connexion: ${EMAIL} / ${PASSWORD}`);
  console.log(`  (OTP actif: le code s affiche sur /auth/verify)`);

  if (problems.length) {
    console.log(`\n  ${problems.length} PROBLEME(S):`);
    for (const p of problems) console.log(`    - ${p}`);
  } else {
    console.log('\n  Aucun probleme.');
  }
  console.log(`${'='.repeat(62)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
