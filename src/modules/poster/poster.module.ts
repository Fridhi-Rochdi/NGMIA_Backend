import { Module } from '@nestjs/common';
import { PosterController } from './poster.controller';
import { PosterService } from './poster.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AiEngineModule } from '../ai-engine/ai-engine.module';

@Module({
  imports: [PrismaModule, AiEngineModule],
  controllers: [PosterController],
  providers: [PosterService],
  exports: [PosterService],
})
export class PosterModule {}