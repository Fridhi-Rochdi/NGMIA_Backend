import type { NextFunction, Request, Response } from 'express';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, join, normalize, sep } from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');

/** The only widths served: a fixed set keeps the cache small and predictable. */
export const THUMBNAIL_WIDTHS = [160, 320, 640, 960] as const;

const RASTER = /\.(webp|png|jpe?g)$/i;

/**
 * `/uploads/<file>?w=320` -> the same image, resized to 320 px wide, as WebP.
 *
 * Generated photographs are stored at about 1400 px (240 KB on average) and
 * the lists used to display them as 300 px thumbnails, so every card
 * downloaded the full picture. Resized copies are written once to
 * storage/cache and served from disk afterwards; they inherit the uploads'
 * year-long immutable caching, since every file name is unique.
 *
 * Anything else — no `w`, an unlisted width, a non-raster file — falls
 * through to the plain static handler.
 */
export function thumbnailMiddleware(storageRoot: string) {
  const uploadsRoot = join(storageRoot, 'uploads');
  const cacheRoot = join(storageRoot, 'cache');

  return async (req: Request, res: Response, next: NextFunction) => {
    const width = Number(req.query.w);
    if (!THUMBNAIL_WIDTHS.includes(width as (typeof THUMBNAIL_WIDTHS)[number])) return next();

    // req.path is relative to the /uploads mount point.
    const relative = normalize(decodeURIComponent(req.path)).replace(/^[/\\]+/, '');
    if (!RASTER.test(relative) || relative.split(sep).includes('..')) return next();

    const source = join(uploadsRoot, relative);
    if (!source.startsWith(uploadsRoot + sep) || !existsSync(source)) return next();

    const target = join(cacheRoot, `w${width}`, relative.replace(RASTER, '.webp'));
    try {
      if (!existsSync(target) || statSync(target).mtimeMs < statSync(source).mtimeMs) {
        const buffer = await sharp(source)
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: 78 })
          .toBuffer();
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, buffer);
      }
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.end(readFileSync(target));
    } catch {
      // A file sharp cannot read is served as it is.
      next();
    }
  };
}
