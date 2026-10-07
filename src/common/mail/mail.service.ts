import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Outbound email.
 *
 * Two transports, chosen by configuration rather than by NODE_ENV so that a
 * developer can point at a real SMTP server and a CI run can stay offline:
 *
 *   MAIL_TRANSPORT=smtp    real delivery through nodemailer
 *   MAIL_TRANSPORT=file    writes each message to storage/mail (the default
 *                          when no SMTP host is set)
 *
 * The file transport is what makes the OTP flow testable locally: the code
 * lands in a readable .txt next to the app instead of requiring a mailbox.
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private readonly outbox = resolve(process.cwd(), 'storage', 'mail');
  private transporter: any = null;

  private get mode(): 'smtp' | 'file' {
    const configured = String(process.env.MAIL_TRANSPORT || '').toLowerCase();
    if (configured === 'smtp' || configured === 'file') return configured;
    return process.env.SMTP_HOST ? 'smtp' : 'file';
  }

  onModuleInit() {
    if (this.mode === 'file') {
      mkdirSync(this.outbox, { recursive: true });
      this.logger.log(`Mail en mode fichier: ${this.outbox}`);
      return;
    }

    try {
      // Required lazily so the app still boots without the dependency when
      // the file transport is in use.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodemailer = require('nodemailer');
      const port = Number(process.env.SMTP_PORT || 587);
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        // 465 is implicit TLS; 587 upgrades with STARTTLS.
        secure: process.env.SMTP_SECURE
          ? process.env.SMTP_SECURE === 'true'
          : port === 465,
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
          : undefined,
      });
      this.logger.log(`Mail SMTP: ${process.env.SMTP_HOST}:${port}`);
    } catch (error: any) {
      this.logger.error(
        `SMTP indisponible (${error?.message}); bascule en mode fichier`,
      );
      mkdirSync(this.outbox, { recursive: true });
    }
  }

  /**
   * Send a message.
   *
   * An SMTP failure used to escape as a raw Error: Nest answered 500 and a
   * user whose password was right could not log in, with nothing on screen
   * saying why. Now:
   *
   * - outside production, the message falls back to the file outbox with a
   *   loud warning, so a broken local SMTP configuration (a revoked Gmail app
   *   password, typically) does not block development;
   * - in production, it fails with a 503 the user can read. An OTP that was
   *   never delivered is still never reported as sent.
   */
  async send(message: MailMessage): Promise<void> {
    const from = process.env.MAIL_FROM || 'NextGen MarketingAI <no-reply@localhost>';

    if (this.mode === 'file' || !this.transporter) {
      this.writeToOutbox(from, message);
      return;
    }

    try {
      await this.transporter.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      this.logger.log(`Mail envoye a ${this.mask(message.to)}`);
    } catch (error: any) {
      // nodemailer's message carries the server reply, never the password.
      const reason = String(error?.message || error).split('\n')[0];
      const hint =
        error?.code === 'EAUTH'
          ? ' Identifiants SMTP refuses : pour Gmail, generez un nouveau mot de passe ' +
            "d'application et mettez-le dans SMTP_PASSWORD."
          : '';
      this.logger.error(`Echec SMTP vers ${this.mask(message.to)} : ${reason}.${hint}`);

      if (process.env.NODE_ENV !== 'production') {
        this.logger.warn('Hors production : le message est ecrit dans storage/mail a la place.');
        this.writeToOutbox(from, message);
        return;
      }
      throw new ServiceUnavailableException(
        "L'envoi de l'e-mail est momentanement impossible. Reessayez dans quelques minutes.",
      );
    }
  }

  /** Write the message as a readable .txt in storage/mail. */
  private writeToOutbox(from: string, message: MailMessage): void {
    mkdirSync(this.outbox, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safe = message.to.replace(/[^a-z0-9@._-]/gi, '_');
    const file = join(this.outbox, `${stamp}_${safe}.txt`);
    writeFileSync(
      file,
      [
        `From: ${from}`,
        `To: ${message.to}`,
        `Subject: ${message.subject}`,
        `Date: ${new Date().toISOString()}`,
        '',
        message.text,
      ].join('\n'),
      'utf8',
    );
    this.logger.log(`Mail ecrit: ${file}`);
  }

  /** Never log a full address. */
  private mask(email: string): string {
    const [local, domain] = String(email).split('@');
    if (!domain) return '***';
    const head = local.slice(0, 2);
    return `${head}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
  }
}
