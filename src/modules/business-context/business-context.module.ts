import { Global, Module } from '@nestjs/common';
import { BusinessContextController } from './business-context.controller';
import { BusinessContextService } from './business-context.service';
import { BrandProfileService } from './brand-profile.service';

/**
 * Global: every generation module resolves its defaults from the tenant's
 * business context, so the service is exported once rather than imported
 * module by module.
 */
@Global()
@Module({
  controllers: [BusinessContextController],
  providers: [BusinessContextService, BrandProfileService],
  exports: [BusinessContextService, BrandProfileService],
})
export class BusinessContextModule {}
