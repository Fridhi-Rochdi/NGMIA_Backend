/**
 * End-to-end website generation against the running API.
 *
 * Generates two sites in different trades and asserts they are different
 * objects — not the same seven-section landing page with the words swapped —
 * and that both are actually illustrated.
 *
 *   npx ts-node scripts/website-e2e.ts
 */
import 'dotenv/config';

const API = process.env.E2E_API || 'http://localhost:4000';
const STAMP = Date.now();

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${label}${detail ? ` — ${detail}` : ''}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

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
  return { status: res.status, body: body?.data !== undefined && body?.statusCode !== undefined ? body.data : body };
}

interface Built {
  label: string;
  site: any;
  roles: string[];
}

async function build(token: string, label: string, dto: any): Promise<Built | null> {
  console.log(`\n  ${label}...`);
  const started = Date.now();
  const res = await call('/websites/generate', { method: 'POST', body: JSON.stringify(dto) }, token);
  if (res.status >= 300) {
    check(`${label} genere`, false, `status ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
    return null;
  }
  let site = res.body;
  const text = ((Date.now() - started) / 1000).toFixed(0);

  // Photography runs after the response; wait for it the way the app does.
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    const poll = await call(`/websites/${site.id}`, {}, token);
    site = poll.body;
    if (['READY', 'PARTIAL', 'FAILED'].includes(site?.visualStatus)) break;
    await new Promise((r) => setTimeout(r, 5000));
  }

  const sections: any[] = site?.content?.sections || [];
  const roles = sections.map((s: any) => s.data?.role || s.type);
  console.log(
    `  texte ${text}s, visuels ${((Date.now() - started) / 1000).toFixed(0)}s ` +
      `(${site?.visualStatus}) : ${roles.join(' > ')}`,
  );
  return { label, site, roles };
}

async function main() {
  console.log(`\nAPI: ${API}`);

  console.log('\n1. Compte');
  const slug = `site-e2e-${STAMP}`;
  const reg = await call('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: `site-e2e-${STAMP}@example.test`,
      password: 'Test1234!site',
      firstName: 'Site',
      lastName: 'E2E',
      tenantName: 'Site E2E',
      tenantSlug: slug,
      industry: 'Divers',
    }),
  });
  const token = reg.body?.accessToken;
  check('inscription', Boolean(token), `status ${reg.status}`);
  if (!token) {
    console.log(JSON.stringify(reg.body).slice(0, 400));
    process.exit(1);
  }
  tenantSlug = slug;

  console.log('\n2. Generation de deux sites dans deux metiers');
  const resto = await build(token, 'Pizzeria', {
    businessName: 'Trattoria Nonna Lidia',
    businessType: 'PIZZERIA',
    description: 'Pizzeria napolitaine, pate maturee 48h, four a bois, produits italiens',
    language: 'fr',
  });
  const avocat = await build(token, "Cabinet d'avocats", {
    businessName: 'Cabinet Vasseur & Associes',
    businessType: "Cabinet d'avocats",
    description: 'Droit du travail et droit des affaires, accompagnement des PME',
    language: 'fr',
  });
  if (!resto || !avocat) process.exit(1);

  console.log('\n3. Les deux sites sont des objets differents');
  {
    const shared = resto.roles.filter((r) => avocat.roles.includes(r));
    check(
      'les architectures different',
      resto.roles.join('>') !== avocat.roles.join('>'),
    );
    check('seul le squelette est commun', shared.length <= 4, `partage: ${shared.join(', ')}`);
    check('la pizzeria a une carte', resto.roles.includes('menu-highlights'));
    check('la pizzeria a une galerie', resto.roles.some((r) => r === 'gallery'));
    check("le cabinet n'a ni carte ni galerie",
      !avocat.roles.includes('menu-highlights') && !avocat.roles.includes('gallery'));
    check('le cabinet a un "comment nous travaillons"', avocat.roles.includes('how-we-work'));
    check(
      'les palettes different',
      resto.site.content.theme.primaryColor !== avocat.site.content.theme.primaryColor ||
        resto.site.content.theme.template !== avocat.site.content.theme.template,
      `${resto.site.content.theme.template} / ${avocat.site.content.theme.template}`,
    );
  }

  console.log('\n4. Les deux sites sont illustres');
  for (const built of [resto, avocat]) {
    const html: string = built.site?.html || '';
    const imgs = (html.match(/<img /g) || []).length;
    const uploads = (html.match(/\/uploads\//g) || []).length;
    check(`${built.label}: le HTML contient des images`, imgs >= 2, `${imgs} <img>`);
    check(`${built.label}: les visuels sont des fichiers stockes`, uploads >= 2, `${uploads} refs`);
    check(
      `${built.label}: les chemins d upload sont absolus`,
      !/src="\/uploads\//.test(html),
    );
    check(
      `${built.label}: aucune image inline base64`,
      !/src="data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]{500}/.test(html),
    );
    const kb = Buffer.byteLength(html, 'utf8') / 1024;
    check(`${built.label}: poids raisonnable (${kb.toFixed(0)} Ko)`, kb < 120);
    check(`${built.label}: aucun src casse`, !html.includes('src=""') && !html.includes('src="undefined'));
    check(
      `${built.label}: aucune section vide rendue`,
      !/<h2[^>]*><\/h2>/.test(html),
    );
  }

  console.log('\n5. Coherence de la direction artistique');
  {
    // Every image of one brand must come from the same scope directory, which
    // is what the shared art direction and seed family are keyed on.
    const html: string = resto.site.html;
    const scopes = new Set((html.match(/\/uploads\/([^/]+)\//g) || []).map((m) => m));
    check('toutes les images d un site partagent le meme espace', scopes.size === 1, [...scopes].join(', '));
  }

  console.log('\n6. Publication');
  {
    const pub = await call(`/websites/${resto.site.id}/publish`, { method: 'POST' }, token);
    check('publication ok', pub.status < 300, `status ${pub.status}`);
    const sub = pub.body?.subdomain || resto.site.subdomain;
    const pubRes = await call(`/websites/subdomain/${sub}`);
    check('le site publie est lisible sans auth', pubRes.status === 200, `status ${pubRes.status}`);

    const publishedUrl: string = pub.body?.publishedUrl || '';
    check('une URL de deploiement est renvoyee', /^https?:\/\//.test(publishedUrl), publishedUrl);

    // A deployed site is served from Vercel, not from this API, so it must
    // carry its images INSIDE the document. It shipped pointing at
    // PUBLIC_API_URL instead — http://localhost:4000 in development — so every
    // image was broken for every visitor.
    //
    // The API never exposes the deploy rendering (only the editor's, which
    // legitimately uses absolute API urls), and that is exactly why this went
    // unnoticed: nothing ever looked at the artifact that actually ships. So
    // build it here, the same way publishWebsite() does.
    const fresh = await call(`/websites/${resto.site.id}`, {}, token);
    const content = fresh.body?.content;
    if (!content) {
      check('le contenu du site est lisible', false, 'aucun content renvoye');
    } else {
      const { StorageService } = await import('../src/common/storage/storage.service');
      const { WebsiteRendererService } = await import(
        '../src/modules/website/website-renderer.service'
      );
      const deployed = new WebsiteRendererService(new StorageService()).renderForDeploy(content);

      const localhostRefs = (deployed.match(/https?:\/\/localhost:\d+\/uploads\//g) || []).length;
      const relativeRefs = (deployed.match(/(?:src|href)="\/uploads\//g) || []).length;
      const inlined = (deployed.match(/data:image\/[a-z+]+;base64,/g) || []).length;

      check('le document publie embarque ses images', inlined > 0, `${inlined} inlinee(s)`);
      check(
        'il ne pointe sur aucune adresse locale',
        localhostRefs === 0,
        `${localhostRefs} reference(s)`,
      );
      check('ni sur aucun chemin relatif', relativeRefs === 0, `${relativeRefs} reference(s)`);
    }
  }

  console.log(failures ? `\n${failures} verification(s) en echec\n` : '\nToutes les verifications passent\n');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
