import { 
  Controller, 
  Post, 
  Body, 
  HttpCode, 
  HttpStatus,
} from '@nestjs/common';
import { AiEngineService } from './ai-engine.service';
import { 
  GenerateTextOptions,
  GenerateImageOptions,
  GenerateBrandingOptions,
  GenerateSocialPostOptions,
} from './ai-engine.dto';

import { AiQuota } from '../../common/quota/ai-quota.decorator';
@Controller('ai-engine')
export class AiEngineController {
  constructor(private readonly aiEngineService: AiEngineService) {}

  @AiQuota('ai.text', 1)
  @Post('generate-text')
  @HttpCode(HttpStatus.OK)
  async generateText(@Body() options: GenerateTextOptions): Promise<{ content: string }> {
    const content = await this.aiEngineService.generateText(options);
    return { content };
  }

  @AiQuota('ai.image', 2)
  @Post('generate-image')
  @HttpCode(HttpStatus.OK)
  async generateImage(@Body() options: GenerateImageOptions): Promise<{ imageUrl: string }> {
    const imageUrl = await this.aiEngineService.generateImage(options);
    return { imageUrl };
  }

  @AiQuota('ai.branding', 6)
  @Post('generate-branding')
  @HttpCode(HttpStatus.OK)
  async generateBranding(@Body() options: GenerateBrandingOptions) {
    return this.aiEngineService.generateBranding(options);
  }

  @AiQuota('ai.social-post', 1)
  @Post('generate-social-post')
  @HttpCode(HttpStatus.OK)
  async generateSocialPost(@Body() options: GenerateSocialPostOptions): Promise<{ content: string }> {
    const content = await this.aiEngineService.generateSocialPost(options);
    return { content };
  }
}
