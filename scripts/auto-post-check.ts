/**
 * The auto-posting chain, end to end.
 *
 * What it proves without any platform credentials:
 *  - the OAuth flow refuses to start on a platform this deployment cannot
 *    connect, and says which variable is missing, instead of minting a fake
 *    token the way the old simulation did;
 *  - the signed state cannot be forged;
 *  - an armed event that is due is picked up, attempted, and records the real
 *    reason it could not go out — on the row, where its owner can read it;
 *  - nothing publishes unless its owner armed it.
 *
 *   npm run test:autopost
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const API = process.env.E2E_API || 'http://localhost:4000';
const STAMP = Date.now().toString().slice(-6);
const EMAIL = `autopost-${STAMP}@example.test`;
const PASSWORD = 'Test1234!post';
const SLUG = `autopost-${STAMP}`;

const prisma = new PrismaClient();
let token = '';
let failures = 0;

function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(120_000),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}`, 'X-Tenant-Slug': SLUG } : {}),
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
  const message = Array.isArray(body?.message) ? body.message.join('; ') : body?.message || '';
  return {
    status: res.status,
    body: body?.data ?? body,
    msg: String(message).slice(0, 200),
    location: res.headers.get('location') || '',
  };
}

async function main() {
  console.log(`\nAPI: ${API}`);

  // ---------------------------------------------------------------- compte
  console.log('\n1. Compte');
  const reg = await call('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      firstName: 'Auto',
      lastName: 'Post',
      tenantName: 'Cafe Auto',
      tenantSlug: SLUG,
      industry: 'Restauration',
    }),
  });
  token = reg.body?.accessToken || '';
  check('inscription', Boolean(token), `HTTP ${reg.status}`);
  if (!token) process.exit(1);

  // ------------------------------------------------------------- 2. OAuth
  console.log('\n2. OAuth');
  const status = await call('/social/oauth/status');
  check('le statut de connexion repond', status.status === 200, `HTTP ${status.status}`);
  const configured = (status.body?.platforms || []).filter((p: any) => p.configured);
  console.log(`       redirect_uri: ${status.body?.redirectUri}`);
  console.log(`       plateformes configurees: ${configured.length}/4`);

  // The old behaviour was to hand back a link to our own callback carrying
  // code=fake_auth_code_123. Refusing is the correct answer here.
  const url = await call('/social/oauth/FACEBOOK/url');
  if (configured.some((p: any) => p.platform === 'FACEBOOK')) {
    check(
      'une vraie URL Facebook est produite',
      String(url.body?.url || '').startsWith('https://www.facebook.com/'),
      String(url.body?.url || '').slice(0, 70),
    );
  } else {
    check(
      'sans identifiants, la connexion est refusee explicitement',
      url.status === 400 && /CLIENT_ID/.test(url.msg),
      url.msg.slice(0, 110),
    );
  }

  const forged = await call('/social/oauth/callback?code=x&state=autre-tenant.FACEBOOK.n.signature');
  check(
    'un state forge est rejete',
    forged.status === 302 && /connected=0/.test(forged.location),
    forged.location.slice(0, 80) || `HTTP ${forged.status}`,
  );

  const accounts = await prisma.socialAccount.count({ where: { tenant: { slug: SLUG } } });
  check('aucun compte bidon n a ete cree', accounts === 0, `${accounts} compte(s)`);

  // -------------------------------------------------- 3. calendrier + arme
  console.log('\n3. Calendrier et armement');
  const calendar = await call('/planner', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Test publication',
      description: 'Verification de la publication automatique',
      startDate: new Date().toISOString(),
    }),
  });
  check('calendrier cree', calendar.status < 300, `HTTP ${calendar.status}`);
  const calendarId = calendar.body?.id;

  // Due a minute ago, so the scheduler considers it immediately.
  const past = new Date(Date.now() - 60_000).toISOString();
  const event = await call(`/planner/${calendarId}/events`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Soiree du jeudi',
      description: 'Ce jeudi, pate maturee 48h et four a bois. Reservez votre table.',
      platform: 'FACEBOOK',
      scheduledAt: past,
    }),
  });
  check('evenement cree', event.status < 300, `HTTP ${event.status}`);
  const eventId = event.body?.id;

  const created = await prisma.calendarEvent.findUnique({ where: { id: eventId } });
  check(
    'il n est PAS arme par defaut',
    created?.autoPublish === false,
    'un calendrier est une proposition tant que son proprietaire n a pas tranche',
  );

  // ------------------------------------------------- 4. le planificateur
  console.log('\n4. Le planificateur');
  const { AutoPostService } = await import('../src/modules/planner/auto-post.service');
  const { SocialPublisherService } = await import('../src/modules/social/social-publisher.service');
  const autoPost = new AutoPostService(prisma as any, new SocialPublisherService());

  const beforeArming = await autoPost.publishDue();
  check(
    'un evenement non arme est ignore',
    beforeArming.published === 0 && beforeArming.failed === 0,
    `${beforeArming.published} publie(s), ${beforeArming.failed} echec(s)`,
  );

  await call(`/planner/events/${eventId}/auto-publish`, {
    method: 'PUT',
    body: JSON.stringify({ enabled: true }),
  });
  const armed = await prisma.calendarEvent.findUnique({ where: { id: eventId } });
  check('il peut etre arme', armed?.autoPublish === true);

  const afterArming = await autoPost.publishDue();
  const attempted = await prisma.calendarEvent.findUnique({ where: { id: eventId } });
  check(
    'arme et du, il est pris en charge',
    (attempted?.attempts ?? 0) > 0,
    `${attempted?.attempts} tentative(s), statut ${attempted?.status}`,
  );
  check(
    'la raison est enregistree sur la ligne',
    Boolean(attempted?.error),
    String(attempted?.error || '').slice(0, 95),
  );
  check(
    'un refus definitif ne consomme pas les 3 essais',
    attempted?.status === 'FAILED' && attempted?.attempts === 1,
    `statut ${attempted?.status}, ${attempted?.attempts} tentative(s)`,
  );
  console.log(`       (${afterArming.failed} echec(s) — attendu: aucun compte connecte)`);

  // ------------------------------------------------------ 5. la restitution
  console.log('\n5. Restitution au proprietaire');
  const report = await call(`/planner/${calendarId}/publishing`);
  check('le rapport repond', report.status === 200, `HTTP ${report.status}`);
  check(
    'il expose le statut par evenement',
    Array.isArray(report.body?.events) && report.body.events.length > 0,
    JSON.stringify(report.body?.counts || {}),
  );

  console.log(
    failures === 0
      ? '\nTOUT PASSE — la chaine est en place; il manque les identifiants plateformes.\n'
      : `\n${failures} CONTROLE(S) EN ECHEC\n`,
  );
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
