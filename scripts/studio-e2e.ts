/**
 * End-to-end check of the generators the other e2e scripts do not cover:
 * branding, marketing content, and every kind of QR code.
 *
 * menu-e2e.ts and website-e2e.ts prove the two document pipelines. This one
 * proves the rest of the studio still answers, still persists, and still hands
 * back something usable rather than an empty shell.
 *
 *   npx ts-node scripts/studio-e2e.ts
 */
import 'dotenv/config';

const API = process.env.E2E_API || 'http://localhost:4000';
const STAMP = Date.now();
const EMAIL = process.env.E2E_EMAIL || `studio-e2e-${STAMP}@example.test`;
const PASSWORD = process.env.E2E_PASSWORD || 'Test1234!studio';
const SLUG = `studio-e2e-${STAMP}`;

let failures = 0;
let token = '';
let tenantSlug = SLUG;

function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

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
        ...(tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {}),
        ...(init.headers || {}),
      },
    });
    const text = await res.text();
    let body: any = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    // Unwrap the TransformInterceptor envelope so callers see the payload.
    return { status: res.status, body: body?.data !== undefined ? body.data : body, raw: body };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log(`\nAPI: ${API}`);

  // ---------------------------------------------------------------- 1. auth
  console.log('\n1. Compte');
  const reg = await call('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      firstName: 'Studio',
      lastName: 'E2E',
      tenantName: 'Atelier Lumiere',
      tenantSlug: SLUG,
      industry: 'Artisanat',
    }),
  });
  token = reg.body?.accessToken || '';
  check('inscription', Boolean(token), `HTTP ${reg.status}`);
  if (!token) {
    console.log(JSON.stringify(reg.raw).slice(0, 400));
    process.exit(1);
  }
  tenantSlug = SLUG;

  // ---------------------------------------------------- 2. contexte business
  console.log('\n2. Contexte business');
  const ctx = await call('/business-context', {
    method: 'PUT',
    body: JSON.stringify({
      businessName: 'Atelier Lumiere',
      businessType: 'SERVICES',
      description:
        "Atelier de restauration de luminaires anciens, laiton et verre souffle, a Lyon.",
      targetAudience: 'Particuliers et antiquaires',
      tone: 'professional',
    }),
  });
  check('contexte enregistre', ctx.status === 200 || ctx.status === 201, `HTTP ${ctx.status}`);

  // ------------------------------------------------------------ 3. branding
  console.log('\n3. Branding (IA)');
  const brandStart = Date.now();
  const brand = await call('/branding/generate', {
    method: 'POST',
    body: JSON.stringify({
      brandName: 'Atelier Lumiere',
      industry: 'Artisanat',
      description: 'Restauration de luminaires anciens en laiton et verre souffle.',
      style: 'classic',
      values: ['savoir-faire', 'patience'],
    }),
  });
  const brandSec = ((Date.now() - brandStart) / 1000).toFixed(0);
  check('generation ok', brand.status === 200 || brand.status === 201, `HTTP ${brand.status} en ${brandSec}s`);

  const b = brand.body || {};
  const palette = [b.primaryColor, b.secondaryColor, b.accentColor].filter(Boolean);
  check('une palette est produite', palette.length >= 3, palette.join(' '));
  check(
    'les couleurs sont des hex valides',
    palette.every((c: string) => /^#[0-9a-f]{6}$/i.test(c)),
    palette.join(' '),
  );
  check('un slogan est produit', Boolean(b.slogan || b.tagline), String(b.slogan || b.tagline || '').slice(0, 60));
  // The audit flagged branding as having regressed to a hard-coded template.
  // A palette that never varies is the symptom, so the identity is compared
  // against the known default rather than merely checked for presence.
  check(
    'la palette n est pas le gabarit par defaut',
    b.primaryColor?.toLowerCase() !== '#3b82f6',
    `primaire ${b.primaryColor}`,
  );
  const brandId = b.id;
  check('le branding est persiste', Boolean(brandId), brandId ? `id ${String(brandId).slice(0, 8)}` : 'aucun id');

  if (brandId) {
    const list = await call('/branding');
    const rows = Array.isArray(list.body) ? list.body : list.body?.items || [];
    check('il apparait dans la liste', rows.length > 0, `${rows.length} marque(s)`);
  }

  // ------------------------------------------------------------- 4. content
  console.log('\n4. Contenu marketing (IA)');
  const contentStart = Date.now();
  const content = await call('/content/generate', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Lustre laiton 1920 restaure',
      type: 'POST',
      prompt: "Annoncer la restauration d'un lustre en laiton des annees 1920.",
      tone: 'professional',
      length: 'SHORT',
    }),
  });
  const contentSec = ((Date.now() - contentStart) / 1000).toFixed(0);
  check('generation ok', content.status === 200 || content.status === 201, `HTTP ${content.status} en ${contentSec}s`);
  const body = String(content.body?.body || content.body?.content || '');
  check('du texte est revenu', body.trim().length > 40, `${body.trim().length} caracteres`);
  check('le contenu est persiste', Boolean(content.body?.id));

  const contentList = await call('/content');
  const contentRows = Array.isArray(contentList.body) ? contentList.body : contentList.body?.items || [];
  check('il apparait dans la liste', contentRows.length > 0, `${contentRows.length} contenu(s)`);

  // ------------------------------------------------------------ 5. QR codes
  console.log('\n5. QR codes');
  const qrCases: { label: string; path: string; payload: any }[] = [
    {
      label: 'URL',
      path: '/qr-code/generate',
      payload: { name: 'Site', content: 'https://exemple.test/atelier', size: 300 },
    },
    {
      label: 'vCard',
      path: '/qr-code/vcard',
      payload: {
        name: 'Camille Roux',
        phone: '+33 4 78 00 00 00',
        email: 'contact@atelier-lumiere.test',
        organization: 'Atelier Lumiere',
      },
    },
    {
      label: 'WiFi',
      path: '/qr-code/wifi',
      payload: { ssid: 'Atelier-Lumiere', password: 'bonjour123', encryption: 'WPA' },
    },
  ];

  for (const qr of qrCases) {
    const res = await call(qr.path, { method: 'POST', body: JSON.stringify(qr.payload) });
    const base64 = res.body?.data?.base64 || res.body?.base64;
    const ok = (res.status === 200 || res.status === 201) && typeof base64 === 'string';
    check(
      `${qr.label}: genere`,
      ok && base64.startsWith('data:image/png;base64,'),
      ok ? `${Math.round(base64.length / 1024)} Ko` : `HTTP ${res.status}`,
    );
  }

  // T-36 in the remediation log: generated codes used to vanish, so GET
  // /qr-code always answered with an empty list. Listing is the assertion.
  const qrList = await call('/qr-code');
  const qrRows = Array.isArray(qrList.body) ? qrList.body : qrList.body?.items || [];
  check('les QR sont persistes', qrRows.length >= qrCases.length, `${qrRows.length} enregistre(s)`);

  // ------------------------------------------------------- 6. isolation
  console.log('\n6. Isolation multi-tenant');
  const foreign = await call('/content', { headers: { 'X-Tenant-Slug': 'admin' } });
  check(
    'un slug etranger est refuse',
    foreign.status === 403,
    `HTTP ${foreign.status}`,
  );

  console.log(
    failures === 0
      ? '\nTOUT PASSE\n'
      : `\n${failures} CONTROLE(S) EN ECHEC\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
