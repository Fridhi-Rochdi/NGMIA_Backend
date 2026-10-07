import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImagesService } from './images.service';
import { GenerateImageDto, UpdateImageDto } from './images.dto';
import { AuthenticatedRequest } from '../../common/types/authenticated-request';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { StorageService } from '../../common/storage/storage.service';

import { AiQuota } from '../../common/quota/ai-quota.decorator';
interface UploadedImageFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@ApiTags('Images')
@Controller('images')
@UseGuards(TenantGuard)
@ApiBearerAuth()
export class ImagesController {
  constructor(
    private readonly imagesService: ImagesService,
    private readonly storageService: StorageService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', {
    fileFilter: (_req, file, cb) => {
      if (!/^image\/(jpe?g|png|gif|webp)$/i.test(file.mimetype)) {
        return cb(new Error('Only image files are allowed!'), false);
      }
      cb(null, true);
    },
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  }))
  async uploadFile(
    @UploadedFile() file: UploadedImageFile,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Persist through StorageService so the file lands under the directory that
    // main.ts actually serves at /uploads/ (storage/uploads).
    const relativeUrl = await this.storageService.saveBuffer(
      `images-${req.tenant.id}`,
      file.buffer,
      this.extensionFromMime(file.mimetype),
    );

    // Absolute URL: the frontend renders <img src> against its own origin.
    const imageUrl = `${req.protocol}://${req.get('host')}${relativeUrl}`;
    return this.imagesService.createFromUpload(
      req.user.sub,
      req.tenant.id,
      imageUrl,
      file.originalname,
    );
  }

  @AiQuota('image.generate', 2)
  @Post('generate')
  async generate(@Body() dto: GenerateImageDto, @Request() req: AuthenticatedRequest) {
    return this.imagesService.generateImage(req.user.sub, req.tenant.id, dto);
  }

  @Get()
  async findAll(@Request() req: AuthenticatedRequest) {
    return this.imagesService.findAll(req.tenant.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.imagesService.findOne(id, req.tenant.id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateImageDto, @Request() req: AuthenticatedRequest) {
    return this.imagesService.update(id, req.tenant.id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.imagesService.remove(id, req.tenant.id);
  }

  private extensionFromMime(mimetype: string): string {
    if (/webp$/i.test(mimetype)) return 'webp';
    if (/gif$/i.test(mimetype)) return 'gif';
    if (/png$/i.test(mimetype)) return 'png';
    return 'jpg';
  }
}
