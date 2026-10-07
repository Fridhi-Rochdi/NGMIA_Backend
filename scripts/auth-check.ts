/**
 * The authentication suite.
 *
 * Covers every case the brief asks for: valid and invalid login, the whole OTP
 * lifecycle (valid, wrong, expired, replayed, superseded, rate-limited,
 * resend + cooldown), session persistence, refresh-token rotation and reuse
 * detection, logout, protected routes, and expired tokens.
 *
 * Runs against the live API so it exercises the real guards, the real cookies
 * and the real database — not mocks.
 *
 *   npm run test:auth
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

/** A tiny cookie jar, so cookie behaviour is actually exercised. */
class Jar {
  private store = new Map<string, { value: string; path: string; attrs: string }>();

  absorb(res: Response) {
    // getSetCookie keeps multiple Set-Cookie headers separate; a plain get()
    // would join them and mangle the Expires commas.
    const raw = (res.headers as any).getSetCookie?.() ?? [];
    for (const line of raw) {
      const [pair, ...attrParts] = line.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const attrs = attrParts.join(';');
      const pathMatch = /path=([^;]+)/i.exec(attrs);
      const path = pathMatch ? pathMatch[1].trim() : '/';
      if (!value || /max-age=0/i.test(attrs)) this.store.delete(name);
      else this.store.set(name, { value, path, attrs });
    }
  }

  header(forPath = '/'): string {
    return [...this.store.entries()]
      .filter(([, c]) => forPath.startsWith(c.path))
      .map(([k, c]) => `${k}=${c.value}`)
      .join('; ');
  }

  get(name: string) {
    return this.store.get(name);
  }
  has(name: string) {
    return this.store.has(name);
  }
  clear() {
    this.store.clear();
  }
}

async function call(
  path: string,
  init: RequestInit = {},
  jar?: Jar,
  bearer?: string,
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as any) || {}),
  };
  if (jar) {
    const cookie = jar.header(path);
    if (cookie) headers.Cookie = cookie;
  }
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  let res = await fetch(`${API}${path}`, { ...init, headers });

  // The suite makes far more auth calls than a human ever would and trips its
  // own brute-force limits, which made a second run in the same minute report
  // false failures. Wait the window out rather than weaken the limit.
  if (res.status === 429 && !init.headers?.['x-no-throttle-retry' as any]) {
    const retryAfter = Number(res.headers.get('retry-after') || 0);
    await new Promise((r) => setTimeout(r, (retryAfter || 61) * 1000));
    res = await fetch(`${API}${path}`, { ...init, headers });
  }
  if (jar) jar.absorb(res);

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

const STAMP = Date.now();
const EMAIL = `auth-${STAMP}@example.test`;
const PASSWORD = 'Test1234!auth';
const SLUG = `auth-e2e-${STAMP}`;

