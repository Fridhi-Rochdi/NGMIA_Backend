import { 
  Controller, 
  Post, 
  Body, 
  HttpCode, 
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AiEngineService, GenerateTextOptions, GenerateImageOptions, GenerateBrandingOptions, GenerateSocialPostOptions } from './ai-engine.service';
import { 
  GenerateReelsDto, 
  GenerateReelsResponse,
} from './ai-engine.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('ai-engine')
@UseGuards(JwtAuthGuard)
export class AiEngineController {
  constructor(private readonly aiEngineService: AiEngineService) {}

  @Post('generate-text')
  @HttpCode(HttpStatus.OK)
  async generateText(@Body() options: GenerateTextOptions): Promise<{ content: string }> {
    const content = await this.aiEngineService.generateText(options);
    return { content };
  }

  @Post('generate-image')
  @HttpCode(HttpStatus.OK)
  async generateImage(@Body() options: GenerateImageOptions): Promise<{ imageUrl: string }> {
    const imageUrl = await this.aiEngineService.generateImage(options);
    return { imageUrl };
  }

  @Post('generate-branding')
  @HttpCode(HttpStatus.OK)
  async generateBranding(@Body() options: GenerateBrandingOptions) {
    return this.aiEngineService.generateBranding(options);
  }

  @Post('generate-social-post')
  @HttpCode(HttpStatus.OK)
  async generateSocialPost(@Body() options: GenerateSocialPostOptions): Promise<{ content: string }> {
    const content = await this.aiEngineService.generateSocialPost(options);
    return { content };
  }

  @Post('generate-reels')
  @HttpCode(HttpStatus.OK)
  async generateReels(@Body() dto: GenerateReelsDto): Promise<GenerateReelsResponse> {
    return this.aiEngineService.generateReels(dto);
  }
}