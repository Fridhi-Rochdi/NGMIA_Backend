/**
 * Creates one demo account and generates a full set of assets for it:
 * brand identity + logo, an illustrated menu, a poster and a website.
 *
 * Prints the credentials and the links at the end so the result can be opened
 * and looked at rather than described.
 *
 *   npx ts-node scripts/seed-demo.ts
 */
import 'dotenv/config';

const API = process.env.E2E_API || 'http://localhost:4000';
const APP = process.env.E2E_APP || 'http://localhost:3000';

const STAMP = Date.now().toString().slice(-6);
const EMAIL = process.env.DEMO_EMAIL || `demo${STAMP}@ngmia.test`;
const PASSWORD = process.env.DEMO_PASSWORD || 'Demo1234!ngmia';
const SLUG = `maison-safran-${STAMP}`;

const BUSINESS = {
  name: 'Maison Safran',
  type: 'RESTAURANT',
  description:
    'Table mediterraneenne a Tunis, produits de saison, poissons du jour et patisseries maison',
};

let token = '';

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Tenant-Slug': SLUG,
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
  const data = body?.data !== undefined && body?.statusCode !== undefined ? body.data : body;
  return { status: res.status, body: data, raw: body };
}

function step(label: string) {
  process.stdout.write(`\n${label}... `);
}

