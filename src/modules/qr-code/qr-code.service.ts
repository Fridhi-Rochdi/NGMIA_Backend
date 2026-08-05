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

  async generateMenuQrCode(
    restaurantName: string,
    menuUrl: string,
    options?: Partial<QrCodeOptions>,
  ): Promise<QrCodeResponse> {
    const fullUrl = `${menuUrl}?restaurant=${encodeURIComponent(restaurantName)}&type=menu`;
    return this.generateQrCode({
      content: fullUrl,
      ...options,
    });
  }

  async generatePosterQrCode(
    campaignName: string,
    posterUrl: string,
    options?: Partial<QrCodeOptions>,
  ): Promise<QrCodeResponse> {
    const fullUrl = `${posterUrl}?campaign=${encodeURIComponent(campaignName)}&type=poster`;
    return this.generateQrCode({
      content: fullUrl,
      ...options,
    });
  }

  async generateVCardQrCode(
    contactInfo: {
      name: string;
      phone?: string;
      email?: string;
      website?: string;
      address?: string;
      company?: string;
    },
    options?: Partial<QrCodeOptions>,
  ): Promise<QrCodeResponse> {
    const vCard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${contactInfo.name}`,
      contactInfo.company ? `ORG:${contactInfo.company}` : '',
      contactInfo.phone ? `TEL:${contactInfo.phone}` : '',
      contactInfo.email ? `EMAIL:${contactInfo.email}` : '',
      contactInfo.website ? `URL:${contactInfo.website}` : '',
      contactInfo.address ? `ADR:;;${contactInfo.address}` : '',
      'END:VCARD',
    ].filter(line => line !== '').join('\n');

    return this.generateQrCode({
      content: vCard,
      ...options,
    });
  }

  async generateWifiQrCode(
    wifiConfig: {
      ssid: string;
      password: string;
      encryption: 'WPA' | 'WEP' | 'nopass';
      hidden?: boolean;
    },
    options?: Partial<QrCodeOptions>,
  ): Promise<QrCodeResponse> {
    const wifiString = `WIFI:T:${wifiConfig.encryption};S:${wifiConfig.ssid};P:${wifiConfig.password};H:${wifiConfig.hidden ? 'true' : 'false'};;`;
    
    return this.generateQrCode({
      content: wifiString,
      ...options,
    });
  }

  // ==================== Database CRUD Methods ====================

  constructor(private prisma: PrismaService) {}

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