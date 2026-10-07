import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { StorageService } from '../../common/storage/storage.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');

const run = promisify(execFile);

/** One scene, ready to encode: its composed frame and its spoken line. */
export interface ReelShot {
  png: Buffer;
  seconds: number;
  /** Synthesised voiceover for this scene, when there is one. */
  voice?: { buffer: Buffer; extension: string } | null;
  /**
   * Generated footage for the scene. When present, `png` is a transparent
   * type overlay composited over the moving clip instead of a full frame.
   */
  clip?: Buffer | null;
  /**
   * The clip carries its own soundtrack (a presenter speaking on camera):
   * use it instead of `voice`, and play the clip once rather than looping.
   */
  clipAudio?: boolean;
}

/** Output geometry. Every short-form platform wants 9:16 at 1080x1920. */
const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
/** Held at each cut, so scenes breathe instead of snapping. */
const FADE = 0.35;
/** Beat of silence before a line starts, so the voice does not clip the cut. */
const VOICE_LEAD_IN = 0.25;

/**
 * Turns composed frames into a real 9:16 MP4 with a voice track.
 *
 * ffmpeg ships as a static binary through @ffmpeg-installer, so there is no
 * system dependency to provision — the same code runs on a developer's laptop
 * and on the server.
 *
 * What changed, and why: this used to hold each still for its scene's duration
 * and encode silent. Both of those read as a slideshow rather than an advert —
 * a still frame with no sound is a story card, not a video. Now every scene is
 * given a slow push or pull (the Ken Burns move that makes a still read as
 * footage), soft fades at each cut, and its own spoken line.
 *
 * Each scene is encoded as a self-contained segment carrying both streams,
 * then the segments are concatenated by stream copy. That is what keeps audio
 * and video in sync: sync is settled per scene and the join cannot drift.
 *
 * The encode is deliberately conservative: H.264 high profile, yuv420p, even
 * dimensions, AAC 48 kHz stereo, +faststart. Those are the constraints
 * Instagram, TikTok and YouTube Shorts all impose; a file that skips them
 * uploads and then fails to play, which is worse than not producing one.
 */
@Injectable()
export class ReelVideoService {
  private readonly logger = new Logger(ReelVideoService.name);

  constructor(private readonly storage: StorageService) {}

