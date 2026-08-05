import { Module, forwardRef } from '@nestjs/common';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AiEngineModule } from '../ai-engine/ai-engine.module';

@Module({
  imports: [PrismaModule, forwardRef(() => AiEngineModule)],
  controllers: [MenuController],
  providers: [MenuService],
  exports: [MenuService],
})
export class MenuModule {}