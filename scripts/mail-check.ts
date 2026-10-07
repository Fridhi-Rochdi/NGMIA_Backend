/**
 * Proves the configured mail transport actually delivers.
 *
 * Sends one real message through whatever MAIL_TRANSPORT is set to. With
 * `file` it lands in storage/mail; with `smtp` it goes out for real, so run it
 * against an address you own.
 *
 *   npx ts-node scripts/mail-check.ts [destinataire]
 */
import 'dotenv/config';
import { MailService } from '../src/common/mail/mail.service';

async function main() {
  const to = process.argv[2] || process.env.SMTP_USER || process.env.MAIL_TEST_TO;
  if (!to) {
    console.error('Aucun destinataire. Passez-en un en argument ou definissez SMTP_USER.');
    process.exit(1);
  }

  const transport = process.env.MAIL_TRANSPORT || (process.env.SMTP_HOST ? 'smtp' : 'file');
  console.log(`\ntransport : ${transport}`);
  console.log(`hote      : ${process.env.SMTP_HOST || '(aucun)'}:${process.env.SMTP_PORT || '-'}`);
  console.log(`expediteur: ${process.env.MAIL_FROM}`);
  console.log(`destinataire: ${to}\n`);

  const mail = new MailService();
  mail.onModuleInit();

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const started = Date.now();
  try {
    await mail.send({
      to,
      subject: `Test de configuration — code ${code}`,
      text: [
        'Ceci est un test de la configuration email de NextGen MarketingAI.',
        '',
        `Code de demonstration : ${code}`,
        '',
        "Si vous recevez ce message, l'envoi des codes de connexion fonctionne.",
      ].join('\n'),
    });
    console.log(`Envoi reussi en ${((Date.now() - started) / 1000).toFixed(1)}s.`);
    if (transport === 'file') {
      console.log('Message ecrit dans storage/mail.');
    }
    process.exit(0);
  } catch (error: any) {
    console.error(`Echec de l'envoi : ${error?.message}`);
    if (/invalid login|username and password/i.test(error?.message || '')) {
      console.error(
        "\nGmail refuse les identifiants. Verifiez que SMTP_USER est bien le compte\n" +
          "auquel le mot de passe d'application appartient, et que la validation en\n" +
          'deux etapes est active sur ce compte.',
      );
    }
    process.exit(1);
  }
}

main();
