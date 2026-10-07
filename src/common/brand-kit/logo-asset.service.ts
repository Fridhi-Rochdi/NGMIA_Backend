import { Injectable, Logger } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { safeFetchBuffer } from '../net/safe-fetch';
import { toLocalUploadPath } from '../app-url';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');

/**
 * Turns a generated logo into a set of reusable assets.
 *
 * The generator returns one raster (or one SVG) as a base64 data URL. Stored
 * as-is that is a megabyte of text in the database, re-inlined into every
 * document that shows the logo. Here it becomes files, plus the variants a
 * real identity needs: a square mark for avatars and favicons, a compact
 * version for tight lockups, and plates for light and dark backgrounds.
 *
 * Deterministic image work only — no AI, so a logo never drifts between its
 * variants.
 */

export interface LogoVariants {
  /** The full logo, transparent where the source allowed it. */
  primary: string;
  /** Square, tightly cropped: avatars, favicons, app icons. */
  mark?: string;
  /** Reduced height, for headers and tight lockups. */
  compact?: string;
  /** Composited on a light plate, for use over pale backgrounds. */
  light?: string;
  /** Composited on a dark plate, for use over dark backgrounds. */
  dark?: string;
}

const LIGHT_PLATE = { r: 255, g: 255, b: 255, alpha: 1 };
const DARK_PLATE = { r: 12, g: 12, b: 14, alpha: 1 };

@Injectable()
export class LogoAssetService {
  private readonly logger = new Logger(LogoAssetService.name);

  constructor(private readonly storage: StorageService) {}

  /**
   * Store a generated logo and derive its variants.
   *
   * Never throws: a variant that cannot be produced is simply absent, and the
   * caller still gets a stored primary. Returns null only when the source is
   * unusable.
   */
  async store(source: string, scope: string): Promise<LogoVariants | null> {
    if (!source) return null;
    source = toLocalUploadPath(source);

    let input: Buffer;
    if (source.startsWith('/uploads/')) {
      const stored = this.storage.readByPublicUrl(source);
      if (!stored) return null;
      input = stored.buffer;
    } else if (source.startsWith('data:')) {
      const comma = source.indexOf(',');
      if (comma < 0) return null;
      input = Buffer.from(source.slice(comma + 1), 'base64');
    } else if (/^https?:\/\//i.test(source)) {
      // User-supplied: never let it reach an internal address.
      const fetched = await safeFetchBuffer(source);
      if (!fetched) return null;
      input = fetched;
    } else {
      return null;
    }
    if (!input.length) return null;

    // An SVG logo is already every size at once; rasterising it to make
    // "variants" would throw away the only real advantage it has.
    if (input.slice(0, 200).toString('utf8').trimStart().startsWith('<svg')) {
      const primary = await this.storage.saveBuffer(scope, input, 'svg');
      return { primary };
    }

    // PNG throughout: a logo needs its alpha channel, and JPEG has none.
    const primary = await this.save(scope, () =>
      sharp(input).resize({ width: 1024, withoutEnlargement: true }).png().toBuffer(),
    );
    if (!primary) return null;

    const variants: LogoVariants = { primary };

    variants.mark = await this.save(scope, () =>
      sharp(input)
        .trim()
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer(),
    );

    variants.compact = await this.save(scope, () =>
      sharp(input).trim().resize({ height: 128, withoutEnlargement: true }).png().toBuffer(),
    );

    // The plated variants exist to sit a TRANSPARENT mark on a light or a dark
    // ground. flatten() only composites what is see-through, so on an opaque
    // source it does nothing at all: light and dark came out byte-identical to
    // primary, and the brand was handed three copies of one picture as if they
    // were three variants. Offer them only when there is alpha to flatten.
    const hasAlpha = await sharp(input)
      .metadata()
      .then((meta: any) => Boolean(meta?.hasAlpha))
      .catch(() => false);

    if (hasAlpha) {
      variants.light = await this.save(scope, () =>
        sharp(input)
          .resize({ width: 1024, withoutEnlargement: true })
          .flatten({ background: LIGHT_PLATE })
          .png()
          .toBuffer(),
      );

      variants.dark = await this.save(scope, () =>
        sharp(input)
          .resize({ width: 1024, withoutEnlargement: true })
          .flatten({ background: DARK_PLATE })
          .png()
          .toBuffer(),
      );
    }

    return variants;
  }

  /** Run one sharp pipeline and store it; a failure drops that variant only. */
  private async save(scope: string, build: () => Promise<Buffer>): Promise<string | undefined> {
    try {
      const buffer = await build();
      if (!buffer?.length) return undefined;
      return await this.storage.saveBuffer(`${scope}/logo`, buffer, 'png');
    } catch (error: any) {
      this.logger.warn(`Variante de logo ignoree: ${error?.message}`);
      return undefined;
    }
  }
}