  private get ffmpegPath(): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@ffmpeg-installer/ffmpeg').path;
  }

  /** Rasterise one SVG frame to PNG at full 1080x1920. */
  async rasterise(svg: string): Promise<Buffer> {
    return sharp(Buffer.from(svg), { density: 96 }).png().toBuffer();
  }

  /**
   * How long a piece of audio runs.
   *
   * Scene timing is derived from this: a scene must outlast its own line or
   * the voice is cut off mid-word at the cut. Decoding to null is the cheapest
   * way to get ffmpeg to report a duration it has actually verified, rather
   * than trusting a container header.
   */
  async probeDuration(file: string): Promise<number> {
    // ffmpeg writes its report to stderr and, with a null muxer, exits 0 — so
    // the duration has to be read from the RESOLVED value, not only from a
    // rejection. Reading it in the catch alone made every probe return 0,
    // which silently collapsed every scene to its minimum length and made the
    // "does this file have streams" check pass on an empty report.
    const report = await this.ffmpegReport(['-i', file, '-f', 'null', '-']);
    const match = /Duration:\s*(\d+):(\d+):(\d+\.?\d*)/.exec(report);
    if (!match) return 0;
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  }

  /**
   * Run ffmpeg and hand back what it said about the file, whichever way it
   * exited. Inspection commands are not expected to fail, and when they do the
   * diagnosis is in the same place as the answer.
   */
  async ffmpegReport(args: string[]): Promise<string> {
    try {
      const { stderr } = await run(this.ffmpegPath, args, {
        maxBuffer: 8 * 1024 * 1024,
        timeout: 60_000,
      });
      return String(stderr || '');
    } catch (error: any) {
      return String(error?.stderr || error?.message || '');
    }
  }

  /**
   * Measure a spoken line without committing it to the pipeline.
   *
   * Called before encoding so scene durations can be stretched to fit their
   * voiceover; the buffer is written to a scratch file because ffmpeg needs a
   * seekable input to report a duration for every format.
   */
  async measureAudio(buffer: Buffer, extension: string): Promise<number> {
    const work = await mkdtemp(join(tmpdir(), 'ngmia-probe-'));
    try {
      const file = join(work, `line.${extension}`);
      await writeFile(file, buffer);
      return await this.probeDuration(file);
    } catch {
      return 0;
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /**
   * The soundtrack of a clip, as AAC: a presenter's line laid under a
   * cut-away shot, so the voice stays the same person's across the reel.
   */
  async extractAudio(clip: Buffer): Promise<Buffer | null> {
    const work = await mkdtemp(join(tmpdir(), 'ngmia-audio-'));
    try {
      const input = join(work, 'take.mp4');
      const output = join(work, 'line.m4a');
      await writeFile(input, clip);
      await run(this.ffmpegPath, ['-y', '-i', input, '-vn', '-c:a', 'aac', '-b:a', '160k', output], {
        maxBuffer: 16 * 1024 * 1024,
        timeout: 60_000,
      });
      const buffer = readFileSync(output);
      return buffer.length ? buffer : null;
    } catch {
      return null;
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /**
   * Encode the scenes into one MP4.
   *
   * Returns the stored path, or null when encoding fails — the caller keeps
   * the frames, so a failed encode still leaves a reviewable storyboard rather
   * than nothing.
   */
  async encode(shots: ReelShot[], scope: string): Promise<string | null> {
    if (!shots.length) return null;

    const work = await mkdtemp(join(tmpdir(), 'ngmia-reel-'));
    try {
      const segments: string[] = [];

      for (let i = 0; i < shots.length; i += 1) {
        const shot = shots[i];
        const seconds = Math.max(1.2, Number(shot.seconds) || 3);
        const frameFile = join(work, `f${String(i).padStart(3, '0')}.png`);
        await writeFile(frameFile, shot.png);

        let voiceFile: string | null = null;
        if (shot.voice?.buffer?.length) {
          voiceFile = join(work, `v${String(i).padStart(3, '0')}.${shot.voice.extension}`);
          await writeFile(voiceFile, shot.voice.buffer);
        }

        const segment = join(work, `s${String(i).padStart(3, '0')}.mp4`);
        if (shot.clip?.length) {
          const clipFile = join(work, `c${String(i).padStart(3, '0')}.mp4`);
          await writeFile(clipFile, shot.clip);
          await this.encodeClipSegment(clipFile, frameFile, voiceFile, seconds, segment, Boolean(shot.clipAudio));
        } else {
          await this.encodeSegment(frameFile, voiceFile, seconds, i, segment);
        }
        segments.push(segment);
      }

      const output = join(work, 'reel.mp4');
      if (segments.length === 1) {
        // Nothing to join; remux the single segment so it still gets faststart.
        await run(
          this.ffmpegPath,
          ['-y', '-i', segments[0], '-c', 'copy', '-movflags', '+faststart', output],
          { maxBuffer: 32 * 1024 * 1024, timeout: 5 * 60 * 1000 },
        );
      } else {
        const listFile = join(work, 'segments.txt');
        await writeFile(
          listFile,
          segments.map((file) => `file '${file.replace(/\\/g, '/')}'`).join('\n'),
          'utf8',
        );
        // Stream copy: every segment was encoded with identical parameters, so
        // there is nothing to re-encode and nothing to re-sync.
        await run(
          this.ffmpegPath,
          [
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', listFile,
            '-c', 'copy',
            '-movflags', '+faststart',
            output,
          ],
          { maxBuffer: 32 * 1024 * 1024, timeout: 10 * 60 * 1000 },
        );
      }

      const buffer = readFileSync(output);
      if (!buffer.length) throw new Error('ffmpeg a produit un fichier vide');

      const url = await this.storage.saveBuffer(scope, buffer, 'mp4');
      const voiced = shots.filter((s) => s.voice?.buffer?.length).length;
      this.logger.log(
        `Reel encode: ${url} (${(buffer.length / 1024 / 1024).toFixed(1)} Mo, ` +
          `${shots.length} scenes, ${voiced} avec voix)`,
      );
      return url;
    } catch (error: any) {
      // ffmpeg writes its diagnosis to stderr; surfacing the tail of it is the
      // difference between a fixable report and "encoding failed".
      const detail = String(error?.stderr || error?.message || error).slice(-400);
      this.logger.error(`Encodage du reel echoue: ${detail}`);
      return null;
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /**
   * One scene: a moving image and its line, as a standalone MP4.
   *
   * The still is upscaled before zoompan runs. zoompan computes its crop
   * offsets in whole source pixels, so zooming a 1080-wide frame directly
   * makes the image judder a pixel at a time; giving it a larger source to cut
   * from turns that into a smooth move.
   */
  private async encodeSegment(
    frameFile: string,
    voiceFile: string | null,
    seconds: number,
    index: number,
    output: string,
  ): Promise<void> {
    const frames = Math.round(seconds * FPS);
    // Alternate the move. Every scene pushing in the same way is its own kind
    // of monotony; alternating reads as edited rather than generated.
    const pushIn = index % 2 === 0;
    const zoomExpr = pushIn
      ? `min(1+0.0012*on,1.12)`
      : `if(eq(on,0),1.12,max(1.12-0.0012*on,1.0))`;

    const video =
      `[0:v]scale=${WIDTH * 2}:${HEIGHT * 2},` +
      `zoompan=z='${zoomExpr}':d=${frames}:` +
      `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${WIDTH}x${HEIGHT}:fps=${FPS},` +
      `fade=t=in:st=0:d=${FADE},` +
      `fade=t=out:st=${Math.max(0, seconds - FADE).toFixed(2)}:d=${FADE},` +
      `setsar=1,format=yuv420p[v]`;

    const args: string[] = ['-y', '-loop', '1', '-t', seconds.toFixed(2), '-i', frameFile];

    let audio: string;
    if (voiceFile) {
      args.push('-i', voiceFile);
      // Lead-in, then pad with silence so the track is never shorter than the
      // scene — a short audio stream would end the segment early and the
      // concat would then drift.
      audio =
        `[1:a]aresample=48000,` +
        `adelay=${Math.round(VOICE_LEAD_IN * 1000)}|${Math.round(VOICE_LEAD_IN * 1000)},` +
        `apad,atrim=0:${seconds.toFixed(2)},asetpts=N/SR/TB[a]`;
    } else {
      args.push('-f', 'lavfi', '-t', seconds.toFixed(2), '-i', 'anullsrc=r=48000:cl=stereo');
      audio = `[1:a]atrim=0:${seconds.toFixed(2)},asetpts=N/SR/TB[a]`;
    }

    args.push(
      '-filter_complex', `${video};${audio}`,
      '-map', '[v]',
      '-map', '[a]',
      '-t', seconds.toFixed(2),
      '-c:v', 'libx264',
      '-profile:v', 'high',
      '-preset', 'medium',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-r', String(FPS),
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '48000',
      '-ac', '2',
      output,
    );

    await run(this.ffmpegPath, args, {
      maxBuffer: 32 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
    });
  }

  /**
   * One scene from real footage: the clip cover-cropped to 1080x1920, the
   * transparent type overlay on top, the spoken line underneath.
   *
   * The clip is looped if the voice runs longer than the footage, and the
   * segment parameters match encodeSegment exactly so both kinds of scene
   * concatenate by stream copy.
   */
  private async encodeClipSegment(
    clipFile: string,
    overlayFile: string,
    voiceFile: string | null,
    seconds: number,
    output: string,
    clipAudio = false,
  ): Promise<void> {
    const video =
      `[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,` +
      `crop=${WIDTH}:${HEIGHT},setsar=1,fps=${FPS}[bg];` +
      `[bg][1:v]overlay=0:0:format=auto,` +
      `fade=t=in:st=0:d=${FADE},` +
      `fade=t=out:st=${Math.max(0, seconds - FADE).toFixed(2)}:d=${FADE},` +
      `format=yuv420p[v]`;

    const args: string[] = [
      '-y',
      // A presenter's take is played once: looping it would repeat the line.
      ...(clipAudio ? [] : ['-stream_loop', '-1']),
      '-t', seconds.toFixed(2), '-i', clipFile,
      '-loop', '1', '-t', seconds.toFixed(2), '-i', overlayFile,
    ];

    let audio: string;
    if (clipAudio) {
      // Input 2 is still bound (silence) so the input indices stay fixed.
      args.push('-f', 'lavfi', '-t', seconds.toFixed(2), '-i', 'anullsrc=r=48000:cl=stereo');
      audio = `[0:a]aresample=48000,apad,atrim=0:${seconds.toFixed(2)},asetpts=N/SR/TB[a]`;
    } else if (voiceFile) {
      args.push('-i', voiceFile);
      audio =
        `[2:a]aresample=48000,` +
        `adelay=${Math.round(VOICE_LEAD_IN * 1000)}|${Math.round(VOICE_LEAD_IN * 1000)},` +
        `apad,atrim=0:${seconds.toFixed(2)},asetpts=N/SR/TB[a]`;
    } else {
      args.push('-f', 'lavfi', '-t', seconds.toFixed(2), '-i', 'anullsrc=r=48000:cl=stereo');
      audio = `[2:a]atrim=0:${seconds.toFixed(2)},asetpts=N/SR/TB[a]`;
    }

    args.push(
      '-filter_complex', `${video};${audio}`,
      '-map', '[v]',
      '-map', '[a]',
      '-t', seconds.toFixed(2),
      '-c:v', 'libx264',
      '-profile:v', 'high',
      '-preset', 'medium',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-r', String(FPS),
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '48000',
      '-ac', '2',
      output,
    );

    await run(this.ffmpegPath, args, {
      maxBuffer: 32 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
    });
  }

  /**
   * A still from a clip, cropped to 1080x1920, with the type overlay on top:
   * the scene's thumbnail and the reel's poster image when it has footage.
   */
  async clipStill(clip: Buffer, overlayPng: Buffer): Promise<Buffer | null> {
    const work = await mkdtemp(join(tmpdir(), 'ngmia-still-'));
    try {
      const clipFile = join(work, 'clip.mp4');
      const stillFile = join(work, 'still.png');
      await writeFile(clipFile, clip);
      await run(this.ffmpegPath, ['-y', '-ss', '1', '-i', clipFile, '-frames:v', '1', stillFile], {
        maxBuffer: 16 * 1024 * 1024,
        timeout: 60_000,
      });
      return await sharp(readFileSync(stillFile))
        .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'attention' })
        .composite([{ input: overlayPng }])
        .png()
        .toBuffer();
    } catch (error: any) {
      this.logger.warn(`Image du clip impossible: ${error?.message}`);
      return null;
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Read a stored asset back as base64, for embedding into a frame. */
  readAsBase64(publicUrl?: string | null): { base64: string; mime: string } | null {
    if (!publicUrl) return null;
    const stored = this.storage.readByPublicUrl(publicUrl);
    if (!stored) return null;
    return { base64: stored.buffer.toString('base64'), mime: stored.mime };
  }

  /**
   * Scale the logo down before embedding it.
   *
   * A 1024px logo carried as base64 inside every frame's SVG multiplies the
   * rasteriser's input by the scene count for no visible gain: it is drawn at
   * 96px.
   */
  async fitLogo(
    source: { base64: string; mime: string } | null,
  ): Promise<{ base64: string; mime: string } | null> {
    if (!source) return null;
    try {
      const out = await sharp(Buffer.from(source.base64, 'base64'))
        .resize(192, 192, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
      return { base64: out.toString('base64'), mime: 'image/png' };
    } catch {
      return source;
    }
  }

  /**
   * Fit a photograph to the frame before embedding it.
   *
   * A 1400px-wide landscape shot stretched into a 1080x1920 portrait by the
   * rasteriser looks exactly as bad as it sounds; cover-cropping it here keeps
   * the subject centred and keeps the embedded payload small.
   */
  async fitToFrame(
    source: { base64: string; mime: string } | null,
  ): Promise<{ base64: string; mime: string } | null> {
    if (!source) return null;
    try {
      const input = Buffer.from(source.base64, 'base64');
      const out = await sharp(input)
        .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'attention' })
        .jpeg({ quality: 86 })
        .toBuffer();
      return { base64: out.toString('base64'), mime: 'image/jpeg' };
    } catch (error: any) {
      this.logger.warn(`Recadrage impossible: ${error?.message}`);
      return source;
    }
  }
}
