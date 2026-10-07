/**
 * Completes the demo account: retries the logo, generates the poster, and
 * publishes everything. Safe to re-run — it skips whatever already exists.
 *
 *   npx ts-node scripts/finish-demo.ts <email> [motDePasse]
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const API = process.env.E2E_API || 'http://localhost:4000';
const APP = process.env.E2E_APP || 'http://localhost:3000';
const prisma = new PrismaClient();

let token = '';
let slug = '';

async function call(path: string, init: RequestInit = {}, timeoutMs = 600_000) {
  // Node's default 300s header timeout is shorter than a poster generation,
  // which runs an art-direction pass, an HTML pass and a review pass.
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

async function main() {
  const email = process.argv[2];
  const password = process.argv[3] || 'Demo1234!ngmia';
  if (!email) {
    console.error('Usage: ts-node scripts/finish-demo.ts <email> [motDePasse]');
    process.exit(1);
  }

  const user = await prisma.user.findFirst({ where: { email }, include: { tenant: true } });
  if (!user) {
    console.error(`Utilisateur introuvable: ${email}`);
    process.exit(1);
  }
  slug = user.tenant.slug;

  // Sign in through the real endpoints, second factor included.
  const login = await call('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  let session: any = login.body;
  if (session?.otpRequired) {
    if (!session.devCode) {
      console.error('OTP actif sans code expose; definissez OTP_EXPOSE_CODE=true.');
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
  console.log(`connecte: ${email}`);

  // ------------------------------------------------------------------ logo
  const brand = await prisma.brand.findFirst({
    where: { tenantId: user.tenantId },
    orderBy: { updatedAt: 'desc' },
  });
  if (brand && !brand.logo) {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      process.stdout.write(`logo, tentative ${attempt}/4... `);
      const res = await call(`/branding/${brand.id}/logo/regenerate`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (res.status < 300 && res.body?.logo) {
        console.log(`ok -> ${res.body.logo}`);
        break;
      }
      console.log(`echec (${res.status})`);
      if (attempt < 4) await new Promise((r) => setTimeout(r, 8000));
    }
  } else if (brand?.logo) {
    console.log(`logo deja present: ${brand.logo}`);
  }

  // ---------------------------------------------------------------- poster
  let poster = await prisma.poster.findFirst({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: 'desc' },
  });
  if (!poster) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      process.stdout.write(`affiche, tentative ${attempt}/3... `);
      const res = await call('/posters/generate', {
        method: 'POST',
        body: JSON.stringify({
          businessName: user.tenant.name,
          businessType: 'RESTAURANT',
          title: 'Menu de saison',
          description: 'Nouvelle carte de saison, poissons du jour et patisseries maison',
          template: 'ELEGANT',
          size: 'A4',
        }),
      });
      if (res.status < 300 && res.body?.id) {
        console.log('ok');
        poster = res.body;
        break;
      }
      console.log(`echec (${res.status}) ${String(res.raw?.message || '').slice(0, 70)}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 5000));
    }
  } else {
    console.log('affiche deja presente');
  }

  // ------------------------------------------------------------- publish
  const menu = await prisma.menu.findFirst({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: 'desc' },
  });
  const site = await prisma.website.findFirst({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: 'desc' },
  });

  let menuUrl = '';
  let siteUrl = '';
  let posterUrl = '';

  if (menu) {
    const r = await call(`/menus/${menu.id}/publish`, { method: 'POST' });
    if (r.body?.slug) menuUrl = `${APP}/menu/${r.body.slug}`;
    else console.log(`publication menu: ${r.status}`);
  }
  if (site) {
    const r = await call(`/websites/${site.id}/publish`, { method: 'POST' });
    const sub = r.body?.subdomain || site.subdomain;
    if (r.status < 300 && sub) siteUrl = `${APP}/site/${sub}`;
    else console.log(`publication site: ${r.status}`);
  }
  if (poster) {
    const r = await call(`/posters/${poster.id}/publish`, { method: 'POST' });
    if (r.body?.slug) posterUrl = `${APP}/poster/${r.body.slug}`;
    else console.log(`publication affiche: ${r.status}`);
  }

  // ---------------------------------------------------------------- report
  const fresh = await prisma.brand.findFirst({
    where: { tenantId: user.tenantId },
    orderBy: { updatedAt: 'desc' },
  });
  const freshMenu = await prisma.menu.findFirst({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: 'desc' },
  });
  const freshSite = await prisma.website.findFirst({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: 'desc' },
  });
  const dishes = ((freshMenu?.categories as any[]) || []).flatMap((c: any) => c.items || []);

  console.log('\n' + '='.repeat(64));
  console.log('IDENTIFIANTS');
  console.log('='.repeat(64));
  console.log(`  Connexion     ${APP}/auth/login`);
  console.log(`  Email         ${email}`);
  console.log(`  Mot de passe  ${password}`);
  console.log('  Un code a 6 chiffres est demande ensuite; il s affiche sur la page.');

  console.log('\n' + '='.repeat(64));
  console.log('REALISATIONS');
  console.log('='.repeat(64));
  console.log(`  Marque        ${fresh?.name}  ${fresh?.primaryColor} / ${fresh?.secondaryColor} / ${fresh?.accentColor}`);
  console.log(`  Logo          ${fresh?.logo || 'non genere'}`);
  console.log(`  Menu          ${menuUrl || 'non publie'}`);
  console.log(`                ${freshMenu?.layout}, ${dishes.filter((d: any) => d.imageUrl).length}/${dishes.length} plats photographies, ${(freshMenu?.html.match(/<img /g) || []).length} images`);
  console.log(`  Site web      ${siteUrl || 'non publie'}`);
  console.log(`                ${(freshSite?.html.match(/<img /g) || []).length} images, ${freshSite?.visualStatus}`);
  console.log(`  Affiche       ${posterUrl || 'non publiee'}`);
  console.log('\n  Dans l application :');
  console.log(`    ${APP}/branding    ${APP}/menu`);
  console.log(`    ${APP}/websites    ${APP}/poster\n`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
