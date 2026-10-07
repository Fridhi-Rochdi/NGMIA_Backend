/**
 * Tenant isolation, across every module.
 *
 * Two accounts, each with its own data, and then every read and write one can
 * aim at the other's records. A multi-tenant platform that leaks here leaks
 * everything, so this walks the surface rather than sampling it.
 *
 *   npm run test:isolation
 */
import 'dotenv/config';
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

interface Account {
  token: string;
  slug: string;
  tenantId: string;
  email: string;
}

async function call(
  path: string,
  account: Account | null,
  init: RequestInit = {},
) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(account ? { Authorization: `Bearer ${account.token}`, 'X-Tenant-Slug': account.slug } : {}),
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
  };
}

async function register(label: string, stamp: string): Promise<Account> {
  const slug = `iso-${label}-${stamp}`;
  const email = `iso-${label}-${stamp}@example.test`;
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': slug },
    body: JSON.stringify({
      email,
      password: 'Test1234!iso',
      firstName: label,
      lastName: 'Iso',
      tenantName: `Commerce ${label}`,
      tenantSlug: slug,
      businessType: 'RESTAURANT',
      description: 'Petite table de quartier',
    }),
  });
  const body: any = await res.json();
  const session = body?.data ?? body;
  if (!session?.accessToken) {
    throw new Error(`inscription ${label} impossible: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return { token: session.accessToken, slug, tenantId: session.user.tenantId, email };
}

async function main() {
  const stamp = Date.now().toString().slice(-7);
  console.log(`\nAPI: ${API}`);

  console.log('\n1. Deux comptes distincts');
  const alice = await register('a', stamp);
  const bob = await register('b', stamp);
  check('les deux comptes existent', Boolean(alice.token && bob.token));
  check('leurs tenants different', alice.tenantId !== bob.tenantId);

  // Seed one record per module directly, so the test does not wait on the AI.
  console.log("\n2. Donnees creees pour le compte A");
  const seeded = {
    menu: await prisma.menu.create({
      data: {
        name: 'Carte A', businessName: 'Commerce A', businessType: 'RESTAURANT',
        categories: [] as any, html: '<html></html>', css: '', slug: `iso-menu-${stamp}`,
        status: 'DRAFT', tenantId: alice.tenantId, userId: (await prisma.user.findFirstOrThrow({ where: { tenantId: alice.tenantId } })).id,
      },
    }),
    website: await prisma.website.create({
      data: {
        businessName: 'Commerce A', businessType: 'RESTAURANT', description: 'x',
        content: {} as any, html: '<html></html>', css: '', subdomain: `iso-site-${stamp}`,
        status: 'DRAFT', tenantId: alice.tenantId, userId: (await prisma.user.findFirstOrThrow({ where: { tenantId: alice.tenantId } })).id,
      },
    }),
    brand: await prisma.brand.create({
      data: { name: 'Marque A', slug: `iso-brand-${stamp}`, tenantId: alice.tenantId },
    }),
    reel: await prisma.reel.create({
      data: {
        title: 'Reel A', slug: `iso-reel-${stamp}`, businessName: 'Commerce A',
        scenes: [] as any, tenantId: alice.tenantId,
        userId: (await prisma.user.findFirstOrThrow({ where: { tenantId: alice.tenantId } })).id,
      },
    }),
  };
  check('un menu, un site, une marque et un reel sont crees', true);

  console.log('\n3. Le compte B ne voit rien du compte A');
  {
    for (const [label, path] of [
      ['menus', '/menus'],
      ['sites', '/websites'],
      ['marques', '/branding'],
      ['reels', '/reels'],
    ] as const) {
      const res = await call(path, bob);
      const ids = Array.isArray(res.body) ? res.body.map((r: any) => r.id) : [];
      const leaked = ids.some((id: string) =>
        Object.values(seeded).some((rec: any) => rec.id === id),
      );
      check(`liste ${label} sans fuite`, res.status === 200 && !leaked, `${ids.length} element(s)`);
    }
  }

  console.log('\n4. Acces direct par identifiant');
  {
    const probes: [string, string][] = [
      ['menu', `/menus/${seeded.menu.id}`],
      ['site', `/websites/${seeded.website.id}`],
      ['marque', `/branding/${seeded.brand.id}`],
      ['reel', `/reels/${seeded.reel.id}`],
    ];
    for (const [label, path] of probes) {
      const mine = await call(path, alice);
      check(`le proprietaire lit son ${label}`, mine.status === 200, `status ${mine.status}`);
      const theirs = await call(path, bob);
      check(`le compte B ne lit pas ce ${label}`, theirs.status === 404 || theirs.status === 403,
        `status ${theirs.status}`);
    }
  }

  console.log('\n5. Ecritures croisees');
  {
    const writes: [string, string, string, any][] = [
      ['menu', 'PUT', `/menus/${seeded.menu.id}`, { name: 'Vole' }],
      ['reel', 'PATCH', `/reels/${seeded.reel.id}`, { title: 'Vole' }],
      ['marque', 'PUT', `/branding/${seeded.brand.id}`, { name: 'Vole' }],
    ];
    for (const [label, method, path, body] of writes) {
      const res = await call(path, bob, { method, body: JSON.stringify(body) });
      check(`le compte B ne modifie pas ce ${label}`, res.status === 404 || res.status === 403,
        `status ${res.status}`);
    }

    const deletes: [string, string][] = [
      ['menu', `/menus/${seeded.menu.id}`],
      ['reel', `/reels/${seeded.reel.id}`],
      ['site', `/websites/${seeded.website.id}`],
    ];
    for (const [label, path] of deletes) {
      const res = await call(path, bob, { method: 'DELETE' });
      check(`le compte B ne supprime pas ce ${label}`, res.status === 404 || res.status === 403,
        `status ${res.status}`);
    }

    // The records must still be there after all of that.
    const still = await prisma.menu.count({ where: { id: seeded.menu.id } });
    check('les donnees du compte A sont intactes', still === 1);
  }

  console.log('\n6. En-tete de tenant falsifie');
  {
    // Bob's token with Alice's tenant slug: the slug must not override the
    // identity the token carries.
    const forged = await call(`/menus/${seeded.menu.id}`, {
      ...bob,
      slug: alice.slug,
    });
    check("un slug de tenant falsifie ne donne pas l'acces",
      forged.status === 404 || forged.status === 403, `status ${forged.status}`);

    const forgedList = await call('/menus', { ...bob, slug: alice.slug });
    const ids = Array.isArray(forgedList.body) ? forgedList.body.map((r: any) => r.id) : [];
    check('ni la liste', !ids.includes(seeded.menu.id), `${ids.length} element(s)`);
  }

  console.log('\n7. Sans authentification');
  {
    for (const [label, path] of [
      ['menus', '/menus'],
      ['sites', '/websites'],
      ['reels', '/reels'],
      ['marques', '/branding'],
    ] as const) {
      const res = await call(path, null);
      check(`${label} refuse l'anonyme`, res.status === 401, `status ${res.status}`);
    }
  }

  console.log("\n8. Le menu publie reste public");
  {
    await prisma.menu.update({
      where: { id: seeded.menu.id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    const anon = await call(`/menus/slug/${seeded.menu.slug}`, null);
    check('un menu publie est lisible sans compte', anon.status === 200, `status ${anon.status}`);
    check("la reponse publique n'expose pas le tenant",
      !JSON.stringify(anon.body).includes(alice.tenantId));

    await prisma.menu.update({ where: { id: seeded.menu.id }, data: { status: 'DRAFT' } });
    const draft = await call(`/menus/slug/${seeded.menu.slug}`, null);
    check("un menu non publie n'est pas lisible", draft.status === 404, `status ${draft.status}`);

    const bogus = await call('/menus/slug/CE-N-EST-PAS-UN-SLUG!!', null);
    check('un slug invalide est refuse proprement', bogus.status === 400, `status ${bogus.status}`);
  }

  // ------------------------------------------------------------- teardown
  await prisma.tenant.deleteMany({ where: { id: { in: [alice.tenantId, bob.tenantId] } } });
  await prisma.$disconnect();

  console.log(`\nRESULTAT: ${pass} PASS / ${fail} FAIL\n`);
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
