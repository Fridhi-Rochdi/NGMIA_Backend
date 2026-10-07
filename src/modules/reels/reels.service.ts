import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiEngineService } from '../ai-engine/ai-engine.service';
import { BusinessContextService } from '../business-context/business-context.service';
import { BrandAssetService, ShotSpec } from '../../common/brand-kit/brand-asset.service';
import { BrandKit, BrandKitService } from '../../common/brand-kit/brand-kit.service';
import { renderBrandContext, resolveBrandContext } from '../../common/ai/brand-context';
import {
  BANNED_WORDS_LINE,
  HONESTY_RULES,
  JSON_ONLY,
  SAMPLING,
  languageName,
} from '../../common/ai/prompt-rules';
import { planSite } from '../website/website-blueprint';
import { ArtDirection, buildArtDirection } from '../../common/brand-kit/art-direction';
import { StorageService } from '../../common/storage/storage.service';
import { GenerateReelDto, ReelScene, UpdateReelDto } from './reels.dto';
import { renderReelFrame } from './reel-frame';
import { ReelShot, ReelVideoService } from './reel-video.service';
import { VoiceoverService } from './voiceover.service';
import { PresenterVideoService } from './presenter-video.service';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');

/**
 * Reel generation, end to end.
 *
 * What this replaces: an endpoint that returned a JSON shot list built from
 * string templates — no model call, no imagery, no video, and nothing written
 * down. The button worked; the feature did not exist.
 *
 * The pipeline now is: write the script with the model, photograph each scene
 * through the brand's own art direction, compose a 1080x1920 frame per scene,
 * then encode a real MP4. Every step is recorded on the row so a partial
 * result is reviewable instead of silently discarded.
 */
@Injectable()
export class ReelsService {
  private readonly logger = new Logger(ReelsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiEngine: AiEngineService,
    private readonly businessContext: BusinessContextService,
    private readonly brandAssets: BrandAssetService,
    private readonly brandKit: BrandKitService,
    private readonly storage: StorageService,
    private readonly video: ReelVideoService,
    private readonly voice: VoiceoverService,
    private readonly presenterVideo: PresenterVideoService,
  ) {}

  // ----------------------------------------------------------------- create

  async generate(dto: GenerateReelDto, tenantId: string, userId: string) {
    const resolved = await this.businessContext.resolve(tenantId, dto);
    const businessName = resolved.businessName || dto.businessName;
    if (!businessName) {
      throw new ServiceUnavailableException(
        "Nom du commerce manquant. Renseignez votre contexte business dans les parametres.",
      );
    }

    // The reel inherits the tenant's identity rather than inventing one, so it
    // matches the logo, the menu and the site.
    const kit = await this.brandKit.find(tenantId);
    const colors = this.brandKit.apply(
      {},
      kit,
      { primary: '#141618', secondary: '#3a3f45', accent: '#C27A2C' },
    );
    const durationSec = Math.min(90, Math.max(10, dto.durationSec ?? 30));

    let scenes: ReelScene[];
    try {
      scenes = await this.writeScript(
        {
          businessName,
          businessType: resolved.businessType || dto.businessType || 'OTHER',
          // What THIS reel is about, kept apart from what the business is:
          // merging the two meant a reel with a subject lost the business
          // description entirely.
          topic: dto.description?.trim() || '',
          theme: dto.theme ?? 'BUSINESS',
          tone: String(dto.tone ?? resolved.tone ?? 'professional').toLowerCase(),
          keyPoints: dto.keyPoints,
          platform: dto.platform ?? 'INSTAGRAM',
          musicMood: dto.musicMood ?? 'UPBEAT',
          kit,
        },
        durationSec,
      );
    } catch (error: any) {
      // Substituting a canned script here would hand back something that looks
      // generated and is not. Fail where the user can see it.
      throw new ServiceUnavailableException(
        `La generation du script a echoue: ${error?.message}. Aucun reel par defaut n'a ete cree; veuillez reessayer.`,
      );
    }

    const caption = await this.writeCaption(
      renderBrandContext(resolveBrandContext(kit, { businessName })),
      dto.platform ?? 'INSTAGRAM',
      resolved.language || kit?.business.language || 'fr',
      scenes,
    );

    const reel = await this.prisma.reel.create({
      data: {
        title: dto.title?.trim() || `${businessName} — ${scenes[0]?.headline || 'Reel'}`.slice(0, 180),
        slug: this.slugify(businessName),
        businessName,
        businessType: resolved.businessType || dto.businessType || 'OTHER',
        description: resolved.description || dto.description || '',
        platform: dto.platform ?? 'INSTAGRAM',
        theme: dto.theme ?? 'BUSINESS',
        tone: dto.tone ?? 'PROFESSIONAL',
        style: dto.style ?? kit?.style ?? 'MODERN',
        musicMood: dto.musicMood ?? 'UPBEAT',
        durationSec,
        scenes: scenes as any,
        caption: caption.caption,
        hashtags: caption.hashtags,
        ctaText: scenes[scenes.length - 1]?.cta || 'En savoir plus',
        primaryColor: colors.primary,
        secondaryColor: colors.secondary,
        accentColor: colors.accent,
        fontFamily: kit?.fonts.heading || 'Inter',
        logoUrl: kit?.logoUrl ?? null,
        status: 'PENDING',
        tenantId,
        userId,
      },
    });

    // Photography and encoding take minutes; the client polls `status`.
    void this.render(reel.id);

    return this.toResponse(reel);
  }

