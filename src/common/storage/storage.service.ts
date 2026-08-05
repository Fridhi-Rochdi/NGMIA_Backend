import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
} from 'fs';
import { writeFile } from 'fs/promises';
import { extname, join, resolve, sep } from 'path';

interface StoredFile {
  buffer: Buffer;
  mime: string;
}

@Injectable()
export class StorageService {
  private readonly root = resolve(process.cwd(), 'storage', 'uploads');

  constructor() {
    mkdirSync(this.root, { recursive: true });
  }

  async saveBuffer(
    scope: string,
    buffer: Buffer,
    extension: string,
  ): Promise<string> {
    const safeScope = this.safeSegment(scope);
    const safeExtension = this.safeExtension(extension);
    const directory = resolve(this.root, safeScope);
    this.assertInsideRoot(directory);
    mkdirSync(directory, { recursive: true });

    const filename = `${randomUUID()}.${safeExtension}`;
    await writeFile(join(directory, filename), buffer);
    return `/uploads/${safeScope}/${filename}`;
  }

  async saveBase64(
    scope: string,
    value: string,
    extension: string,
  ): Promise<string> {
    const payload = value.replace(/^data:image\/[\w.+-]+;base64,/i, '');
    return this.saveBuffer(scope, Buffer.from(payload, 'base64'), extension);
  }

  readByPublicUrl(publicUrl: string): StoredFile | null {
    if (!publicUrl.startsWith('/uploads/')) return null;
    const relativePath = decodeURIComponent(publicUrl.slice('/uploads/'.length));
    const absolutePath = resolve(this.root, relativePath);
    this.assertInsideRoot(absolutePath);
    if (!existsSync(absolutePath)) return null;

    const extension = extname(absolutePath).slice(1).toLowerCase();
    return {
      buffer: readFileSync(absolutePath),
      mime: this.mimeType(extension),
    };
  }

  private safeSegment(value: string): string {
    const segment = value.replace(/[^a-z0-9_-]/gi, '-').slice(0, 100);
    return segment || 'general';
  }

  private safeExtension(value: string): string {
    const extension = value.toLowerCase().replace(/[^a-z0-9]/g, '');
    const aliases: Record<string, string> = {
      jpeg: 'jpg',
      'svgxml': 'svg',
    };
    const normalized = aliases[extension] || extension;
    return ['png', 'jpg', 'webp', 'gif', 'svg'].includes(normalized)
      ? normalized
      : 'png';
  }

  private assertInsideRoot(path: string): void {
    if (path !== this.root && !path.startsWith(`${this.root}${sep}`)) {
      throw new Error('Invalid storage path');
    }
  }

  private mimeType(extension: string): string {
    const types: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
      svg: 'image/svg+xml',
    };
    return types[extension] || 'application/octet-stream';
  }
}
