import { Controller, Post, Body, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
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
@UseGuards(TenantGuard)
export class QrCodeController {
  constructor(private readonly qrCodeService: QrCodeService) {}

  @Get()
  async getQrCodes(@CurrentUser('tenantId') tenantId: string) {
    return this.qrCodeService.getQrCodes(tenantId);
  }

  @Post('generate')
  async generateQrCode(
    @Body() dto: GenerateQrCodeDto,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.qrCodeService.generateAndStore(
      { name: dto.content.slice(0, 80), type: 'custom' },
      dto,
      tenantId,
      userId,
    );
  }

  @Post('menu')
  async generateMenuQrCode(
    @Body() dto: GenerateMenuQrCodeDto,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.qrCodeService.generateAndStore(
      { name: dto.restaurantName, type: 'menu' },
      {
        content: this.qrCodeService.buildMenuContent(dto.restaurantName, dto.menuUrl),
        size: dto.size,
        color: dto.color,
      },
      tenantId,
      userId,
    );
  }

  @Post('poster')
  async generatePosterQrCode(
    @Body() dto: GeneratePosterQrCodeDto,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.qrCodeService.generateAndStore(
      { name: dto.campaignName, type: 'poster' },
      {
        content: this.qrCodeService.buildPosterContent(dto.campaignName, dto.posterUrl),
        size: dto.size,
        color: dto.color,
      },
      tenantId,
      userId,
    );
  }

  @Post('vcard')
  async generateVCardQrCode(
    @Body() dto: GenerateVCardQrCodeDto,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.qrCodeService.generateAndStore(
      { name: dto.name, type: 'vcard' },
      { content: this.qrCodeService.buildVCardContent(dto), size: dto.size },
      tenantId,
      userId,
    );
  }

  @Post('wifi')
  async generateWifiQrCode(
    @Body() dto: GenerateWifiQrCodeDto,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.qrCodeService.generateAndStore(
      { name: dto.ssid, type: 'wifi' },
      { content: this.qrCodeService.buildWifiContent(dto), size: dto.size },
      tenantId,
      userId,
    );
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