  // -------------------------------------------------------------- rendering

  /**
   * Photograph the scenes, compose the frames, encode the video.
   * Never throws: the row carries the outcome.
   */
  async render(reelId: string): Promise<void> {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) return;

    const scope = `t-${reel.tenantId}`;
    const scenes: ReelScene[] = Array.isArray(reel.scenes) ? (reel.scenes as any) : [];

    try {
      await this.prisma.reel.update({
        where: { id: reelId },
        data: { status: 'RENDERING', error: null },
      });

      const kit = await this.brandKit.find(reel.tenantId);
      const direction = buildArtDirection({
        brandKey: `${scope}:${kit?.name || reel.businessName}`,
        style: reel.style,
        colors: [reel.primaryColor, reel.secondaryColor, reel.accentColor],
      });

      const setting = `${reel.businessType.toLowerCase().replace(/_/g, ' ')}${
        reel.description ? ` (${reel.description.slice(0, 90)})` : ''
      }`;

      // ---- 0. a presenter on camera, when a talking-video provider is set --
      //
      // How a professional reel is cut: a person speaks the hook to camera,
      // product shots carry the middle under that same voice, and the person
      // comes back for the call to action. Every line is recorded as a take
      // (so the voice is one person's throughout); odd scenes and the last
      // show the presenter, the others cut away to the product.
      const takes = new Map<number, Buffer>();
      if (this.presenterVideo.available) {
        const ctx = resolveBrandContext(kit, { businessName: reel.businessName, businessType: reel.businessType });
        const language = languageName(ctx.language);
        const presenter = await this.presenterVideo.presenter(reel.tenantId, () =>
          this.presenterPortrait(reel.tenantId, setting, direction),
        );
        if (presenter) {
          const toRecord = scenes.filter((s) => s.voiceover?.trim());
          let next = 0;
          const worker = async () => {
            for (;;) {
              const scene = toRecord[next];
              next += 1;
              if (!scene) return;
              const take = await this.presenterVideo.take(presenter, scene.voiceover!, language, reel.secondaryColor);
              if (!take) continue;
              const seconds = await this.video.measureAudio(take, 'mp4');
              if (seconds <= 0) continue;
              takes.set(scene.index, take);
              scene.presenterUrl = await this.storage.saveBuffer(scope, take, 'mp4');
              scene.voiceProvider = 'heygen';
              scene.voiceSeconds = Math.round(seconds * 10) / 10;
              // The take is the scene: it already starts and ends on silence.
              scene.durationSec = Math.round((seconds + 0.3) * 10) / 10;
            }
          };
          await Promise.all([worker(), worker()]);
          for (const scene of scenes) {
            scene.onCamera = takes.has(scene.index) && (scene.index % 2 === 1 || scene.index === scenes.length);
          }
          this.logger.log(`Reel ${reelId}: ${takes.size}/${toRecord.length} prise(s) du presentateur`);
        }
      }

      // ---- 1. speak every line, and let the voice set the timing ----------
      //
      // The voice comes first now: its length decides how long each scene
      // runs, and with real footage that decides which clip length to ask
      // for. A scene must outlast its own line: cutting away mid-word is the
      // single most obvious way a generated advert sounds generated, so the
      // planned duration is a floor, not a fixed length.
      const spoken = new Map<number, { buffer: Buffer; extension: string }>();
      if (this.voice.available || takes.size) {
        for (const scene of scenes) {
          if (!this.voice.available) break;
          if (!scene.voiceover?.trim() || takes.has(scene.index)) continue;
          const line = await this.voice.speak(scene.voiceover);
          if (!line) continue;
          spoken.set(scene.index, { buffer: line.buffer, extension: line.extension });
          scene.voiceProvider = line.provider;

          const seconds = await this.video.measureAudio(line.buffer, line.extension);
          if (seconds > 0) {
            scene.voiceSeconds = Math.round(seconds * 10) / 10;
            // Lead-in before the line plus a beat after it, so the cut lands on
            // silence rather than on the last consonant.
            scene.durationSec = Math.max(scene.durationSec, Math.round((seconds + 1.1) * 10) / 10);
          }

          // Keep the audio alongside the frames: a reviewer can listen to a
          // single line without re-running the whole generation.
          scene.voiceUrl = await this.storage.saveBuffer(scope, line.buffer, line.extension);
        }
      } else {
        this.logger.warn(
          'Aucun fournisseur de synthese vocale disponible: le reel sera muet. ' +
            'Renseignez ELEVENLABS_API_KEY ou TTS_API_KEY pour une voix off.',
        );
      }

      // ---- 2. photograph what the presenter does not cover ---------------
      const pending = scenes.filter((s) => !s.onCamera && !s.imageUrl);
      if (pending.length) {
        const specs: ShotSpec[] = pending.map((scene) => ({
          kind: 'lifestyle',
          aspect: 'portrait',
          subject: scene.imagePrompt || `${scene.headline}, at a ${setting}`,
        }));
        const shots = await this.brandAssets.renderAll(direction, specs, scope);
        shots.forEach((shot, i) => {
          if (shot.url) pending[i].imageUrl = shot.url;
        });
      }

      // Timings belong to positions: once any scene has been stretched to fit
      // its line, every later scene starts later.
      let cursor = 0;
      for (const scene of scenes) {
        scene.startSec = Math.round(cursor * 10) / 10;
        cursor += scene.durationSec;
      }

      // ---- 4. compose the type: an overlay on footage, a frame on a still --
      await this.prisma.reel.update({ where: { id: reelId }, data: { status: 'ENCODING' } });

      const logo = await this.video.fitLogo(this.video.readAsBase64(reel.logoUrl));
      const shots: ReelShot[] = [];

      for (const scene of scenes) {
        const take = takes.get(scene.index) || null;
        const clip = scene.onCamera ? take : null;
        const photo = clip ? null : await this.video.fitToFrame(this.video.readAsBase64(scene.imageUrl));
        const svg = renderReelFrame({
          index: scene.index,
          total: scenes.length,
          headline: scene.headline,
          support: scene.support,
          kicker: scene.kicker,
          photo,
          cta: scene.cta,
          overlayOnly: Boolean(clip),
          brand: {
            primary: reel.primaryColor,
            secondary: reel.secondaryColor,
            accent: reel.accentColor,
            fontFamily: reel.fontFamily,
            name: reel.businessName,
            logo,
          },
        });

        const png = await this.video.rasterise(svg);
        // A filmed scene's thumbnail is a still of its footage under the type.
        const thumbnail = clip ? (await this.video.clipStill(clip, png)) || png : png;
        scene.frameUrl = await this.storage.saveBuffer(scope, thumbnail, 'png');
        shots.push({
          png,
          seconds: scene.durationSec,
          voice:
            spoken.get(scene.index) ??
            (take && !scene.onCamera
              ? await this.video.extractAudio(take).then((b) => (b ? { buffer: b, extension: 'm4a' } : null))
              : null),
          clip,
          clipAudio: Boolean(scene.onCamera && take),
        });
      }

      // ---- 4. encode ------------------------------------------------------
      const videoUrl = await this.video.encode(shots, scope);
      const photographed = scenes.filter((s) => s.imageUrl || s.onCamera).length;
      const voiced = scenes.filter((s) => s.voiceUrl || s.presenterUrl).length;
      const withLines = scenes.filter((s) => s.voiceover?.trim()).length;

      await this.prisma.reel.update({
        where: { id: reelId },
        data: {
          scenes: scenes as any,
          posterUrl: scenes[0]?.frameUrl ?? null,
          videoUrl,
          // A reel is only READY when it is what was asked for: every scene
          // photographed AND every written line actually spoken. A silent cut
          // is a usable draft, not the finished advert, so it says PARTIAL and
          // says why.
          status: videoUrl
            ? photographed === scenes.length && voiced === withLines
              ? 'READY'
              : 'PARTIAL'
            : 'PARTIAL',
          error: videoUrl
            ? voiced === withLines
              ? null
              : voiced === 0
                ? 'La video est muette: aucune synthese vocale disponible. ' +
                  "Renseignez ELEVENLABS_API_KEY (ou TTS_API_KEY + TTS_BASE_URL) pour la voix off."
                : `Voix off partielle: ${voiced}/${withLines} repliques synthetisees.`
            : "La video n'a pas pu etre encodee; les scenes restent consultables.",
        },
      });

      this.logger.log(
        `Reel ${reelId}: ${scenes.filter((s) => s.onCamera).length} face camera, ${photographed}/${scenes.length} scenes illustrees, ` +
          `${voiced}/${withLines} repliques dites, video ${videoUrl ? 'ok' : 'echouee'}`,
      );
    } catch (error: any) {
      this.logger.error(`Rendu du reel ${reelId} echoue: ${error?.message}`);
      await this.prisma.reel
        .update({
          where: { id: reelId },
          data: { status: 'FAILED', error: String(error?.message || error).slice(0, 500) },
        })
        .catch(() => undefined);
    }
  }

  /** Re-run the render; used by the Regenerate action. */
  async regenerate(id: string, tenantId: string, freshImages = false) {
    const reel = await this.owned(id, tenantId);
    if (freshImages) {
      const scenes: ReelScene[] = Array.isArray(reel.scenes) ? (reel.scenes as any) : [];
      scenes.forEach((s) => {
        s.imageUrl = null;
        s.presenterUrl = null;
        s.onCamera = undefined;
        s.frameUrl = null;
        // The voice is re-synthesised on every render; clearing it here keeps
        // a stale take from being reported as the current one if the new
        // synthesis fails.
        s.voiceUrl = null;
        s.voiceSeconds = undefined;
      });
      await this.prisma.reel.update({
        where: { id },
        data: { scenes: scenes as any },
      });
    }
    void this.render(id);
    return { status: 'RENDERING' };
  }

  // ------------------------------------------------------------------ reads

  async list(tenantId: string) {
    const reels = await this.prisma.reel.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return reels.map((r) => this.toSummary(r));
  }

  async findOne(id: string, tenantId: string) {
    return this.toResponse(await this.owned(id, tenantId));
  }

  async update(id: string, tenantId: string, dto: UpdateReelDto) {
    await this.owned(id, tenantId);
    const reel = await this.prisma.reel.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.caption !== undefined ? { caption: dto.caption } : {}),
        ...(dto.hashtags !== undefined ? { hashtags: dto.hashtags } : {}),
      },
    });
    return this.toResponse(reel);
  }

  async remove(id: string, tenantId: string) {
    await this.owned(id, tenantId);
    await this.prisma.reel.delete({ where: { id } });
    return { success: true };
  }

  /** The encoded file, for the download button. */
  async download(id: string, tenantId: string) {
    const reel = await this.owned(id, tenantId);
    if (!reel.videoUrl) {
      throw new NotFoundException(
        "Ce reel n'a pas encore de video. Relancez la generation.",
      );
    }
    const stored = this.storage.readByPublicUrl(reel.videoUrl);
    if (!stored) {
      throw new NotFoundException('Le fichier video est introuvable. Relancez la generation.');
    }
    return {
      buffer: stored.buffer,
      mime: 'video/mp4',
      filename: `${reel.slug || 'reel'}.mp4`,
    };
  }

  // -------------------------------------------------------------- internals

  private async owned(id: string, tenantId: string) {
    const reel = await this.prisma.reel.findFirst({ where: { id, tenantId } });
    if (!reel) throw new NotFoundException('Reel introuvable');
    return reel;
  }

  /**
   * Write the scene list with the model.
   *
   * The scene count comes from the duration, not from the model: short-form
   * pacing is roughly one beat every four to six seconds, and letting the
   * model choose produced reels with two scenes or with twelve.
   */
  private async writeScript(
    input: {
      businessName: string;
      businessType: string;
      topic: string;
      theme: string;
      tone: string;
      keyPoints?: string[];
      platform?: string;
      musicMood?: string;
      kit?: BrandKit | null;
    },
    durationSec: number,
  ): Promise<ReelScene[]> {
    const sceneCount = Math.max(3, Math.min(8, Math.round(durationSec / 5)));
    const per = Math.round((durationSec / sceneCount) * 10) / 10;

    const ctx = resolveBrandContext(input.kit ?? null, {
      businessName: input.businessName,
      businessType: input.businessType,
      tone: input.tone,
    });
    const language = languageName(ctx.language);
    // The site's call to action for this trade, so a reel for an accountant
    // does not end on "Reserver une table".
    const primaryAction = planSite({
      businessType: ctx.businessType || input.businessType,
      description: ctx.description,
    }).primaryAction;

    const systemPrompt = `You write short-form video scripts that hold attention.

RULES:
- The first scene must earn the next two seconds. Open on the concrete thing,
  never on a greeting or the business name.
- One idea per scene. Headlines are 3 to 7 words, readable at arm's length on
  a phone.
- Every line must carry information. An adjective that would fit any competitor
  carries none: write what it IS, not how good it is.
  Wrong: "Delicieux et frais". Right: "Peche du matin, grille au feu de bois".
- Banned outright: delicieux, savoureux, succulent, exquis, incontournable,
  authentique, unique, exceptionnel, gourmand, "solution", "experience unique",
  passion, "n'hesitez pas", "fait avec amour", "explosion de saveurs".
  No exclamation marks, no emoji.
- The call to action invites, it does not pressure. Banned: "depechez-vous",
  "vite", "derniere chance", "ne manquez pas", "profitez-en".
  Use a plain verb that fits this trade ("Prendre rendez-vous", "Demander un devis", "Voir la carte").
- THE VOICEOVER IS THE SPINE OF THE FILM. ${
      this.presenterVideo.available
        ? `It is spoken ON CAMERA by a person who works at the business, looking
  into the lens, and continues as their voice over the product shots. Write it
  as they would say it to one customer: first person ("we", "I"), addressing
  the viewer directly, warm and plain, never like an announcer reading an ad.`
        : 'It is spoken aloud by a voice actor over the picture.'
    } Write it to be SAID, not to be read:
  * 8 to 16 words. Under 8 sounds clipped; over 16 outruns the shot.
  * Never read the headline back. The headline is on screen already; the line
    says the next thing, so picture and voice together say more than either.
  * Plain spoken ${language}: no bullet fragments, no ALL CAPS, no abbreviations,
    no "etc.", no parentheses, no digits — write "vingt" and not "20", since
    the synthesiser reads digits inconsistently across locales.
  * One sentence, ending in a full stop. A question is allowed once, and only
    in the opening scene.
  * The last scene's line ends on the call to action, spoken naturally as a
    full sentence, not as a button label.
${HONESTY_RULES}
- The last scene, and only the last, carries the call to action.

Return ONLY strict JSON. No markdown, no prose.`;

    const prompt = `Write a ${durationSec}-second vertical video script in ${language}.

${renderBrandContext(ctx)}

<reel>
Subject of this reel: ${input.topic || 'the business itself and its offer'}
Platform: ${input.platform || 'INSTAGRAM'} · Scenes: exactly ${sceneCount}
Angle: ${input.theme} · Tone: ${input.tone} · Music mood: ${input.musicMood || 'upbeat'}
${input.keyPoints?.length ? `Must cover, in order: ${input.keyPoints.join(' / ')}` : ''}
Call to action for the last scene: ${primaryAction}
</reel>

Return:
{
  "scenes": [
    {
      "headline": "3 to 7 words, ${language}",
      "support": "one short line, ${language}, or empty",
      "kicker": "one or two words, ${language}, or empty",
      "voiceover": "the spoken advertising line for this scene: one ${language} sentence of 8 to 16 words, written to be said aloud",
      "imagePrompt": "ENGLISH. Only what the shot SHOWS: subject, setting, action. No style, no lighting, no lens, no 'photo', no '4k'. Never ask for a logo, a sign, a screen, a menu board or any readable text: the shot is photographed without lettering and a request for one only corrupts it. Photograph the real thing, not a device showing it.",
      "cta": "only on the LAST scene: 2 to 4 words, ${language}. Empty on every other scene."
    }
  ]
}`;

    const raw = await this.aiEngine.generateText(
      { prompt, length: 'LONG', maxTokens: 3000, temperature: SAMPLING.creative },
      undefined,
      systemPrompt,
    );

    const parsed = this.aiEngine.parseStrictJson(raw);
    const rows: any[] = Array.isArray(parsed?.scenes) ? parsed.scenes : [];
    if (!rows.length) throw new Error("le modele n'a renvoye aucune scene");

    // Trust the model for the words, not for the arithmetic — nor for the two
    // rules it keeps ignoring, which are repaired below.
    const drafted = rows.slice(0, sceneCount).map((row, i, all) => {
      const last = i === all.length - 1;
      return {
        index: i + 1,
        startSec: Math.round(i * per * 10) / 10,
        durationSec: per,
        headline: String(row?.headline || '').trim() || input.businessName,
        support: String(row?.support || '').trim() || undefined,
        kicker: String(row?.kicker || '').trim() || undefined,
        voiceover: String(row?.voiceover || '').trim() || undefined,
        imagePrompt: String(row?.imagePrompt || '').trim() || undefined,
        transition: i === 0 ? 'cut' : 'crossfade',
        cta: last ? String(row?.cta || '').trim() || 'En savoir plus' : undefined,
        imageUrl: null,
        frameUrl: null,
      };
    });

    const opened = this.repairOpening(drafted, input.businessName);
    return opened.map((scene) => ({
      ...scene,
      imagePrompt: this.repairImagePrompt(
        scene.imagePrompt,
        `${scene.headline}, at a ${input.businessType.toLowerCase().replace(/_/g, ' ')}`,
      ),
    }));
  }

  /**
   * Openings that waste the only two seconds the viewer will give you.
   *
   * Short-form retention is decided before the first cut. A greeting, or the
   * business name on its own, tells the viewer nothing and is the single most
   * common way a generated reel loses its audience.
   */
  /**
   * The presenter, photographed for this business: someone who plausibly
   * works there, in its setting, framed for a talking-head take (face to
   * camera, head and shoulders, mouth closed). One per tenant, remembered by
   * the presenter service, so a brand keeps one face across its reels.
   */
  private async presenterPortrait(
    tenantId: string,
    setting: string,
    direction: ArtDirection,
  ): Promise<{ image: Buffer; gender: 'female' | 'male' } | null> {
    const gender: 'female' | 'male' =
      [...tenantId].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 2 ? 'male' : 'female';
    const prompt = [
      `Photorealistic vertical portrait of a ${gender === 'female' ? 'woman' : 'man'} in their thirties who works at a ${setting},`,
      'standing in that workplace and looking straight into the camera with a warm, confident, natural expression, lips closed.',
      'Head and shoulders, centred, face fully visible and evenly lit, nothing in front of the face, real skin texture,',
      `work clothes that fit the trade. Background: the workplace, softly out of focus. Light: ${direction.lighting}.`,
      'Shot on a full-frame camera, 50mm, eye level. No text, no logo, no watermark.',
    ].join(' ');
    try {
      const url = await this.aiEngine.generateImage({ prompt, size: '1024x1536' } as any);
      const raw = url.startsWith('data:')
        ? Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')
        : Buffer.from(await (await fetch(url)).arrayBuffer());
      const image: Buffer = await sharp(raw).jpeg({ quality: 92 }).toBuffer();
      return { image, gender };
    } catch (error: any) {
      this.logger.warn(`Portrait du presentateur impossible: ${error?.message}`);
      return null;
    }
  }

  /** @internal exposed for scripts/reel-frame-check.ts */
  repairOpening(scenes: ReelScene[], businessName: string): ReelScene[] {
    if (!scenes.length) return scenes;

    const first = scenes[0];
    const headline = first.headline.trim();
    const folded = headline
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
    const name = businessName
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();

    const isGreeting = /^(bienvenue|bonjour|salut|welcome|hello|decouvrez|voici)\b/.test(folded);
    const isJustTheName = folded.replace(/[^a-z0-9]/g, '') === name.replace(/[^a-z0-9]/g, '');

    if (!isGreeting && !isJustTheName) return scenes;

    // Promote the first scene that says something concrete; the greeting keeps
    // its slot in the running order rather than being dropped, so the reel
    // still runs for the duration that was asked for.
    const substantive = scenes.findIndex(
      (scene, i) =>
        i > 0 &&
        !/^(bienvenue|bonjour|salut|welcome|hello)\b/i.test(scene.headline.trim()) &&
        !scene.cta,
    );
    if (substantive < 0) return scenes;

    this.logger.warn(
      `Scene d'ouverture "${headline}" remplacee: une salutation perd le spectateur`,
    );
    const reordered = [...scenes];
    const [promoted] = reordered.splice(substantive, 1);
    reordered.unshift(promoted);

    // Timings belong to positions, not to scenes.
    let cursor = 0;
    return reordered.map((scene, i) => {
      const startSec = Math.round(cursor * 10) / 10;
      cursor += scene.durationSec;
      return { ...scene, index: i + 1, startSec };
    });
  }

  /**
   * Strip framings the image model cannot photograph well.
   *
   * "A phone showing a reservation screen" asks for readable UI, which the art
   * direction forbids and diffusion models render as illegible smear. The
   * subject is the restaurant, not a device displaying it.
   */
  /** @internal exposed for scripts/reel-frame-check.ts */
  repairImagePrompt(prompt: string | undefined, fallback: string): string | undefined {
    if (!prompt) return prompt;
    let out = prompt;

    // A device whose job in the shot is to SHOW something: the screen would
    // be the subject, and generated screens are illegible text. Removed.
    const displays =
      /\b(a |the )?(phone|smartphone|mobile|tablet|laptop|computer|screen|display|monitor)\b(?=[^,.]*\b(showing|displaying|screen|display|monitor|app|dashboard|interface)\b|\s*[,.]|\s*$)[^,.]*/gi;
    // A device used as a tool ("working on a laptop"): it belongs in the shot
    // — for a software business it IS the subject — so it stays, with its
    // screen turned away. Deleting it left "working on , surrounded by".
    const tools = /\b(a |the |his |her |their )?(phone|smartphone|mobile|tablet|laptop|computer)\b/gi;
    const readable =
      /\b(logo|signage|sign|menu board|banner|poster|text|lettering|writing|label)\b[^,.]*/gi;

    const usedAsTool = /\b(working on|using|holding|typing on|scrolling|with)\s+(a |the |his |her |their )?(phone|smartphone|mobile|tablet|laptop|computer)\b/i.test(out);
    const hadDevice = /\b(phone|smartphone|mobile|tablet|laptop|computer|screen|display|monitor)\b/i.test(out);
    const hadReadable = readable.test(out);
    readable.lastIndex = 0;

    if (!hadDevice && !hadReadable) return out;

    if (usedAsTool) {
      out = out.replace(tools, (_m, _det, device) => `a ${device.toLowerCase()} seen from behind with its screen hidden`);
    } else {
      out = out.replace(displays, '');
    }
    out = out.replace(readable, '');

    // Removing words mid-sentence leaves stumps a model cannot photograph:
    // "a colorful , and social media graphics". Repair at the level of the
    // comma-separated clause, which is how these shot lists are written:
    // a clause with nothing left to show is dropped whole.
    const filler =
      /^(a|an|the|and|or|of|with|on|in|at|by|to|showing|displaying|featuring|using|holding|surrounded|colou?rful|vibrant|bright|modern|small|large|printed|various|several|different|beautiful)$/i;
    const bare = (w: string) => w.replace(/[^\w-]/g, '');
    out = out
      .split(',')
      .map((part) => {
        // A clause that now trails off ("a website on", "of a vibrant") loses
        // its dangling tail; what is left must still name something.
        const words = part.trim().split(/\s+/).filter(Boolean);
        while (words.length && filler.test(bare(words[words.length - 1]))) words.pop();
        return words.join(' ');
      })
      .filter((part) => {
        const words = part.split(/\s+/).filter(Boolean);
        // Keep a clause only if something in it still names a thing.
        return words.some((w) => !filler.test(bare(w)));
      })
      .join(', ')
      .replace(/^\s*(and|or)\s+/i, '')
      .replace(/,\s*(and|or)\s+/gi, ' $1 ')
      .replace(/\s*[,.]+\s*$/, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
      // A clause that still trails off ("A vibrant scene showing").
      .replace(/(\s+(showing|displaying|with|using|featuring|on|of|and|a|an|the))+$/i, '')
      .trim();

    if (out.split(/\s+/).length < 4) {
      this.logger.warn(`Direction photo videe par le nettoyage; repli sur le sujet`);
      return fallback;
    }
    this.logger.warn(`Direction photo nettoyee: "${prompt.slice(0, 50)}" -> "${out.slice(0, 50)}"`);
    return out;
  }

  /**
   * The post's caption and hashtags. Failure here is not fatal.
   *
   * It used to run under the default copywriter brief (which asked for
   * emojis while this prompt forbade them), in French whatever the business
   * language, and from the headlines only. It now reads the spoken script,
   * which carries most of the information, with the brand context.
   */
  private async writeCaption(
    brandContext: string,
    platform: string,
    languageCode: string,
    scenes: ReelScene[],
  ): Promise<{ caption: string; hashtags: string[] }> {
    const language = languageName(languageCode);
    const system = `You write the caption of a short video post for a real small business described in <brand_context>.
${JSON_ONLY}
${HONESTY_RULES}
- Never use: ${BANNED_WORDS_LINE}.
- No emoji, no exclamation mark.
- Write in ${language}.`;

    const script = scenes
      .map((s) => s.voiceover || s.headline)
      .filter(Boolean)
      .join(' ');

    try {
      const raw = await this.aiEngine.generateText(
        {
          prompt: `${brandContext}

Platform: ${platform}
<video_script>${script}</video_script>

Return: {"caption": "2 short sentences, at most 220 characters, saying what the video shows",
 "hashtags": ["6 to 10 hashtags without the # sign, in ${language}, plus usual English niche terms if relevant"]}`,
          length: 'MEDIUM',
          maxTokens: 700,
          temperature: SAMPLING.structured,
        },
        undefined,
        system,
      );
      const parsed = this.aiEngine.parseStrictJson(raw);
      return {
        caption: await this.aiEngine.enforceVoice(String(parsed?.caption || '').trim(), languageCode),
        hashtags: (Array.isArray(parsed?.hashtags) ? parsed.hashtags : [])
          .map((h: any) => String(h).replace(/^#/, '').trim())
          .filter(Boolean)
          .slice(0, 12),
      };
    } catch (error: any) {
      this.logger.warn(`Legende non generee: ${error?.message}`);
      return { caption: '', hashtags: [] };
    }
  }

  private slugify(value: string): string {
    const base = String(value)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    return `${base || 'reel'}-${Date.now().toString(36)}`;
  }

  private toSummary(r: any) {
    const scenes: ReelScene[] = Array.isArray(r.scenes) ? r.scenes : [];
    return {
      id: r.id,
      title: r.title,
      slug: r.slug,
      businessName: r.businessName,
      platform: r.platform,
      theme: r.theme,
      style: r.style,
      durationSec: r.durationSec,
      sceneCount: scenes.length,
      status: r.status,
      error: r.error,
      posterUrl: r.posterUrl,
      videoUrl: r.videoUrl,
      brand: {
        primaryColor: r.primaryColor,
        accentColor: r.accentColor,
        logoUrl: r.logoUrl,
      },
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  private toResponse(r: any) {
    return {
      ...this.toSummary(r),
      description: r.description,
      tone: r.tone,
      musicMood: r.musicMood,
      caption: r.caption,
      hashtags: r.hashtags,
      ctaText: r.ctaText,
      scenes: Array.isArray(r.scenes) ? r.scenes : [],
    };
  }
}
