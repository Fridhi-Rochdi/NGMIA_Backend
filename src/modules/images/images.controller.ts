import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request, UseInterceptors, UploadedFile, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Request as ExpressRequest } from 'express';
import { ImagesService } from './images.service';
import { GenerateImageDto, UpdateImageDto } from './images.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';

interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
}

interface AuthenticatedRequest {
  user: {
    sub: string;
    email: string;
    tenantId: string;
    role: string;
  };
  tenant?: {
    id: string;
    name: string;
    slug: string;
    plan: string;
  };
  protocol?: string;
  get?: (header: string) => string | undefined;
}

@ApiTags('Images')
@Controller('images')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads',
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
      },
    }),
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
        return cb(new Error('Only image files are allowed!'), false);
      }
      cb(null, true);
    },
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  }))
  async uploadFile(
    @UploadedFile() file: UploadedFile,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!file) {
      throw new Error('No file uploaded');
    }
    // Return full URL so frontend can access it
    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;
    return this.imagesService.createFromUpload(
      req.user.sub,
      req.tenant.id,
      imageUrl,
      file.originalname,
    );
  }

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
}