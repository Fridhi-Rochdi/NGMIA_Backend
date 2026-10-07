import { Injectable, Logger } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * A real person speaking to camera, lip-synced to the scene's line (HeyGen).
 *
 * A professional short-form advert is built around a presenter: someone on
 * camera who says the hook and the call to action, with product footage cut
 * in between. Stills under a synthetic voice read as a slideshow; this is
 * what replaces the video editor and the person in front of the camera.
 *
 * Who presents:
 *  - HEYGEN_AVATAR_ID: one of HeyGen's studio avatars (most polished), or
 *  - otherwise a presenter photographed for this business (a baker in her
 *    bakery, a mechanic in his garage) and animated as a talking photo. The
 *    same presenter is kept per tenant, so every reel of a brand has one face.
 *
 * Voice: HEYGEN_VOICE_ID, or the first HeyGen voice in the reel's language
 * matching the presenter's gender.
 *
 * Never throws: a scene whose take fails falls back to the voiced still.
 */
@Injectable()
export class PresenterVideoService {
  private readonly logger = new Logger(PresenterVideoService.name);
  private readonly api = 'https://api.heygen.com';
  private voices: any[] | null = null;

  get available(): boolean {
    const mode = String(process.env.REEL_PRESENTER || 'auto').toLowerCase();
    return mode !== 'off' && Boolean(process.env.HEYGEN_API_KEY);
  }

  private get headers() {
    return { 'X-Api-Key': String(process.env.HEYGEN_API_KEY), Accept: 'application/json' };
  }

  /**
   * The presenter for a tenant: a studio avatar, or a talking photo created
   * once from `portrait()` and remembered.
   */
  async presenter(
    tenantId: string,
    portrait: () => Promise<{ image: Buffer; gender: 'female' | 'male' } | null>,
  ): Promise<{ type: 'avatar' | 'talking_photo'; id: string; gender: 'female' | 'male' } | null> {
    if (!this.available) return null;
    if (process.env.HEYGEN_AVATAR_ID) {
      const gender = String(process.env.HEYGEN_AVATAR_GENDER || 'female').toLowerCase() === 'male' ? 'male' : 'female';
      return { type: 'avatar', id: process.env.HEYGEN_AVATAR_ID, gender };
    }

    const dir = join(process.cwd(), 'storage', 'presenters');
    const file = join(dir, `${tenantId.replace(/[^a-zA-Z0-9-]/g, '')}.json`);
    if (existsSync(file)) {
      try {
        const saved = JSON.parse(readFileSync(file, 'utf8'));
        if (saved?.id) return { type: 'talking_photo', id: saved.id, gender: saved.gender || 'female' };
      } catch {
        // A corrupt cache only costs a new presenter.
      }
    }

    try {
      const shot = await portrait();
      if (!shot) return null;
      const upload = await fetch('https://upload.heygen.com/v1/talking_photo', {
        method: 'POST',
        headers: { ...this.headers, 'Content-Type': 'image/jpeg' },
        body: new Uint8Array(shot.image),
        signal: AbortSignal.timeout(120_000),
      });
      const data: any = await upload.json().catch(() => ({}));
      const id = data?.data?.talking_photo_id;
      if (!upload.ok || !id) {
        this.logger.warn(`HeyGen a refuse le portrait (${upload.status}): ${JSON.stringify(data?.error || data?.message || '').slice(0, 200)}`);
        return null;
      }
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, JSON.stringify({ id, gender: shot.gender, createdAt: new Date().toISOString() }));
      return { type: 'talking_photo', id, gender: shot.gender };
    } catch (error: any) {
      this.logger.warn(`Presentateur indisponible: ${error?.message}`);
      return null;
    }
  }

  /** A HeyGen voice for the language, matching the presenter. */
  private async voiceFor(language: string, gender: string): Promise<string | null> {
    if (process.env.HEYGEN_VOICE_ID) return process.env.HEYGEN_VOICE_ID;
    try {
      if (!this.voices) {
        const r = await fetch(`${this.api}/v2/voices`, { headers: this.headers, signal: AbortSignal.timeout(30_000) });
        const data: any = await r.json().catch(() => ({}));
        this.voices = Array.isArray(data?.data?.voices) ? data.data.voices : [];
      }
      const lang = language.toLowerCase();
      const inLanguage = this.voices.filter((v) => String(v.language || '').toLowerCase().startsWith(lang));
      const pick =
        inLanguage.find((v) => String(v.gender || '').toLowerCase() === gender) || inLanguage[0] || null;
      return pick?.voice_id || null;
    } catch {
      return null;
    }
  }

  /**
   * One take: the presenter saying `line`, vertical 720x1280. Returns MP4
   * bytes (with the presenter's own voice), or null.
   */
  async take(
    presenter: { type: 'avatar' | 'talking_photo'; id: string; gender: string },
    line: string,
    language: string,
    background: string,
  ): Promise<Buffer | null> {
    if (!this.available || !line.trim()) return null;
    const voiceId = await this.voiceFor(language, presenter.gender);
    if (!voiceId) {
      this.logger.warn(`Aucune voix HeyGen en ${language}; renseignez HEYGEN_VOICE_ID`);
      return null;
    }
    const character =
      presenter.type === 'avatar'
        ? { type: 'avatar', avatar_id: presenter.id, avatar_style: 'normal' }
        : { type: 'talking_photo', talking_photo_id: presenter.id };
    const deadline = Date.now() + Number(process.env.HEYGEN_TIMEOUT_MS || 15 * 60 * 1000);

    try {
      const created = await fetch(`${this.api}/v2/video/generate`, {
        method: 'POST',
        headers: { ...this.headers, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({
          video_inputs: [
            {
              character,
              voice: { type: 'text', input_text: line, voice_id: voiceId },
              background: { type: 'color', value: background },
            },
          ],
          dimension: { width: 720, height: 1280 },
        }),
      });
      const job: any = await created.json().catch(() => ({}));
      const videoId = job?.data?.video_id;
      if (!created.ok || !videoId) {
        this.logger.warn(`HeyGen a refuse la prise (${created.status}): ${JSON.stringify(job?.error || '').slice(0, 200)}`);
        return null;
      }

      for (;;) {
        if (Date.now() > deadline) {
          this.logger.warn(`Prise HeyGen ${videoId}: delai depasse`);
          return null;
        }
        await new Promise((r) => setTimeout(r, 8000));
        const poll = await fetch(`${this.api}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, {
          headers: this.headers,
          signal: AbortSignal.timeout(30_000),
        });
        const state: any = await poll.json().catch(() => ({}));
        const status = state?.data?.status;
        if (status === 'failed') {
          this.logger.warn(`Prise HeyGen ${videoId} echouee: ${JSON.stringify(state?.data?.error || '').slice(0, 200)}`);
          return null;
        }
        if (status === 'completed' && state?.data?.video_url) {
          const file = await fetch(state.data.video_url, { signal: AbortSignal.timeout(120_000) });
          if (!file.ok) return null;
          const buffer = Buffer.from(await file.arrayBuffer());
          this.logger.log(`Prise HeyGen ${videoId}: ${(buffer.length / 1024 / 1024).toFixed(1)} Mo`);
          return buffer.length ? buffer : null;
        }
      }
    } catch (error: any) {
      this.logger.warn(`Prise HeyGen indisponible: ${error?.message}`);
      return null;
    }
  }
}
