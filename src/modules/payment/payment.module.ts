import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeService } from './stripe.service';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentController, BillingController],
  providers: [PaymentService, BillingService, StripeService],
  exports: [PaymentService, BillingService, StripeService],
})
export class PaymentModule {}
