/**
 * End-to-end menu generation against the running API.
 *
 * Proves the whole chain rather than any one layer: auth -> AI text -> badges
 * and featured flags -> background photography -> stored WebP files -> compiled
 * HTML that actually contains them.
 *
 *   npx ts-node scripts/menu-e2e.ts
 */
import 'dotenv/config';

const API = process.env.E2E_API || 'http://localhost:4000';
const STAMP = Date.now();
const EMAIL = process.env.E2E_EMAIL || `menu-e2e-${STAMP}@example.test`;
const PASSWORD = process.env.E2E_PASSWORD || 'Test1234!menu';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${label}${detail ? ` — ${detail}` : ''}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// TenantMiddleware resolves the tenant from X-Tenant-Slug, the way the
// frontend does; without it TenantGuard rejects every module route.
let tenantSlug = '';

async function call(path: string, init: RequestInit = {}, token?: string) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep raw */
  }
  return { status: res.status, body };
}

async function main() {
  console.log(`\nAPI: ${API}`);

  // ---------------------------------------------------------------- 1. auth
  console.log('\n1. Compte');
  let token: string | undefined;
  const slug = `trattoria-e2e-${STAMP}`;
  const reg = await call('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      firstName: 'Menu',
      lastName: 'E2E',
      tenantName: 'Trattoria Nonna Lidia',
      tenantSlug: slug,
      industry: 'Restauration',
    }),
  });
  if (reg.status === 201 || reg.status === 200) {
    token = reg.body?.data?.accessToken || reg.body?.accessToken;
    check('inscription', Boolean(token));
  } else {
    const login = await call('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    token = login.body?.data?.accessToken || login.body?.accessToken;
    check('connexion', Boolean(token), `register -> ${reg.status}`);
  }
  if (!token) {
    console.log(JSON.stringify(reg.body).slice(0, 400));
    process.exit(1);
  }
  tenantSlug = process.env.E2E_TENANT_SLUG || slug;
  check('tenant resolu', Boolean(tenantSlug), tenantSlug);

  // ------------------------------------------------------------ 2. generate
  console.log('\n2. Generation du menu (IA)');
  const started = Date.now();
  const gen = await call(
    '/menus/generate',
    {
      method: 'POST',
      body: JSON.stringify({
        businessName: 'Trattoria Nonna Lidia',
        businessType: 'PIZZERIA',
        description: 'Pizzeria napolitaine, pate maturee 48h, four a bois, produits italiens',
        template: 'MODERN',
        primaryColor: '#17402b',
        secondaryColor: '#2c2c2c',
        accentColor: '#b0472f',
      }),
    },
    token,
  );
  const menu = gen.body?.data || gen.body;
  check('la generation repond 200/201', gen.status < 300, `status ${gen.status}`);
  if (!menu?.id) {
    console.log(JSON.stringify(gen.body).slice(0, 600));
    process.exit(1);
  }
  console.log(`  (${((Date.now() - started) / 1000).toFixed(1)}s, id ${menu.id})`);

  const categories: any[] = menu.categories || [];
  const items = categories.flatMap((c: any) => c.items || []);
  check('le texte revient immediatement', categories.length >= 3, `${categories.length} categories`);
  check('des items sont generes', items.length >= 8, `${items.length} items`);
  check(
    'la mise en page suit le metier (pizzeria -> SHOWCASE)',
    menu.layout === 'SHOWCASE',
    menu.layout,
  );
  check(
    'des directions photo sont produites',
    items.filter((i: any) => i.imagePrompt).length >= items.length / 2,
    `${items.filter((i: any) => i.imagePrompt).length}/${items.length}`,
  );
  check(
    'des badges sont poses',
    items.some((i: any) => (i.badges || []).length),
    `${items.filter((i: any) => (i.badges || []).length).length} items badges`,
  );
  check(
    'un plat signature par categorie au plus',
    categories.every((c: any) => (c.items || []).filter((i: any) => i.featured).length <= 1),
  );
  check(
    'aucun prix vide',
    items.every((i: any) => String(i.price || '').trim().length > 0),
  );
  const banned = /incontournable|d'exception|explosion de saveurs|voyage gustatif|fait avec amour/i;
  check(
    'pas de remplissage marketing dans les descriptions',
    !items.some((i: any) => banned.test(i.description || '')),
  );

  // ------------------------------------------------------- 3. photography
  console.log('\n3. Photographie (rendu differe)');
  let current: any = menu;
    // A SHOWCASE menu photographs every dish; at ~50s a shot with a retry sweep
  // that is a quarter of an hour, not eight minutes.
  const deadline = Date.now() + 20 * 60 * 1000;
  let last = '';
  while (Date.now() < deadline) {
    const res = await call(`/menus/${menu.id}`, {}, token);
    current = res.body?.data || res.body;
    const status = current?.visualStatus;
    if (status !== last) {
      console.log(`  statut: ${status}`);
      last = status;
    }
    if (['READY', 'PARTIAL', 'FAILED'].includes(status)) break;
    await new Promise((r) => setTimeout(r, 5000));
  }

  check(
    'le rendu visuel se termine',
    ['READY', 'PARTIAL'].includes(current?.visualStatus),
    current?.visualStatus,
  );
  check('une image hero est produite', Boolean(current?.heroImageUrl), current?.heroImageUrl || '-');

  const shot: any[] = (current?.categories || []).flatMap((c: any) => c.items || []);
  const withPhoto = shot.filter((i: any) => i.imageUrl);
  check('des plats sont photographies', withPhoto.length >= shot.length * 0.75, `${withPhoto.length}/${shot.length}`);
  check(
    'les visuels sont des fichiers, pas du base64',
    withPhoto.every((i: any) => String(i.imageUrl).startsWith('/uploads/')),
  );

  // -------------------------------------------------------------- 4. HTML
  console.log('\n4. Document compile');
  const html: string = current?.html || '';
  const imgs = (html.match(/<img /g) || []).length;
  check('le HTML contient des images', imgs >= 5, `${imgs} balises <img>`);
  check('le hero est dans le document', html.includes('class="hero-img"'));
  check('les cards sont rendues', html.includes('class="card'));
  check('un CTA est present', html.includes('class="cta'));
  check('la feuille print A4 est presente', html.includes('@page{size:A4'));
  check(
    'aucune image inline en base64',
    !/src="data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]{500}/.test(html),
  );
  const kb = Buffer.byteLength(html, 'utf8') / 1024;
  check(`le document reste leger (${kb.toFixed(1)} Ko)`, kb < 60);
  check('aucun src casse', !html.includes('src=""') && !html.includes('src="undefined'));

  // ------------------------------------------------------------ 5. publish
  console.log('\n5. Publication');
  const pub = await call(`/menus/${menu.id}/publish`, { method: 'POST' }, token);
  const published = pub.body?.data || pub.body;
  check('publication ok', pub.status < 300 && published?.status === 'PUBLISHED');
  const bySlug = await call(`/menus/slug/${published?.slug}`);
  check('le menu publie est lisible sans auth', bySlug.status === 200);
  check(
    'le menu public porte bien les visuels',
    ((bySlug.body?.data || bySlug.body)?.html || '').includes('class="hero-img"'),
  );

  console.log(
    failures ? `\n${failures} verification(s) en echec\n` : '\nToutes les verifications passent\n',
  );
  console.log(`Menu: ${API.replace('4000', '3000')}/menu/${published?.slug}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
