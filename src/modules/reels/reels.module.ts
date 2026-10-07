import { Module } from '@nestjs/common';
import { ReelsController } from './reels.controller';
import { ReelsService } from './reels.service';
import { ReelVideoService } from './reel-video.service';
import { VoiceoverService } from './voiceover.service';
import { PresenterVideoService } from './presenter-video.service';
import { AiEngineModule } from '../ai-engine/ai-engine.module';
import { BusinessContextModule } from '../business-context/business-context.module';

@Module({
  imports: [AiEngineModule, BusinessContextModule],
  controllers: [ReelsController],
  providers: [ReelsService, ReelVideoService, VoiceoverService, PresenterVideoService],
  exports: [ReelsService],
})
export class ReelsModule {}
