import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import * as QRCode from 'qrcode';

export interface QrCodeOptions {
  content: string;
  size?: number;
  margin?: number;
  color?: {
    dark?: string;
    light?: string;
  };
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

export interface QrCodeResponse {
  success: boolean;
  data?: {
    base64: string;
    url: string;
    content: string;
  };
  error?: string;
}

@Injectable()
export class QrCodeService {
  constructor(private prisma: PrismaService) {}

  /**
   * Generate a QR code and record it for the tenant, so GET /qr-code can list
   * previously generated codes instead of always returning an empty array.
   */
  async generateAndStore(
    meta: { name: string; type: string },
    options: QrCodeOptions,
    tenantId: string,
    userId: string,
  ): Promise<QrCodeResponse> {
    const result = await this.generateQrCode(options);
    if (!result.success || !result.data) return result;

    try {
      await this.createQrCode(
        {
          name: meta.name,
          type: meta.type,
          data: result.data.content,
          url: result.data.base64,
          size: options.size,
          color: options.color?.dark,
          bgColor: options.color?.light,
        },
        tenantId,
        userId,
      );
    } catch (error) {
      // Persistence is best-effort: never fail the user's download over it.
      console.error('[QrCodeService] Failed to persist QR code:', error);
    }

    return result;
  }

  async generateQrCode(options: QrCodeOptions): Promise<QrCodeResponse> {
    try {
      const {
        content,
        size = 300,
        margin = 2,
        color = { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel = 'M',
      } = options;

      const qrCodeDataUrl = await QRCode.toDataURL(content, {
        width: size,
        margin: margin,
        color: color,
        errorCorrectionLevel: errorCorrectionLevel,
      });

      return {
        success: true,
        data: {
          base64: qrCodeDataUrl,
          url: content,
          content: content,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Failed to generate QR code',
      };
    }
  }

  async generateQrCodeBuffer(options: QrCodeOptions): Promise<Buffer> {
    const {
      content,
      size = 300,
      margin = 2,
      color = { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel = 'M',
    } = options;

    return await QRCode.toBuffer(content, {
      width: size,
      margin: margin,
      color: color,
      errorCorrectionLevel: errorCorrectionLevel,
    });
  }

  buildMenuContent(restaurantName: string, menuUrl: string): string {
    return `${menuUrl}?restaurant=${encodeURIComponent(restaurantName)}&type=menu`;
  }

  async generateMenuQrCode(
    restaurantName: string,
    menuUrl: string,
    options?: Partial<QrCodeOptions>,
  ): Promise<QrCodeResponse> {
    return this.generateQrCode({
      content: this.buildMenuContent(restaurantName, menuUrl),
      ...options,
    });
  }

  buildPosterContent(campaignName: string, posterUrl: string): string {
    return `${posterUrl}?campaign=${encodeURIComponent(campaignName)}&type=poster`;
  }

  async generatePosterQrCode(
    campaignName: string,
    posterUrl: string,
    options?: Partial<QrCodeOptions>,
  ): Promise<QrCodeResponse> {
    return this.generateQrCode({
      content: this.buildPosterContent(campaignName, posterUrl),
      ...options,
    });
  }

  buildVCardContent(contactInfo: {
    name: string;
    jobTitle?: string;
    phone?: string;
    email?: string;
    website?: string;
    address?: string;
    company?: string;
  }): string {
    return [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${contactInfo.name}`,
      contactInfo.company ? `ORG:${contactInfo.company}` : '',
      contactInfo.jobTitle ? `TITLE:${contactInfo.jobTitle}` : '',
      contactInfo.phone ? `TEL:${contactInfo.phone}` : '',
      contactInfo.email ? `EMAIL:${contactInfo.email}` : '',
      contactInfo.website ? `URL:${contactInfo.website}` : '',
      contactInfo.address ? `ADR:;;${contactInfo.address}` : '',
      'END:VCARD',
    ].filter((line) => line !== '').join('\n');
  }

  async generateVCardQrCode(
    contactInfo: Parameters<QrCodeService['buildVCardContent']>[0],
    options?: Partial<QrCodeOptions>,
  ): Promise<QrCodeResponse> {
    return this.generateQrCode({
      content: this.buildVCardContent(contactInfo),
      ...options,
    });
  }

  buildWifiContent(wifiConfig: {
    ssid: string;
    password: string;
    encryption: 'WPA' | 'WEP' | 'nopass';
    hidden?: boolean;
  }): string {
    return `WIFI:T:${wifiConfig.encryption};S:${wifiConfig.ssid};P:${wifiConfig.password};H:${wifiConfig.hidden ? 'true' : 'false'};;`;
  }

  async generateWifiQrCode(
    wifiConfig: Parameters<QrCodeService['buildWifiContent']>[0],
    options?: Partial<QrCodeOptions>,
  ): Promise<QrCodeResponse> {
    return this.generateQrCode({
      content: this.buildWifiContent(wifiConfig),
      ...options,
    });
  }

  // ==================== Database CRUD Methods ====================

  async getQrCodes(tenantId: string) {
    return this.prisma.qrCode.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getQrCodeById(id: string, tenantId: string) {
    const qrCode = await this.prisma.qrCode.findFirst({
      where: { id, tenantId },
    });

    if (!qrCode) {
      throw new NotFoundException('QR Code not found');
    }

    return qrCode;
  }

  async createQrCode(
    data: {
      name: string;
      type: string;
      data: string;
      url: string;
      size?: number;
      color?: string;
      bgColor?: string;
      logo?: string;
      format?: string;
    },
    tenantId: string,
    userId: string,
  ) {
    return this.prisma.qrCode.create({
      data: {
        name: data.name,
        type: data.type,
        data: data.data,
        url: data.url,
        size: data.size || 300,
        color: data.color || '#000000',
        bgColor: data.bgColor || '#ffffff',
        logo: data.logo,
        format: data.format || 'png',
        tenant: { connect: { id: tenantId } },
        user: { connect: { id: userId } },
      },
    });
  }

  async deleteQrCode(id: string, tenantId: string) {
    const existing = await this.getQrCodeById(id, tenantId);
    return this.prisma.qrCode.delete({
      where: { id: existing.id },
    });
  }
}