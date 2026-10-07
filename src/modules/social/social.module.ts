import { Module } from '@nestjs/common';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { SocialOAuthService } from './social-oauth.service';
import { SocialPublisherService } from './social-publisher.service';
import { AiEngineModule } from '../ai-engine/ai-engine.module';

@Module({
  imports: [AiEngineModule],
  controllers: [SocialController],
  providers: [SocialService, SocialOAuthService, SocialPublisherService],
  // The planner's scheduler publishes through the same publisher the manual
  // path uses, so there is only ever one implementation to keep correct.
  exports: [SocialPublisherService, SocialOAuthService],
})
export class SocialModule {}
