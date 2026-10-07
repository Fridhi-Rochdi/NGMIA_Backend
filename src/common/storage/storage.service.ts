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

  /**
   * The storage path behind a url, whether it is relative or absolute.
   *
   *   "/uploads/x.webp"                      -> "/uploads/x.webp"
   *   "http://localhost:4000/uploads/x.webp" -> "/uploads/x.webp"
   *   anything else                          -> null
   *
   * The host is deliberately ignored: the lookup itself is the authorisation,
   * since readByPublicUrl() only resolves inside the storage root.
   */
  localUploadPath(url: string): string | null {
    const value = String(url ?? '').trim();
    if (value.startsWith('/uploads/')) return value;
    if (!/^https?:\/\//i.test(value)) return null;
    try {
      const { pathname } = new URL(value);
      return pathname.startsWith('/uploads/') ? pathname : null;
    } catch {
      return null;
    }
  }

  /**
   * Carry every stored asset into the document itself.
   *
   * A document deployed to Vercel is served from another origin entirely, so
   * an image it merely points at has to be reachable from the public internet.
   * Ours is not: the renderers emit absolute urls on PUBLIC_API_URL, which in
   * development is http://localhost:4000 — dead for every visitor, and blocked
   * as mixed content on an https page besides.
   *
   * This lives here, once, because it was previously written inline in the
   * website renderer against readByPublicUrl() directly — which rejects the
   * absolute urls the renderer had just produced, so nothing was ever inlined
   * and every published site shipped with broken images. Menus and posters are
   * about to be deployed the same way and must not repeat it.
   */
  inlineLocalAssets(html: string): string {
    return html.replace(/(src|href)="([^"]+)"/g, (full, attr, url) => {
      const path = this.localUploadPath(url);
      if (!path) return full;
      const file = this.readByPublicUrl(path);
      if (!file) return full;
      return `${attr}="data:${file.mime};base64,${file.buffer.toString('base64')}"`;
    });
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
    // The whitelist silently rewrote anything unlisted to 'png', so an encoded
    // MP4 was stored as reel.png and served as image/png — a file no <video>
    // element will play and no browser will download as a video.
    const allowed = [
      'png', 'jpg', 'webp', 'gif', 'svg', 'avif',
      'mp4', 'webm', 'mov',
      // Voice-over tracks. Without these a synthesised WAV was stored as
      // .bin and served as application/octet-stream, so the audio could
      // neither be muxed back in nor played.
      'wav', 'mp3', 'm4a', 'aac', 'ogg',
      'pdf', 'json', 'csv', 'txt',
    ];
    return allowed.includes(normalized) ? normalized : 'bin';
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
      avif: 'image/avif',
      svg: 'image/svg+xml',
      mp4: 'video/mp4',
      webm: 'video/webm',
      mov: 'video/quicktime',
      wav: 'audio/wav',
      mp3: 'audio/mpeg',
      m4a: 'audio/mp4',
      aac: 'audio/aac',
      ogg: 'audio/ogg',
      pdf: 'application/pdf',
      json: 'application/json',
      csv: 'text/csv',
      txt: 'text/plain',
    };
    return types[extension] || 'application/octet-stream';
  }
}
