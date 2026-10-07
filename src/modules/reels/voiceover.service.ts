import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const run = promisify(execFile);

export interface SpokenLine {
  /** Raw audio, in whatever format the provider returned. */
  buffer: Buffer;
  extension: 'wav' | 'mp3';
  /** Which provider spoke it, for the log and the status line. */
  provider: string;
}

/**
 * Turns a scene's voiceover line into audio.
 *
 * The reel script has always carried a `voiceover` sentence per scene; nothing
 * ever spoke it, so every reel encoded silent. A silent "video ad" is a
 * slideshow, which is the thing this is meant not to be.
 *
 * Providers are tried in descending order of how good they sound, and the
 * chain degrades rather than failing: a deployment with no credentials at all
 * still gets a voice on Windows, and a deployment with none of the above still
 * gets its video — just silent, with the reason recorded on the row.
 *
 *   1. ElevenLabs          ELEVENLABS_API_KEY        (best; real ad read)
 *   2. OpenAI-compatible   TTS_BASE_URL + TTS_API_KEY
 *   3. Windows SAPI        no credentials, win32 only
 *
 * Adding a key is the whole upgrade path — no code change.
 */
@Injectable()
export class VoiceoverService {
  private readonly logger = new Logger(VoiceoverService.name);

  /** Which provider will be used, or null when the reel will be silent. */
  get provider(): string | null {
    if (process.env.ELEVENLABS_API_KEY) return 'elevenlabs';
    if (process.env.TTS_API_KEY && process.env.TTS_BASE_URL) return 'openai-compatible';
    if (process.platform === 'win32') return 'windows-sapi';
    return null;
  }

  get available(): boolean {
    return this.provider !== null;
  }

  /**
   * Speak one line. Returns null rather than throwing: one scene losing its
   * voice must not cost the whole reel its video.
   */
  async speak(text: string, locale = 'fr-FR'): Promise<SpokenLine | null> {
    const line = text?.trim();
    if (!line) return null;

    const provider = this.provider;
    try {
      switch (provider) {
        case 'elevenlabs':
          return { buffer: await this.elevenLabs(line), extension: 'mp3', provider };
        case 'openai-compatible':
          return { buffer: await this.openAiCompatible(line), extension: 'mp3', provider };
        case 'windows-sapi':
          return { buffer: await this.windowsSapi(line, locale), extension: 'wav', provider };
        default:
          return null;
      }
    } catch (error: any) {
      this.logger.warn(
        `Synthese vocale (${provider}) echouee pour "${line.slice(0, 40)}": ${error?.message}`,
      );
      return null;
    }
  }

  // ------------------------------------------------------------- providers

  private async elevenLabs(text: string): Promise<Buffer> {
    const key = process.env.ELEVENLABS_API_KEY as string;
    // Default is "Rachel": a neutral, warm read that suits a commercial.
    const voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
    const model = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': key,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: model,
          // Slightly above default stability, with style pushed up: an advert
          // wants a consistent, energetic read, not an expressive one that
          // varies line to line.
          voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.35 },
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!response.ok) {
      throw new Error(`ElevenLabs ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private async openAiCompatible(text: string): Promise<Buffer> {
    const base = (process.env.TTS_BASE_URL as string).replace(/\/$/, '');
    const response = await fetch(`${base}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.TTS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.TTS_MODEL || 'tts-1',
        voice: process.env.TTS_VOICE || 'alloy',
        input: text,
        response_format: 'mp3',
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      throw new Error(`TTS ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  /**
   * The built-in Windows voices, driven through System.Speech.
   *
   * No credentials and no network, so a developer machine produces a real
   * voice track out of the box. The voice is picked by culture, so a French
   * script is read by the French voice when one is installed rather than by
   * an English one mangling the accents.
   */
  private async windowsSapi(text: string, locale: string): Promise<Buffer> {
    const work = await mkdtemp(join(tmpdir(), 'ngmia-tts-'));
    const outFile = join(work, 'line.wav');
    const scriptFile = join(work, 'speak.ps1');
    // The line travels through a file, not the command line: an apostrophe or
    // a quote in the copy would otherwise break out of the PowerShell string.
    const textFile = join(work, 'line.txt');

    try {
      await writeFile(textFile, text, 'utf8');
      const rate = Number(process.env.TTS_SAPI_RATE || 1);
      const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$wanted = '${locale.replace(/'/g, "''")}'
$voice = $synth.GetInstalledVoices() |
  Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq $wanted } |
  Select-Object -First 1
if (-not $voice) {
  # Fall back to the language, ignoring the region: fr-CA can read fr-FR copy.
  $lang = $wanted.Split('-')[0]
  $voice = $synth.GetInstalledVoices() |
    Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name.StartsWith($lang) } |
    Select-Object -First 1
}
if ($voice) { $synth.SelectVoice($voice.VoiceInfo.Name) }
$synth.Rate = ${Number.isFinite(rate) ? Math.max(-10, Math.min(10, rate)) : 1}
$synth.SetOutputToWaveFile('${outFile.replace(/'/g, "''")}')
$synth.Speak([System.IO.File]::ReadAllText('${textFile.replace(/'/g, "''")}', [System.Text.Encoding]::UTF8))
$synth.Dispose()
`;
      await writeFile(scriptFile, script, 'utf8');

      await run(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptFile],
        { timeout: 60_000, windowsHide: true },
      );

      const buffer = await readFile(outFile);
      if (!buffer.length) throw new Error('SAPI a produit un fichier vide');
      return buffer;
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
