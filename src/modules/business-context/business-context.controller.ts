import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BusinessContextService } from './business-context.service';
import { BrandProfileService } from './brand-profile.service';
import { UpdateBusinessContextDto } from './business-context.dto';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';

interface UploadedLogo {
  mimetype: string;
  buffer: Buffer;
}

/** A logo is a small file; SVG is refused (it can carry script). */
const logoUpload = FileInterceptor('file', {
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.mimetype)) {
      return cb(new BadRequestException('Logo au format PNG, JPG ou WebP.'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 4 * 1024 * 1024 },
});

@ApiTags('Business Context')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller('business-context')
export class BusinessContextController {
  constructor(
    private readonly businessContext: BusinessContextService,
    private readonly brandProfile: BrandProfileService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Récupérer le contexte business du tenant courant" })
  get(@CurrentTenant('id') tenantId: string) {
    return this.businessContext.get(tenantId);
  }

  @Put()
  @ApiOperation({ summary: 'Mettre à jour le contexte business du tenant courant' })
  update(
    @CurrentTenant('id') tenantId: string,
    @Body() dto: UpdateBusinessContextDto,
  ) {
    return this.businessContext.upsert(tenantId, dto);
  }

  @Get('brand')
  @ApiOperation({ summary: 'Logo et couleurs de la marque (null tant que non définis)' })
  brand(@CurrentTenant('id') tenantId: string) {
    return this.brandProfile.get(tenantId);
  }

  @Post('palette')
  @UseInterceptors(logoUpload)
  @ApiOperation({ summary: "Couleurs extraites d'un logo, sans rien enregistrer" })
  palette(@UploadedFile() file: UploadedLogo) {
    return this.brandProfile.palette(file);
  }

  @Post('brand')
  @UseInterceptors(logoUpload)
  @ApiOperation({ summary: 'Enregistrer le logo et/ou les couleurs de la marque' })
  saveBrand(
    @CurrentTenant('id') tenantId: string,
    @UploadedFile() file: UploadedLogo | undefined,
    @Body() body: { primaryColor?: string; secondaryColor?: string; accentColor?: string },
  ) {
    return this.brandProfile.save(tenantId, file, {
      primary: body?.primaryColor,
      secondary: body?.secondaryColor,
      accent: body?.accentColor,
    });
  }
}
