/**
 * The menu QR code, end to end, against a menu that already exists.
 *
 * menu-e2e.ts proves generation and publication but stops before the QR — and
 * the QR is the whole point of a digital menu: it is what goes on the table.
 * This logs into the most recent menu tenant, generates the code, and checks
 * it actually points at that menu's public page.
 *
 *   npx ts-node scripts/menu-qr-check.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const API = process.env.E2E_API || 'http://localhost:4000';
const prisma = new PrismaClient();

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  // The menu e2e leaves its accounts behind; reuse the newest rather than
  // paying another 90 seconds of generation to get a menu to point at.
  const menu = await prisma.menu.findFirst({
    orderBy: { createdAt: 'desc' },
    include: { tenant: true },
  });
  if (!menu) {
    console.log('\nAucun menu en base — lancez `npx ts-node scripts/menu-e2e.ts` d abord.\n');
    process.exit(0);
  }

  const user = await prisma.user.findFirst({ where: { tenantId: menu.tenantId } });
  if (!user) {
    console.log('\nLe tenant du menu n a pas d utilisateur.\n');
    process.exit(0);
  }

  console.log(`\nAPI: ${API}`);
  console.log(`Menu: "${menu.name}" (${menu.slug}) — tenant ${menu.tenant.slug}`);

  // ------------------------------------------------------------------- auth
  console.log('\n1. Connexion');
  const password = process.env.E2E_PASSWORD || 'Test1234!menu';
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password }),
  });
  const loginBody: any = await login.json().catch(() => null);
  let session = loginBody?.data ?? loginBody;

  if (session?.otpRequired) {
    if (!session.devCode) {
      console.log('  --   OTP_EXPOSE_CODE desactive: impossible de poursuivre sans boite mail.\n');
      process.exit(0);
    }
    const verified = await fetch(`${API}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: session.challengeId, code: session.devCode }),
    });
    const body: any = await verified.json().catch(() => null);
    session = body?.data ?? body;
  }

  const token = session?.accessToken;
  check('session ouverte', Boolean(token), token ? '' : `HTTP ${login.status}`);
  if (!token) process.exit(1);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Tenant-Slug': menu.tenant.slug,
  };

  // --------------------------------------------------------------- 2. le QR
  console.log('\n2. QR du menu');
  const res = await fetch(`${API}/menus/${menu.id}/generate-qr`, { method: 'POST', headers });
  const payload: any = await res.json().catch(() => null);
  const data = payload?.data ?? payload;
  check('generation repond 200/201', res.status === 200 || res.status === 201, `HTTP ${res.status}`);

  const image = data?.qrCode || data?.base64 || data?.data?.base64 || data?.qrCodeUrl;
  check(
    'une image PNG est renvoyee',
    typeof image === 'string' && image.startsWith('data:image/png;base64,'),
    typeof image === 'string' ? `${Math.round(image.length / 1024)} Ko` : typeof image,
  );

  // A QR that encodes the wrong address is worse than none: it is printed,
  // stuck on a table, and fails silently for every customer who scans it.
  const target = String(data?.url || data?.content || data?.data?.content || '');
  check('il encode une URL', /^https?:\/\//.test(target), target.slice(0, 70));
  check('cette URL porte le slug du menu', target.includes(menu.slug), menu.slug);

  // ------------------------------------------------------- 3. la cible vit
  console.log('\n3. La page visee');
  if (/^https?:\/\//.test(target)) {
    try {
      const page = await fetch(target, { redirect: 'follow' });
      check('la page publique repond', page.status === 200, `HTTP ${page.status}`);
    } catch (error: any) {
      // The front end may simply not be running; that is not a QR fault.
      console.log(`  --   page injoignable (${error?.message}) — frontend demarre ?`);
    }
  }

  // ------------------------------------------------------ 4. il est persiste
  console.log('\n4. Persistance');
  const list = await fetch(`${API}/qr-code`, { headers });
  const listBody: any = await list.json().catch(() => null);
  const rows = listBody?.data ?? listBody;
  check('le QR apparait dans la bibliotheque', Array.isArray(rows) && rows.length > 0, `${rows?.length ?? 0} code(s)`);

  console.log(failures === 0 ? '\nTOUT PASSE\n' : `\n${failures} CONTROLE(S) EN ECHEC\n`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