async function main() {
  const started = Date.now();
  console.log(`\nAPI ${API}\nApp ${APP}`);

  // ------------------------------------------------------------- 1. account
  step('1. Compte');
  const reg = await call('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      firstName: 'Demo',
      lastName: 'Safran',
      tenantName: BUSINESS.name,
      tenantSlug: SLUG,
      industry: 'Restauration',
      businessType: BUSINESS.type,
      description: BUSINESS.description,
    }),
  });
  if (reg.status >= 300) {
    console.log('ECHEC');
    console.log(JSON.stringify(reg.raw).slice(0, 400));
    process.exit(1);
  }
  token = reg.body.accessToken;
  console.log('ok');

  // ------------------------------------------------------------- 2. branding
  // First, so the logo and palette are on the brand kit before anything else
  // is generated — every later asset inherits them.
  step('2. Identite de marque + logo (IA, ~1 min)');
  const branding = await call('/branding/generate', {
    method: 'POST',
    body: JSON.stringify({
      brandName: BUSINESS.name,
      industry: 'Restauration mediterraneenne',
      description: BUSINESS.description,
      style: 'elegant',
      values: ['saison', 'artisanal', 'mediterranee'],
    }),
  });
  const brand = branding.body;
  console.log(branding.status < 300 ? `ok (${brand?.primaryColor})` : `ECHEC ${branding.status}`);
  if (branding.status >= 300) console.log(JSON.stringify(branding.raw).slice(0, 300));

  // ----------------------------------------------------------------- 3. menu
  step('3. Menu illustre (IA, ~3 min)');
  const menu = await call('/menus/generate', {
    method: 'POST',
    body: JSON.stringify({
      businessName: BUSINESS.name,
      businessType: BUSINESS.type,
      description: BUSINESS.description,
      template: 'ELEGANT',
    }),
  });
  console.log(menu.status < 300 ? `ok (${menu.body?.layout})` : `ECHEC ${menu.status}`);
  if (menu.status >= 300) console.log(JSON.stringify(menu.raw).slice(0, 300));

  // -------------------------------------------------------------- 4. website
  step('4. Site web (IA, ~2 min)');
  const site = await call('/websites/generate', {
    method: 'POST',
    body: JSON.stringify({
      businessName: BUSINESS.name,
      businessType: BUSINESS.type,
      description: BUSINESS.description,
      language: 'fr',
    }),
  });
  const roles = (site.body?.content?.sections || []).map((s: any) => s.data?.role || s.type);
  console.log(site.status < 300 ? `ok (${roles.length} sections)` : `ECHEC ${site.status}`);
  if (site.status >= 300) console.log(JSON.stringify(site.raw).slice(0, 300));

  // --------------------------------------------------------------- 5. poster
  step('5. Affiche (IA, ~2 min)');
  const poster = await call('/posters/generate', {
    method: 'POST',
    body: JSON.stringify({
      businessName: BUSINESS.name,
      businessType: 'RESTAURANT',
      title: 'Menu de saison',
      description: 'Nouvelle carte de saison, poissons du jour et patisseries maison',
      template: 'ELEGANT',
      size: 'A4',
    }),
  });
  console.log(poster.status < 300 ? 'ok' : `ECHEC ${poster.status}`);
  if (poster.status >= 300) console.log(JSON.stringify(poster.raw).slice(0, 300));

  // -------------------------------------------- 6. wait for the photography
  step('6. Rendu des visuels (arriere-plan)');
  const deadline = Date.now() + 15 * 60 * 1000;
  let menuState: any = menu.body;
  let siteState: any = site.body;
  let last = '';
  while (Date.now() < deadline) {
    if (menu.body?.id) menuState = (await call(`/menus/${menu.body.id}`)).body;
    if (site.body?.id) siteState = (await call(`/websites/${site.body.id}`)).body;
    const line = `menu=${menuState?.visualStatus} site=${siteState?.visualStatus}`;
    if (line !== last) {
      process.stdout.write(`\n   ${line}`);
      last = line;
    }
    const done = (s: any) => ['READY', 'PARTIAL', 'FAILED'].includes(s);
    if (done(menuState?.visualStatus) && done(siteState?.visualStatus)) break;
    await new Promise((r) => setTimeout(r, 10000));
  }
  console.log('\n   termine');

  // ------------------------------------------------------------- 7. publish
  step('7. Publication');
  let menuUrl = '';
  let siteUrl = '';
  let posterUrl = '';
  if (menu.body?.id) {
    const p = await call(`/menus/${menu.body.id}/publish`, { method: 'POST' });
    if (p.body?.slug) menuUrl = `${APP}/menu/${p.body.slug}`;
  }
  if (site.body?.id) {
    const p = await call(`/websites/${site.body.id}/publish`, { method: 'POST' });
    const sub = p.body?.subdomain || site.body?.subdomain;
    if (sub) siteUrl = `${APP}/site/${sub}`;
  }
  if (poster.body?.id) {
    const p = await call(`/posters/${poster.body.id}/publish`, { method: 'POST' });
    if (p.body?.slug) posterUrl = `${APP}/poster/${p.body.slug}`;
  }
  console.log('ok');

  // ---------------------------------------------------------------- summary
  const menuPhotos = (menuState?.categories || [])
    .flatMap((c: any) => c.items || [])
    .filter((i: any) => i.imageUrl).length;
  const sitePhotos = ((siteState?.html || '').match(/<img /g) || []).length;

  console.log('\n' + '='.repeat(62));
  console.log('IDENTIFIANTS');
  console.log('='.repeat(62));
  console.log(`  Application   ${APP}/auth/login`);
  console.log(`  Email         ${EMAIL}`);
  console.log(`  Mot de passe  ${PASSWORD}`);
  console.log(`  Tenant        ${SLUG}`);
  console.log('');
  console.log('  Un code a 6 chiffres est demande apres le mot de passe.');
  console.log('  En developpement il est affiche directement sur la page.');

  console.log('\n' + '='.repeat(62));
  console.log('REALISATIONS');
  console.log('='.repeat(62));
  console.log(`  Marque        ${brand?.name || '-'}  ${brand?.primaryColor || ''} ${brand?.secondaryColor || ''} ${brand?.accentColor || ''}`);
  console.log(`  Logo          ${brand?.logo || 'non genere'}`);
  console.log(`  Menu          ${menuUrl || 'non publie'}`);
  console.log(`                layout ${menuState?.layout}, ${menuPhotos} plat(s) photographie(s), statut ${menuState?.visualStatus}`);
  console.log(`  Site web      ${siteUrl || 'non publie'}`);
  console.log(`                ${roles.join(' > ')}`);
  console.log(`                ${sitePhotos} image(s), statut ${siteState?.visualStatus}`);
  console.log(`  Affiche       ${posterUrl || 'non publie'}`);
  console.log('');
  console.log('  Dans l app :');
  console.log(`    ${APP}/branding`);
  console.log(`    ${APP}/menu`);
  console.log(`    ${APP}/websites`);
  console.log(`    ${APP}/poster`);
  console.log(`\n  (${((Date.now() - started) / 1000 / 60).toFixed(1)} min)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
