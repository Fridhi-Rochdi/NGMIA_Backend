import { Module, forwardRef } from '@nestjs/common';
import { AiEngineService } from './ai-engine.service';
import { AiEngineController } from './ai-engine.controller';
import { MenuModule } from '../menu/menu.module';

@Module({
  imports: [forwardRef(() => MenuModule)],
  controllers: [AiEngineController],
  providers: [AiEngineService],
  exports: [AiEngineService],
})
export class AiEngineModule {}