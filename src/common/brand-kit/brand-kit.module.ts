import { Global, Module, forwardRef } from '@nestjs/common';
import { AiEngineModule } from '../../modules/ai-engine/ai-engine.module';
import { BrandAssetService } from './brand-asset.service';
import { BrandKitService } from './brand-kit.service';
import { LogoAssetService } from './logo-asset.service';

/**
 * Global so any generator (menu, website, poster, social) can render brand
 * assets without every module re-declaring the dependency. AiEngineModule is
 * behind a forwardRef because its controller reaches back into MenuModule,
 * which itself consumes this one.
 */
@Global()
@Module({
  imports: [forwardRef(() => AiEngineModule)],
  providers: [BrandAssetService, BrandKitService, LogoAssetService],
  exports: [BrandAssetService, BrandKitService, LogoAssetService],
})
export class BrandKitModule {}
