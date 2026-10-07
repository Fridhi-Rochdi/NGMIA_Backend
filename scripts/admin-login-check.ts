/**
 * The admin console's login contract, end to end.
 *
 * The console read `data.accessToken` straight off POST /auth/login. With the
 * second factor on — which is the default, OTP_ENABLED !== 'false' — the
 * backend answers a challenge instead, so that read was undefined and the
 * console could not be logged into at all. This walks the real two-step flow
 * and asserts the session that comes out carries isSuperAdmin.
 *
 *   npx ts-node scripts/admin-login-check.ts
 */
import 'dotenv/config';

const API = process.env.E2E_API || 'http://localhost:4000';
const EMAIL = process.env.ADMIN_EMAIL || '';
const PASSWORD = process.env.ADMIN_PASSWORD || '';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  return { status: res.status, body: payload?.data ?? payload };
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.log('\nADMIN_EMAIL / ADMIN_PASSWORD absents de backend/.env — controle ignore.\n');
    process.exit(0);
  }

  console.log(`\nAPI: ${API}`);
  console.log(`Compte: ${EMAIL.replace(/^(.{2}).*(@.*)$/, '$1***$2')}`);

  // -------------------------------------------------------------- 1. step one
  console.log('\n1. Identifiants');
  const first = await post('/auth/login', { email: EMAIL, password: PASSWORD });
  check('login repond 200', first.status === 200, `HTTP ${first.status}`);

  const otpOn = process.env.OTP_ENABLED !== 'false';
  check(
    otpOn ? 'un challenge OTP est renvoye' : 'une session est renvoyee directement',
    otpOn ? Boolean(first.body?.otpRequired) : Boolean(first.body?.accessToken),
    otpOn ? `challenge ${String(first.body?.challengeId || '').slice(0, 8)}` : '',
  );

  let session = first.body;

  // -------------------------------------------------------------- 2. step two
  if (first.body?.otpRequired) {
    console.log('\n2. Code a usage unique');
    check("l'email est masque", /\*/.test(String(first.body.email || '')), first.body.email);

    const code = first.body.devCode;
    if (!code) {
      console.log(
        '  --   OTP_EXPOSE_CODE desactive: le code part par email, verification manuelle.',
      );
      console.log('\nCONTROLE PARTIEL (etape 1 validee)\n');
      process.exit(failures === 0 ? 0 : 1);
    }

    const wrong = await post('/auth/otp/verify', {
      challengeId: first.body.challengeId,
      code: code === '000000' ? '111111' : '000000',
    });
    check('un mauvais code est refuse', wrong.status === 401, `HTTP ${wrong.status}`);

    const verified = await post('/auth/otp/verify', {
      challengeId: first.body.challengeId,
      code,
    });
    check('le bon code ouvre la session', verified.status === 200, `HTTP ${verified.status}`);
    session = verified.body;
  }

  // ------------------------------------------------------------ 3. the session
  console.log('\n3. Session');
  check('un access token est delivre', Boolean(session?.accessToken));
  check('le compte est super-admin', session?.user?.isSuperAdmin === true, `isSuperAdmin ${session?.user?.isSuperAdmin}`);

  // The console is useless if the token it just obtained cannot read /admin.
  if (session?.accessToken) {
    const stats = await fetch(`${API}/admin/stats`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    check('ce token lit /admin/stats', stats.status === 200, `HTTP ${stats.status}`);
  }

  console.log(failures === 0 ? '\nTOUT PASSE\n' : `\n${failures} CONTROLE(S) EN ECHEC\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
