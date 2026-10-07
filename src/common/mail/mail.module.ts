import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/** Global: OTP is not the only thing that will ever need to send mail. */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
