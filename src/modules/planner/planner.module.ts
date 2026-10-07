import { Module } from '@nestjs/common';
import { PlannerController } from './planner.controller';
import { PlannerService } from './planner.service';
import { AutoPostService } from './auto-post.service';
import { AiEngineModule } from '../ai-engine/ai-engine.module';
import { SocialModule } from '../social/social.module';

@Module({
  imports: [AiEngineModule, SocialModule],
  controllers: [PlannerController],
  providers: [PlannerService, AutoPostService],
})
export class PlannerModule {}
