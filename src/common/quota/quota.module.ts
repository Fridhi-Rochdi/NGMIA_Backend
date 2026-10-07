import { Global, Module } from '@nestjs/common';
import { AiQuotaService } from './ai-quota.service';
import { AiQuotaInterceptor } from './ai-quota.interceptor';

@Global()
@Module({
  providers: [AiQuotaService, AiQuotaInterceptor],
  exports: [AiQuotaService, AiQuotaInterceptor],
})
export class QuotaModule {}
