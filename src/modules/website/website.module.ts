import { Module } from '@nestjs/common';
import { WebsiteController } from './website.controller';
import { WebsiteService } from './website.service';
import { WebsiteRendererService } from './website-renderer.service';
import { VercelDeploymentService } from './vercel-deployment.service';
import { AiEngineModule } from '../ai-engine/ai-engine.module';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [AiEngineModule, PrismaModule],
  controllers: [WebsiteController],
  providers: [WebsiteService, WebsiteRendererService, VercelDeploymentService],
  exports: [WebsiteService],
})
export class WebsiteModule {}
