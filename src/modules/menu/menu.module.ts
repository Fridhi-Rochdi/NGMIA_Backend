import { Module } from '@nestjs/common';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AiEngineModule } from '../ai-engine/ai-engine.module';
import { QrCodeModule } from '../qr-code/qr-code.module';
import { DeployModule } from '../../common/deploy/deploy.module';
import { StorageModule } from '../../common/storage/storage.module';

@Module({
  imports: [PrismaModule, AiEngineModule, QrCodeModule, DeployModule, StorageModule],
  controllers: [MenuController],
  providers: [MenuService],
  exports: [MenuService],
})
export class MenuModule {}
