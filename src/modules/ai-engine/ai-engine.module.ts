import { Module } from '@nestjs/common';
import { AiEngineService } from './ai-engine.service';
import { AiEngineController } from './ai-engine.controller';

// Menus are generated through POST /menus only: the duplicate
// POST /ai-engine/generate-menu (T-22) is gone, and with it the circular
// dependency on MenuModule.
@Module({
  controllers: [AiEngineController],
  providers: [AiEngineService],
  exports: [AiEngineService],
})
export class AiEngineModule {}
