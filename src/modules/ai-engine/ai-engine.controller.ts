import { 
  Controller, 
  Post, 
  Body, 
  HttpCode, 
  HttpStatus,
  UseGuards,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { AiEngineService } from './ai-engine.service';
import { MenuService } from '../menu/menu.service';
import { 
  GenerateReelsDto, 
  GenerateReelsResponse,
  GenerateTextOptions,
  GenerateImageOptions,
  GenerateBrandingOptions,
  GenerateSocialPostOptions,
} from './ai-engine.dto';
import { MenuGenerationDto } from '../menu/menu.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('ai-engine')
@UseGuards(JwtAuthGuard)
export class AiEngineController {
  constructor(
    private readonly aiEngineService: AiEngineService,
    @Inject(forwardRef(() => MenuService))
    private readonly menuService: MenuService,
  ) {}

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

  @Post('generate-menu')
  @HttpCode(HttpStatus.CREATED)
  async generateMenu(
    @Body() dto: MenuGenerationDto,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.menuService.generateMenu(dto, tenantId, userId);
  }
}