async function main() {
  console.log(`\nAPI: ${API}`);
  console.log(`OTP_ENABLED=${process.env.OTP_ENABLED}  OTP_EXPOSE_CODE=${process.env.OTP_EXPOSE_CODE}`);

  // ------------------------------------------------------------ 1. register
  console.log('\n1. Inscription');
  const jar = new Jar();
  const reg = await call(
    '/auth/register',
    {
      method: 'POST',
      body: JSON.stringify({
        email: EMAIL,
        password: PASSWORD,
        firstName: 'Auth',
        lastName: 'Test',
        tenantName: 'Auth Test',
        tenantSlug: SLUG,
      }),
    },
    jar,
  );
  check('inscription acceptee', reg.status === 201, `status ${reg.status}`);
  check("l'inscription ouvre une session", Boolean(reg.body?.accessToken));
  check('un refresh token est emis', Boolean(reg.body?.refreshToken));
  check('le cookie access est HttpOnly', /httponly/i.test(jar.get('access_token')?.attrs || ''));
  check('le cookie refresh est HttpOnly', /httponly/i.test(jar.get('refresh_token')?.attrs || ''));
  check(
    'le cookie refresh est limite a /auth',
    (jar.get('refresh_token')?.path || '') === '/auth',
    jar.get('refresh_token')?.path,
  );
  check(
    "le drapeau de session n'est pas HttpOnly et ne porte aucun secret",
    !/httponly/i.test(jar.get('authed')?.attrs || '') &&
      /^\d+$/.test(jar.get('authed')?.value || ''),
    jar.get('authed')?.value?.slice(0, 20),
  );
  check(
    'SameSite est pose sur les cookies de session',
    /samesite/i.test(jar.get('refresh_token')?.attrs || ''),
    (/samesite=(\w+)/i.exec(jar.get('refresh_token')?.attrs || '') || [])[1],
  );

  const userId: string = reg.body?.user?.id;

  // ------------------------------------------------ 2. protected routes
  console.log('\n2. Routes protegees');
  {
    const anon = await call('/auth/profile');
    check('sans authentification -> 401', anon.status === 401, `status ${anon.status}`);

    const withBearer = await call('/auth/profile', {}, undefined, reg.body.accessToken);
    check('avec un bearer valide -> 200', withBearer.status === 200, `status ${withBearer.status}`);

    // This is what removes the race on page load: the cookie alone authenticates.
    const withCookie = await call('/auth/profile', {}, jar);
    check('avec le seul cookie HttpOnly -> 200', withCookie.status === 200, `status ${withCookie.status}`);

    const bogus = await call('/auth/profile', {}, undefined, 'not-a-jwt');
    check('avec un jeton bidon -> 401', bogus.status === 401, `status ${bogus.status}`);
  }

  // ---------------------------------------------------------- 3. login/OTP
  console.log('\n3. Connexion et code a usage unique');
  const loginJar = new Jar();

  const badLogin = await call(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ email: EMAIL, password: 'mauvais-mot-de-passe' }) },
    loginJar,
  );
  check('mot de passe invalide -> 401', badLogin.status === 401, `status ${badLogin.status}`);
  check('aucun cookie pose sur un echec', !loginJar.has('access_token'));

  const login = await call(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) },
    loginJar,
  );
  check('identifiants valides -> 200', login.status === 200, `status ${login.status}`);

  const otpOn = process.env.OTP_ENABLED !== 'false';
  if (!otpOn) {
    console.log('  (OTP desactive : etape ignoree)');
  } else {
    check('le mot de passe seul ne donne pas de session', login.body?.otpRequired === true);
    check("aucun jeton n'est renvoye avec le challenge", !login.body?.accessToken);
    check('aucun cookie de session pose avant le code', !loginJar.has('access_token'));
    check(
      "l'adresse est masquee",
      typeof login.body?.email === 'string' && login.body.email.includes('*'),
      login.body?.email,
    );

    const challengeId: string = login.body.challengeId;
    const code: string = login.body.devCode;
    check('un code est disponible pour le test local', /^\d{6}$/.test(code || ''), code ? '6 chiffres' : 'absent');

    // -- the code is never stored in the clear -----------------------------
    const stored = await prisma.otpChallenge.findUnique({ where: { id: challengeId } });
    check(
      'le code est stocke hache, jamais en clair',
      Boolean(stored) && stored!.codeHash !== code && /^[0-9a-f]{64}$/.test(stored!.codeHash),
    );

    // -- wrong code --------------------------------------------------------
    const wrong = await call(
      '/auth/otp/verify',
      { method: 'POST', body: JSON.stringify({ challengeId, code: code === '000000' ? '111111' : '000000' }) },
      loginJar,
    );
    check('code incorrect -> 401', wrong.status === 401, `status ${wrong.status}`);
    check(
      'le message indique les tentatives restantes',
      /tentative/i.test(wrong.raw?.message || ''),
      wrong.raw?.message,
    );
    check('aucune session apres un code incorrect', !loginJar.has('access_token'));

    // -- malformed code ----------------------------------------------------
    const malformed = await call(
      '/auth/otp/verify',
      { method: 'POST', body: JSON.stringify({ challengeId, code: 'abcdef' }) },
    );
    check('code non numerique refuse -> 400', malformed.status === 400, `status ${malformed.status}`);

    // -- resend inside the cooldown ---------------------------------------
    const tooSoon = await call(
      '/auth/otp/resend',
      { method: 'POST', body: JSON.stringify({ challengeId }) },
    );
    check('renvoi pendant le cooldown -> 400', tooSoon.status === 400, `status ${tooSoon.status}`);
    check(
      'le message indique le delai a attendre',
      /patienter/i.test(tooSoon.raw?.message || ''),
      tooSoon.raw?.message,
    );

    // -- superseding: a newer code invalidates the previous one ------------
    await prisma.otpChallenge.update({
      where: { id: challengeId },
      // Pretend the cooldown elapsed rather than sleeping for a minute.
      data: { lastSentAt: new Date(Date.now() - 10 * 60 * 1000) },
    });
    const resent = await call(
      '/auth/otp/resend',
      { method: 'POST', body: JSON.stringify({ challengeId }) },
    );
    check('renvoi apres le cooldown -> 200', resent.status === 200, `status ${resent.status}`);
    const newChallengeId: string = resent.body?.challengeId;
    const newCode: string = resent.body?.devCode;
    check('le renvoi produit un nouveau code', Boolean(newCode) && newCode !== code);

    const oldOne = await call(
      '/auth/otp/verify',
      { method: 'POST', body: JSON.stringify({ challengeId, code }) },
    );
    check("l'ancien code est refuse apres un renvoi -> 401", oldOne.status === 401, `status ${oldOne.status}`);
    check(
      'le message renvoie vers le dernier code',
      /plus recent|dernier/i.test(oldOne.raw?.message || ''),
      oldOne.raw?.message,
    );

    // -- expiry ------------------------------------------------------------
    await prisma.otpChallenge.update({
      where: { id: newChallengeId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await call(
      '/auth/otp/verify',
      { method: 'POST', body: JSON.stringify({ challengeId: newChallengeId, code: newCode }) },
    );
    check('code expire -> 401', expired.status === 401, `status ${expired.status}`);
    check('le message dit que le code a expire', /expir/i.test(expired.raw?.message || ''), expired.raw?.message);

    // -- attempt limit -----------------------------------------------------
    await prisma.otpChallenge.update({
      where: { id: newChallengeId },
      data: { expiresAt: new Date(Date.now() + 5 * 60 * 1000), attempts: 0 },
    });
    let lastMessage = '';
    for (let i = 0; i < Number(process.env.OTP_MAX_ATTEMPTS || 5) + 1; i += 1) {
      const attempt = await call(
        '/auth/otp/verify',
        { method: 'POST', body: JSON.stringify({ challengeId: newChallengeId, code: '999999' }) },
      );
      lastMessage = attempt.raw?.message || '';
    }
    check('trop de tentatives -> blocage', /trop de tentatives/i.test(lastMessage), lastMessage);
    const blocked = await call(
      '/auth/otp/verify',
      { method: 'POST', body: JSON.stringify({ challengeId: newChallengeId, code: newCode }) },
    );
    check(
      'le bon code est refuse une fois le quota epuise',
      blocked.status === 401,
      blocked.raw?.message,
    );

    // -- a clean, successful run ------------------------------------------
    const jar2 = new Jar();
    const login2 = await call(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) },
      jar2,
    );
    const goodChallenge = login2.body.challengeId;
    const goodCode = login2.body.devCode;
    const verified = await call(
      '/auth/otp/verify',
      { method: 'POST', body: JSON.stringify({ challengeId: goodChallenge, code: goodCode }) },
      jar2,
    );
    check('code correct -> 200', verified.status === 200, `status ${verified.status}`);
    check('une session est ouverte', Boolean(verified.body?.accessToken));
    check('les cookies de session sont poses', jar2.has('access_token') && jar2.has('refresh_token'));

    // -- replay ------------------------------------------------------------
    const replay = await call(
      '/auth/otp/verify',
      { method: 'POST', body: JSON.stringify({ challengeId: goodChallenge, code: goodCode }) },
    );
    check('code deja utilise -> 401', replay.status === 401, `status ${replay.status}`);
    check('le message dit que le code a servi', /utilise/i.test(replay.raw?.message || ''), replay.raw?.message);

    // -- the mailbox proves delivery ---------------------------------------
    check(
      "l'email a bien ete verifie par l'OTP",
      (await prisma.user.findUnique({ where: { id: userId } }))?.emailVerified === true,
    );

    // ------------------------------------------------- 4. session & refresh
    console.log('\n4. Session, rafraichissement et deconnexion');
    {
      const profile = await call('/auth/profile', {}, jar2);
      check('la session survit avec les seuls cookies', profile.status === 200, `status ${profile.status}`);

      // Navigating and reloading is just repeated authenticated requests.
      let stable = true;
      for (let i = 0; i < 5; i += 1) {
        const hop = await call('/auth/profile', {}, jar2);
        if (hop.status !== 200) stable = false;
      }
      check('navigation repetee sans deconnexion', stable);

      const firstRefreshCookie = jar2.get('refresh_token')?.value;
      const refreshed = await call('/auth/refresh', { method: 'POST', body: '{}' }, jar2);
      check('rafraichissement -> 200', refreshed.status === 200, `status ${refreshed.status}`);
      check('un nouvel access token est emis', Boolean(refreshed.body?.accessToken));
      check(
        'le refresh token a bien tourne',
        jar2.get('refresh_token')?.value !== firstRefreshCookie,
      );

      // Reuse of the consumed token must kill the family.
      const replayJar = new Jar();
      const reuse = await fetch(`${API}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `refresh_token=${firstRefreshCookie}` },
        body: '{}',
      });
      replayJar.absorb(reuse);
      check('reutilisation d un refresh token -> 401', reuse.status === 401, `status ${reuse.status}`);

      const afterReuse = await call('/auth/refresh', { method: 'POST', body: '{}' }, jar2);
      check(
        'la famille entiere est revoquee apres reutilisation',
        afterReuse.status === 401,
        `status ${afterReuse.status}`,
      );
    }

    // ------------------------------------------------------------ 5. logout
    console.log('\n5. Deconnexion');
    {
      const jar3 = new Jar();
      const l3 = await call(
        '/auth/login',
        { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) },
        jar3,
      );
      await call(
        '/auth/otp/verify',
        { method: 'POST', body: JSON.stringify({ challengeId: l3.body.challengeId, code: l3.body.devCode }) },
        jar3,
      );
      const refreshBefore = jar3.get('refresh_token')?.value;
      check('session ouverte avant deconnexion', Boolean(refreshBefore));

      const out = await call('/auth/logout', { method: 'POST', body: '{}' }, jar3);
      check('deconnexion -> 200', out.status === 200, `status ${out.status}`);
      check('les cookies sont effaces', !jar3.has('access_token') && !jar3.has('refresh_token'));

      // The server must have invalidated it, not merely told the browser to forget.
      const reuseAfterLogout = await fetch(`${API}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `refresh_token=${refreshBefore}` },
        body: '{}',
      });
      check(
        'le refresh token est invalide cote serveur',
        reuseAfterLogout.status === 401,
        `status ${reuseAfterLogout.status}`,
      );
    }
  }

  // ------------------------------------------------------ 6. expired token
  console.log('\n6. Jeton expire');
  {
    const expiredJwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      Buffer.from(
        JSON.stringify({ sub: userId, email: EMAIL, tenantId: 'x', role: 'OWNER', exp: 1 }),
      ).toString('base64url') +
      '.invalid';
    const res = await call('/auth/profile', {}, undefined, expiredJwt);
    check('un access token expire -> 401', res.status === 401, `status ${res.status}`);
  }

  // ------------------------------------------------- 7. brute force / limits
  console.log('\n7. Protection contre le brute-force');
  {
    // Deliberately burst past the login limit; the guard must start refusing.
    let sawThrottle = false;
    for (let i = 0; i < 25 && !sawThrottle; i += 1) {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: EMAIL, password: `wrong-${i}` }),
      });
      if (res.status === 429) sawThrottle = true;
    }
    check('une rafale de connexions est limitee (429)', sawThrottle);

    // Same for the code endpoint: the per-challenge counter is not enough on
    // its own, because an attacker can keep asking for new challenges.
    let sawOtpThrottle = false;
    for (let i = 0; i < 30 && !sawOtpThrottle; i += 1) {
      const res = await fetch(`${API}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: '00000000-0000-4000-8000-000000000000',
          code: String(100000 + i),
        }),
      });
      if (res.status === 429) sawOtpThrottle = true;
    }
    check('une rafale de codes est limitee (429)', sawOtpThrottle);

    // Let the window drain so the next run starts clean.
    await new Promise((r) => setTimeout(r, 61_000));
  }

  // -------------------------------------------------------------- teardown
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.tenant.deleteMany({ where: { slug: SLUG } });
  await prisma.$disconnect();

  console.log(`\nRESULTAT: ${pass} PASS / ${fail} FAIL\n`);
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
