/**
 * Exercise every generator in the product for one existing account, and report
 * what each one actually produced.
 *
 * This is not a pass/fail suite like the other e2e scripts: it is a quality
 * probe. It creates one of everything, then prints the measurements that say
 * whether the output is expert work or a filled-in template — section counts,
 * copy lengths, how many images are real files, whether the palette moved off
 * the default, whether a reel actually speaks.
 *
 *   E2E_EMAIL=... E2E_PASSWORD=... npx ts-node scripts/full-feature-check.ts
 */
import 'dotenv/config';

const API = process.env.E2E_API || 'http://localhost:4000';
const EMAIL = process.env.E2E_EMAIL || 'site-e2e-1789508413152@example.test';
const PASSWORD = process.env.E2E_PASSWORD || 'Test1234!site';

let token = '';
let tenantSlug = '';
const results: { feature: string; status: string; detail: string }[] = [];

function record(feature: string, status: 'OK' | 'FAIBLE' | 'ECHEC', detail: string) {
  results.push({ feature, status, detail });
  const mark = status === 'OK' ? 'ok  ' : status === 'FAIBLE' ? 'faib' : 'FAIL';
  console.log(`  ${mark} ${feature} — ${detail}`);
}

async function call(path: string, init: RequestInit = {}, timeoutMs = 900_000) {
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
    // The envelope puts the reason in `message`; printing the object gave
    // "[object Object]" and hid every diagnosis behind a status code.
    const message = Array.isArray(body?.message)
      ? body.message.join('; ')
      : body?.message || (typeof body === 'string' ? body : '');
    return {
      status: res.status,
      body: body?.data !== undefined ? body.data : body,
      raw: String(message || JSON.stringify(body ?? '')).slice(0, 220),
    };
  } catch (error: any) {
    return { status: 0, body: null, raw: String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

/** Marketing filler that says nothing about this particular business. */
const FILLER =
  /\b(delicieux|savoureux|succulent|exquis|incontournable|authentique|unique|exceptionnel|gourmand|passion|solution|experience unique|n'hesitez pas|fait avec amour)\b/i;

function fillerCount(text: string): number {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .match(new RegExp(FILLER.source, 'gi')) || []
  ).length;
}

async function login() {
  console.log(`\nAPI: ${API}`);
  console.log(`Compte: ${EMAIL}`);
  console.log('\n0. Connexion');

  const first = await call('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  let session = first.body;

  if (session?.otpRequired) {
    if (!session.devCode) throw new Error('OTP actif sans devCode: impossible sans boite mail');
    const verified = await call('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ challengeId: session.challengeId, code: session.devCode }),
    });
    session = verified.body;
  }

  token = session?.accessToken;
  tenantSlug = session?.user?.tenant?.slug;
  if (!token) throw new Error(`connexion impossible (HTTP ${first.status})`);
  console.log(`  ok   session ouverte — tenant ${tenantSlug}`);
}

async function main() {
  await login();

  // ------------------------------------------------------------- 1. contexte
  console.log('\n1. Contexte business');
  const ctx = await call('/business-context', {
    method: 'PUT',
    body: JSON.stringify({
      businessName: 'Trattoria Nonna Lidia',
      businessType: 'PIZZERIA',
      industry: 'Restauration',
      description:
        'Pizzeria napolitaine, pate maturee 48 heures, four a bois a 480 degres, mozzarella di bufala campana DOP livree deux fois par semaine.',
      services: ['Pizza au feu de bois', 'Antipasti', 'Vente a emporter'],
      targetAudience: 'Familles et couples du quartier, le soir et le week-end',
      tone: 'friendly',
      language: 'fr',
      currency: 'EUR',
      contactPhone: '+33 1 42 00 00 00',
      contactEmail: 'bonjour@nonna-lidia.test',
      contactAddress: '12 rue des Abbesses, 75018 Paris',
    }),
  });
  record('Contexte business', ctx.status < 300 ? 'OK' : 'ECHEC', `HTTP ${ctx.status}`);

  // ------------------------------------------------------------- 2. branding
  console.log('\n2. Branding');
  const brand = await call('/branding/generate', {
    method: 'POST',
    body: JSON.stringify({
      brandName: 'Trattoria Nonna Lidia',
      industry: 'Restauration',
      description: 'Pizzeria napolitaine, pate maturee 48h, four a bois.',
      style: 'classic',
      values: ['tradition', 'produit'],
    }),
  });
  if (brand.status >= 300) {
    record('Branding', 'ECHEC', `HTTP ${brand.status}`);
  } else {
    const b = brand.body || {};
    const hasLogo = Boolean(b.logo);
    const variants = b.logoVariants ? Object.keys(b.logoVariants).length : 0;
    const defaultPalette = String(b.primaryColor).toLowerCase() === '#3b82f6';
    record(
      'Branding',
      hasLogo && !defaultPalette ? 'OK' : 'FAIBLE',
      `palette ${b.primaryColor}/${b.accentColor}, logo ${hasLogo ? `oui (${variants} variantes)` : 'MANQUANT'}, slogan "${String(b.tagline || '').slice(0, 45)}"`,
    );
  }

  // -------------------------------------------------------------- 3. contenu
  console.log('\n3. Contenu marketing');
  const content = await call('/content/generate', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Soiree pizza du jeudi',
      type: 'POST',
      prompt: 'Annoncer la soiree pizza du jeudi soir, pate maturee 48h.',
      tone: 'friendly',
      length: 'SHORT',
    }),
  });
  if (content.status >= 300) {
    record('Contenu', 'ECHEC', `HTTP ${content.status}`);
  } else {
    const body = String(content.body?.body || '');
    const filler = fillerCount(body);
    record(
      'Contenu',
      body.length > 80 && filler === 0 ? 'OK' : 'FAIBLE',
      `${body.length} caracteres, ${filler} mot(s) de remplissage`,
    );
  }

  // ----------------------------------------------------------------- 4. menu
  console.log('\n4. Menu (long: IA + photographie)');
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
  let menuId = menu.body?.id;
  if (menu.status >= 300) {
    record('Menu', 'ECHEC', `HTTP ${menu.status} ${String(menu.raw).slice(0, 90)}`);
  } else {
    const cats = menu.body?.categories || menu.body?.content?.categories || [];
    const items = cats.reduce((n: number, c: any) => n + (c.items?.length || 0), 0);
    const descs = cats.flatMap((c: any) => (c.items || []).map((i: any) => String(i.description || '')));
    const filler = descs.reduce((n: number, d: string) => n + fillerCount(d), 0);
    const empty = descs.filter((d: string) => !d.trim()).length;
    record(
      'Menu',
      items >= 8 && filler === 0 && empty === 0 ? 'OK' : 'FAIBLE',
      `${cats.length} categories / ${items} plats, ${filler} remplissage, ${empty} description(s) vide(s)`,
    );
  }

  // Wait for the photography to land before judging it.
  if (menuId) {
    for (let i = 0; i < 60; i += 1) {
      const m = await call(`/menus/${menuId}`);
      const status = m.body?.visualStatus || m.body?.status;
      if (status === 'READY' || status === 'FAILED' || status === 'PARTIAL') {
        const html = String(m.body?.html || '');
        const imgs = (html.match(/<img/g) || []).length;
        const broken = (html.match(/src="(?:|#|about:blank)"/g) || []).length;
        record(
          'Menu — visuels',
          status === 'READY' && imgs > 0 && broken === 0 ? 'OK' : 'FAIBLE',
          `${status}, ${imgs} image(s), ${broken} cassee(s)`,
        );
        break;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }

    const publish = await call(`/menus/${menuId}/publish`, { method: 'POST' });
    const menuUrl = String(publish.body?.vercelUrl || '');
    const onVercel = /vercel\.app/i.test(menuUrl);
    record(
      'Menu — publication',
      publish.status < 300 && onVercel ? 'OK' : 'FAIBLE',
      onVercel ? menuUrl : `${menuUrl || `HTTP ${publish.status}`} (pas sur Vercel)`,
    );

    const qr = await call(`/menus/${menuId}/generate-qr`, { method: 'POST' });
    const qrTarget = String(qr.body?.url || '');
    record(
      'Menu — QR',
      qr.status < 300 && String(qr.body?.qrCodeUrl || '').startsWith('data:image/png') && /vercel\.app/i.test(qrTarget)
        ? 'OK'
        : 'FAIBLE',
      `HTTP ${qr.status}, cible ${qrTarget.slice(0, 70)}`,
    );
  }

  // -------------------------------------------------------------- 5. affiche
  console.log('\n5. Affiche');
  const poster = await call('/posters/generate', {
    method: 'POST',
    body: JSON.stringify({
      businessName: 'Trattoria Nonna Lidia',
      businessType: 'PIZZERIA',
      title: 'Soiree pizza du jeudi',
      description: 'Pate maturee 48h, four a bois, tous les jeudis soir.',
      format: 'A4',
      language: 'fr',
    }),
  });
  if (poster.status >= 300) {
    record('Affiche', 'ECHEC', `HTTP ${poster.status} ${String(poster.raw).slice(0, 90)}`);
  } else {
    const html = String(poster.body?.content || poster.body?.html || '');
    const imgs = (html.match(/<img|background-image/g) || []).length;
    record(
      'Affiche',
      html.length > 500 ? 'OK' : 'FAIBLE',
      `${(html.length / 1024).toFixed(0)} Ko, ${imgs} visuel(s)`,
    );
    if (poster.body?.id) {
      const pqr = await call(`/posters/${poster.body.id}/generate-qr`, { method: 'POST' });
      record('Affiche — QR', pqr.status < 300 ? 'OK' : 'ECHEC', `HTTP ${pqr.status}`);
    }
  }

  // --------------------------------------------------------------- 6. images
  console.log('\n6. Image marketing');
  const image = await call('/images/generate', {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'Pizza margherita sortant du four a bois, gros plan, lumiere chaude',
      style: 'realistic',
      size: '1024x1024',
    }),
  });
  record(
    'Image',
    image.status < 300 && image.body?.url ? 'OK' : 'ECHEC',
    image.status < 300 ? String(image.body?.url || '').slice(0, 60) : `HTTP ${image.status}`,
  );

  // --------------------------------------------------------------- 7. social
  console.log('\n7. Post social');
  const social = await call('/social/posts/generate', {
    method: 'POST',
    body: JSON.stringify({
      platform: 'INSTAGRAM',
      topic: 'La soiree pizza du jeudi, pate maturee 48h',
      tone: 'friendly',
    }),
  });
  const socialText = String(social.body?.content || social.body?.body || '');
  record(
    'Post social',
    social.status < 300 && socialText.length > 40 ? 'OK' : 'ECHEC',
    social.status < 300 ? `${socialText.length} caracteres` : `HTTP ${social.status}`,
  );

  // -------------------------------------------------------------- 8. planner
  console.log('\n8. Calendrier editorial');
  const planner = await call('/planner/generate', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Calendrier octobre',
      topic: 'Pizzeria napolitaine: plats, coulisses du four, soirees du jeudi',
      duration: 'MONTHLY',
      platforms: ['INSTAGRAM', 'FACEBOOK'],
      tone: 'friendly',
    }),
  });
  const events = planner.body?.events?.length ?? planner.body?.eventCount ?? 0;
  record(
    'Calendrier',
    planner.status < 300 ? 'OK' : 'ECHEC',
    planner.status < 300 ? `${events} evenement(s)` : `HTTP ${planner.status}`,
  );

  // ---------------------------------------------------------------- 9. reels
  console.log('\n9. Reel (long: script + photos + voix + encodage)');
  const reel = await call('/reels/generate', {
    method: 'POST',
    body: JSON.stringify({
      businessName: 'Trattoria Nonna Lidia',
      businessType: 'PIZZERIA',
      description: 'Pizzeria napolitaine, pate maturee 48h, four a bois.',
      platform: 'INSTAGRAM',
      theme: 'BUSINESS',
      tone: 'FRIENDLY',
      durationSec: 20,
    }),
  });
  if (reel.status >= 300) {
    record('Reel', 'ECHEC', `HTTP ${reel.status} ${String(reel.raw).slice(0, 90)}`);
  } else {
    const reelId = reel.body?.id;
    if (!reelId) {
      // Must not throw: the summary below is the point of the run.
      record('Reel', 'ECHEC', `aucun id renvoye — ${reel.raw}`);
    } else {
    let final: any = null;
    for (let i = 0; i < 90; i += 1) {
      const r = await call(`/reels/${reelId}`);
      if (['READY', 'PARTIAL', 'FAILED'].includes(r.body?.status)) {
        final = r.body;
        break;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    if (!final) {
      record('Reel', 'ECHEC', 'le rendu n a pas abouti dans le temps imparti');
    } else {
      const scenes = final.scenes || [];
      const withLines = scenes.filter((s: any) => s.voiceover?.trim()).length;
      const spoken = scenes.filter((s: any) => s.voiceUrl).length;
      const shot = scenes.filter((s: any) => s.imageUrl).length;
      record(
        'Reel',
        final.status === 'READY' ? 'OK' : 'FAIBLE',
        `${final.status}, ${scenes.length} scenes, ${shot} photographiees, ${spoken}/${withLines} dites, video ${final.videoUrl ? 'oui' : 'NON'}`,
      );
    }
    }
  }

  // ------------------------------------------------------------- 10. QR seuls
  console.log('\n10. QR autonomes');
  const qrUrl = await call('/qr-code/generate', {
    method: 'POST',
    body: JSON.stringify({ name: 'Site', content: 'https://nonna-lidia.test', size: 300 }),
  });
  record('QR URL', qrUrl.status < 300 ? 'OK' : 'ECHEC', `HTTP ${qrUrl.status}`);

  // ------------------------------------------------------------ 11. dashboard
  console.log('\n11. Tableau de bord');
  const dash = await call('/dashboard');
  record('Dashboard', dash.status < 300 ? 'OK' : 'ECHEC', `HTTP ${dash.status}`);

  // ------------------------------------------------------------------ bilan
  console.log('\n' + '='.repeat(64));
  const ko = results.filter((r) => r.status === 'ECHEC');
  const weak = results.filter((r) => r.status === 'FAIBLE');
  console.log(`BILAN: ${results.length - ko.length - weak.length} OK / ${weak.length} faible(s) / ${ko.length} echec(s)`);
  if (weak.length) {
    console.log('\nA ameliorer:');
    weak.forEach((r) => console.log(`  - ${r.feature}: ${r.detail}`));
  }
  if (ko.length) {
    console.log('\nEn echec:');
    ko.forEach((r) => console.log(`  - ${r.feature}: ${r.detail}`));
  }
  console.log('='.repeat(64) + '\n');
  process.exit(ko.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
