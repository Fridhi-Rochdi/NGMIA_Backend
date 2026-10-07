import { Module } from '@nestjs/common';
import { WebsiteController } from './website.controller';
import { WebsiteService } from './website.service';
import { WebsiteRendererService } from './website-renderer.service';
import { DeployModule } from '../../common/deploy/deploy.module';
import { AiEngineModule } from '../ai-engine/ai-engine.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { StorageModule } from '../../common/storage/storage.module';

@Module({
  imports: [AiEngineModule, PrismaModule, StorageModule, DeployModule],
  controllers: [WebsiteController],
  providers: [WebsiteService, WebsiteRendererService],
  exports: [WebsiteService],
})
export class WebsiteModule {}
