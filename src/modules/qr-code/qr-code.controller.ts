import { Controller, Post, Body, Get, Query, Res, HttpStatus, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { QrCodeService } from './qr-code.service';
import {
  GenerateQrCodeDto,
  GenerateMenuQrCodeDto,
  GeneratePosterQrCodeDto,
  GenerateVCardQrCodeDto,
  GenerateWifiQrCodeDto,
} from './qr-code.dto';

@Controller('qr-code')
@UseGuards(JwtAuthGuard, TenantGuard)
export class QrCodeController {
  constructor(private readonly qrCodeService: QrCodeService) {}

  @Get()
  async getQrCodes(@CurrentUser('tenantId') tenantId: string) {
    return this.qrCodeService.getQrCodes(tenantId);
  }

  @Post('generate')
  async generateQrCode(@Body() dto: GenerateQrCodeDto) {
    return this.qrCodeService.generateQrCode(dto);
  }

  @Post('menu')
  async generateMenuQrCode(@Body() dto: GenerateMenuQrCodeDto) {
    return this.qrCodeService.generateMenuQrCode(dto.restaurantName, dto.menuUrl, {
      size: dto.size,
      color: dto.color,
    });
  }

  @Post('poster')
  async generatePosterQrCode(@Body() dto: GeneratePosterQrCodeDto) {
    return this.qrCodeService.generatePosterQrCode(dto.campaignName, dto.posterUrl, {
      size: dto.size,
      color: dto.color,
    });
  }

  @Post('vcard')
  async generateVCardQrCode(@Body() dto: GenerateVCardQrCodeDto) {
    return this.qrCodeService.generateVCardQrCode(dto, { size: dto.size });
  }

  @Post('wifi')
  async generateWifiQrCode(@Body() dto: GenerateWifiQrCodeDto) {
    return this.qrCodeService.generateWifiQrCode(dto, { size: dto.size });
  }

  @Get('download')
  async downloadQrCode(
    @Query('content') content: string,
    @Query('size') size: string,
    @Res() res: Response,
  ) {
    const buffer = await this.qrCodeService.generateQrCodeBuffer({
      content,
      size: size ? parseInt(size) : 300,
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', 'attachment; filename=qrcode.png');
    res.send(buffer);
  }

  @Get('preview')
  async previewQrCode(
    @Query('content') content: string,
    @Query('size') size: string,
    @Res() res: Response,
  ) {
    const buffer = await this.qrCodeService.generateQrCodeBuffer({
      content,
      size: size ? parseInt(size) : 300,
    });

    res.setHeader('Content-Type', 'image/png');
    res.send(buffer);
  }
}