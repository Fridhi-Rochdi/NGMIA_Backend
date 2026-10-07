import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { AiEngineService } from '../../modules/ai-engine/ai-engine.service';
import { StorageService } from '../storage/storage.service';
import {
  ArtDirection,
  ShotKind,
  composePrompt,
  seedFor,
} from './art-direction';
import { safeFetchBuffer } from '../net/safe-fetch';
import { toLocalUploadPath } from '../app-url';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');

export type Aspect = 'square' | 'landscape' | 'portrait' | 'wide';

/** FLUX only accepts a fixed set of dimensions; these are the ones we use. */
const SIZES: Record<Aspect, '1024x1024' | '1344x768' | '832x1216' | '1152x896'> = {
  square: '1024x1024',
  landscape: '1152x896',
  wide: '1344x768',
  portrait: '832x1216',
};

export interface ShotSpec {
  /** What is in the picture. The only part that changes within one brand. */
  subject: string;
  kind: ShotKind;
  aspect?: Aspect;
  /** Extra direction for this one shot, e.g. "steam rising". */
  extra?: string;
  /**
   * A plain English subject to try once if the provider's safety filter
   * refuses `subject`. The filter is deterministic on wording and can refuse
   * a harmless product name ("Grand levain du samedi" is refused, "a large
   * sourdough loaf" is not); without a second subject the slot stayed empty.
   */
  fallbackSubject?: string;
}

export interface RenderedShot extends ShotSpec {
  /** A `/uploads/...` path, or null when generation failed for this slot. */
  url: string | null;
}

/**
 * Turns art direction into real, stored image files.
 *
 * Two things this fixes over calling the AI engine directly:
 *
 * 1. The engine returns a `data:image/jpeg;base64,...` URL. Inlining those is
 *    why a generated website weighed 541 KB with three images — a menu with
 *    eighteen dish photos would have been unusable. Everything is written to
 *    the upload store and referenced by path.
 * 2. Images are re-encoded to WebP at a sane width, which is a ~5x saving over
 *    the raw JPEG the provider returns, and deduplicated by content hash so
 *    regenerating a menu twice does not re-pay for identical shots.
 */
@Injectable()
export class BrandAssetService {
  private readonly logger = new Logger(BrandAssetService.name);
  /** prompt+size -> stored url, for repeats inside one process. */
  private readonly memo = new Map<string, string>();

  constructor(
    private readonly aiEngine: AiEngineService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Render one shot. Never throws: a failed slot comes back as `null` so the
   * caller can lay out without it rather than emit a broken <img>.
   */
  async render(
    direction: ArtDirection,
    spec: ShotSpec,
    scope: string,
  ): Promise<string | null> {
    const aspect = spec.aspect || 'square';
    const prompt = composePrompt(direction, spec.kind, spec.subject, spec.extra);
    const size = SIZES[aspect];
    // Scoped per tenant: the key used to be prompt+size only, so two tenants
    // with the same style, colours and subject shared one stored file.
    const key = createHash('sha256').update(`${scope}|${prompt}|${size}`).digest('hex');

    const memoised = this.memo.get(key);
    if (memoised) return memoised;

    try {
      const raw = await this.aiEngine.generateImage({
        prompt,
        size,
        seed: seedFor(direction, spec.subject),
      });
      const url = await this.store(raw, scope, aspect);
      if (url) this.memo.set(key, url);
      return url;
    } catch (error: any) {
      this.logger.warn(
        `Shot "${spec.subject.slice(0, 60)}" (${spec.kind}) failed: ${error?.message}`,
      );
      const filtered = /filtre du fournisseur|CONTENT_FILTERED/i.test(String(error?.message || ''));
      if (filtered && spec.fallbackSubject && spec.fallbackSubject.trim() !== spec.subject.trim()) {
        this.logger.log(`Nouvel essai avec un sujet neutre: "${spec.fallbackSubject.slice(0, 60)}"`);
        return this.render(direction, { ...spec, subject: spec.fallbackSubject, fallbackSubject: undefined }, scope);
      }
      return null;
    }
  }

  /**
   * Render a batch with bounded concurrency, preserving order.
   * The provider takes ~50s per image, so batching matters; going wider than
   * three at a time starts getting rate-limited.
   */
  async renderAll(
    direction: ArtDirection,
    specs: ShotSpec[],
    scope: string,
    concurrency = 3,
  ): Promise<RenderedShot[]> {
    const out: RenderedShot[] = specs.map((s) => ({ ...s, url: null }));
    let cursor = 0;

    const worker = async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= specs.length) return;
        out[index].url = await this.render(direction, specs[index], scope);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, specs.length) }, worker),
    );

    // The provider throws intermittent 500s and timeouts that cluster in time,
    // so slots that failed together usually succeed on a later, quieter sweep.
    // Without this a whole menu lands PARTIAL because of a 30-second wobble.
    const missed = out
      .map((shot, index) => ({ shot, index }))
      .filter(({ shot }) => !shot.url);
    if (missed.length && missed.length < specs.length) {
      this.logger.log(`Reprise de ${missed.length} visuel(s) manquant(s)`);
      await new Promise((r) => setTimeout(r, 3000));
      for (const { index } of missed) {
        out[index].url = await this.render(direction, specs[index], scope);
      }
    }

    return out;
  }

  /**
   * Persist whatever the engine returned (a data: URL, or a remote URL) as a
   * WebP file in the upload store, and return its public path.
   */
  async store(source: string, scope: string, aspect: Aspect = 'square'): Promise<string | null> {
    if (!source) return null;
    source = toLocalUploadPath(source);
    // Already one of ours — nothing to do.
    if (source.startsWith('/uploads/')) return source;

    let input: Buffer;
    if (source.startsWith('data:')) {
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

    // SVG is vector: re-encoding it to WebP would throw away its whole point.
    if (input.slice(0, 200).toString('utf8').trimStart().startsWith('<svg')) {
      return this.storage.saveBuffer(scope, input, 'svg');
    }

    const targetWidth = aspect === 'portrait' ? 900 : 1400;
    try {
      const webp = await sharp(input)
        .resize({ width: targetWidth, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      return this.storage.saveBuffer(scope, webp, 'webp');
    } catch (error: any) {
      this.logger.warn(`WebP re-encode failed, storing original: ${error?.message}`);
      return this.storage.saveBuffer(scope, input, 'png');
    }
  }
}
