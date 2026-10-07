import { Body, Controller, HttpCode, HttpStatus, Logger, Post, ServiceUnavailableException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { MailService } from '../../common/mail/mail.service';
import { ContactDto } from './contact.dto';

const SUBJECT_LABEL: Record<string, string> = {
  question: 'Question',
  'offre-business': 'Offre Business',
  support: 'Support',
  donnees: 'Mes données (RGPD)',
  autre: 'Autre',
};

/**
 * The public contact form. The "Contact us" button of the Business plan and
 * the legal pages pointed to /contact, which did not exist.
 */
@ApiTags('Contact')
@Controller('contact')
export class ContactController {
  private readonly logger = new Logger(ContactController.name);

  constructor(private readonly mail: MailService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  // Public and unauthenticated: tight, so it cannot be used to flood the inbox.
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  @ApiOperation({ summary: 'Envoyer un message à l’équipe' })
  async send(@Body() dto: ContactDto) {
    // A robot filled the hidden field: answer as if it worked, send nothing.
    if (dto.website?.trim()) return { sent: true };

    const to = process.env.CONTACT_EMAIL || process.env.ADMIN_EMAIL;
    if (!to) {
      this.logger.error('CONTACT_EMAIL absent: message de contact non transmis');
      throw new ServiceUnavailableException('Le formulaire est momentanément indisponible. Écrivez-nous directement par e-mail.');
    }
    const subject = SUBJECT_LABEL[dto.subject] || dto.subject;
    await this.mail.send({
      to,
      subject: `[Contact] ${subject} — ${dto.name}${dto.company ? ` (${dto.company})` : ''}`,
      text: `De : ${dto.name} <${dto.email}>\nEntreprise : ${dto.company || '-'}\nSujet : ${subject}\n\n${dto.message}`,
    });
    this.logger.log(`Message de contact (${dto.subject}) transmis`);
    return { sent: true };
  }
}
