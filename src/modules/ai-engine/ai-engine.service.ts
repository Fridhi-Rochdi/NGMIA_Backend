import { Injectable } from '@nestjs/common';
import {
  GenerateReelsDto,
  GenerateReelsResponse,
  GenerateTextOptions,
  GenerateImageOptions,
  GenerateBrandingOptions,
  GenerateSocialPostOptions,
  ReelDuration,
  ReelPlatform,
  ReelTheme,
  ReelTone,
  MusicMood,
  ReelStyle,
  ShotType,
  TransitionType,
} from './ai-engine.dto';

@Injectable()
export class AiEngineService {
  async generateText(options: GenerateTextOptions): Promise<string> {
    const { prompt, tone = 'professional', length = 'MEDIUM' } = options;
    const apiKey = process.env.NVIDIA_NIM_API_KEY;
    const baseUrl = process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1';
    const model = process.env.NVIDIA_NIM_TEXT_MODEL || 'meta/llama-3.1-70b-instruct';

    if (!apiKey) {
      console.error('NVIDIA_NIM_API_KEY is not set in environment variables');
      throw new Error('AI Engine is not configured correctly. Missing API Key.');
    }

    // Determine target max_tokens based on length requested
    let maxTokens = 500;
    const upperLength = length.toUpperCase();
    if (upperLength === 'SHORT') maxTokens = 200;
    else if (upperLength === 'LONG') maxTokens = 1000;

    const systemPrompt = `You are a world-class expert marketing copywriter and conversion strategist for NextGen MarketingAI.
Your goal is to generate highly engaging, persuasive, and high-converting marketing content (Ads, Social Posts, Emails).

STRICT CONSTRAINTS:
1. Output language: You MUST write the final content in the SAME language as the user's prompt (e.g., if the user prompts in French, write in French. If in English, write in English).
2. Tone: Adhere strictly to the requested tone: ${tone}.
3. Formatting: Use proper spacing, bullet points, and appropriate emojis to make the text visually appealing and easy to read on mobile.
4. Framework: Use proven marketing frameworks like AIDA (Attention, Interest, Desire, Action) or PAS (Problem, Agitation, Solution).
5. Output ONLY the marketing copy itself. Do NOT include meta-commentary like "Here is your post:" or "Sure, I can help with that."

Apply your deep understanding of human psychology, persuasion, and modern social media algorithms to maximize engagement and conversions.`;

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: maxTokens,
          top_p: 1,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('NVIDIA API Error:', errorText);
        throw new Error('Failed to generate content from AI engine');
      }

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error('AI Generation Error:', error);
      throw error;
    }
  }

  async generateImage(options: GenerateImageOptions): Promise<string> {
    const { prompt, size = '512x512' } = options;

    const placeholders: Record<string, string[]> = {
      '256x256': [
        'https://placehold.co/256x256/3B82F6/FFFFFF?text=AI+Image',
        'https://placehold.co/256x256/10B981/FFFFFF?text=Generated',
      ],
      '512x512': [
        'https://placehold.co/512x512/8B5CF6/FFFFFF?text=AI+Generated+Image',
        'https://placehold.co/512x512/F59E0B/FFFFFF?text=Marketing+Image',
      ],
      '1024x1024': [
        'https://placehold.co/1024x1024/EC4899/FFFFFF?text=High+Res+AI+Image',
        'https://placehold.co/1024x1024/6366F1/FFFFFF?text=Premium+Image',
      ],
    };

    const sizePlaceholders = placeholders[size] || placeholders['512x512'];
    return sizePlaceholders[Math.floor(Math.random() * sizePlaceholders.length)];
  }

  async generateBranding(options: GenerateBrandingOptions): Promise<{
    tagline: string;
    mission: string;
    vision: string;
    colorPalette: string;
    typography: string;
    description: string;
  }> {
    const { brandName, industry = 'technology' } = options;

    const industries: Record<string, { taglines: string[]; colors: string[] }> = {
      technology: {
        taglines: ['Innovating the Future', 'Technology for Tomorrow', 'Digital Transformation'],
        colors: ['#3B82F6', '#1E40AF', '#60A5FA'],
      },
      fashion: {
        taglines: ['Style Redefined', 'Elegance in Every Thread', 'Fashion Forward'],
        colors: ['#EC4899', '#BE185D', '#FCE7F3'],
      },
      food: {
        taglines: ['Taste the Difference', 'Fresh & Delicious', 'Culinary Excellence'],
        colors: ['#F59E0B', '#D97706', '#FEF3C7'],
      },
      health: {
        taglines: ['Wellness First', 'Healthy Living', 'Care for Life'],
        colors: ['#10B981', '#059669', '#D1FAE5'],
      },
    };

    const industryData = industries[industry] || industries.technology;

    return {
      tagline: industryData.taglines[Math.floor(Math.random() * industryData.taglines.length)],
      mission: `Our mission is to deliver exceptional ${industry} solutions that empower our customers and transform their experience.`,
      vision: `To be the leading ${industry} brand recognized for innovation, quality, and customer success.`,
      colorPalette: industryData.colors.join(', '),
      typography: 'Inter, Poppins, Roboto',
      description: `${brandName} is a leading ${industry} company dedicated to delivering exceptional products and services.`,
    };
  }

  async generateSocialPost(options: GenerateSocialPostOptions): Promise<string> {
    const { topic, platform, tone = 'professional' } = options;

    const templates: Record<string, string[]> = {
      linkedin: [
        `Excited to share insights on ${topic}! 🚀\n\nIn today's rapidly evolving landscape, staying ahead requires continuous learning and adaptation.\n\nWhat are your thoughts on this? Let's discuss in the comments.\n\n#Innovation #Leadership #${topic.replace(/\s+/g, '')}`,
        `Just published our latest research on ${topic}.\n\nKey findings:\n✅ Market growth of 25%\n✅ Customer satisfaction at all-time high\n✅ New opportunities emerging\n\nRead the full report: [link]\n\n#${topic.replace(/\s+/g, '')} #Business #Growth`,
      ],
      twitter: [
        `🚀 ${topic} is changing the game!\n\nHere's why you should pay attention:\n→ Innovation\n→ Growth\n→ Opportunity\n\nWhat do you think? 👇\n\n#${topic.replace(/\s+/g, '')} #Tech`,
        `Hot take: ${topic} will be the biggest trend this year.\n\nChange my mind. ☕\n\n#${topic.replace(/\s+/g, '')} #Trending`,
      ],
      instagram: [
        `✨ ${topic} vibes only ✨\n\nSwipe to see how we're transforming the industry →\n\n#${topic.replace(/\s+/g, '')} #InstaGood #Marketing`,
        `Behind the scenes: working on something amazing related to ${topic}! 🎨\n\nStay tuned for the big reveal 👀\n\n#${topic.replace(/\s+/g, '')} #Creative #BTS`,
      ],
      facebook: [
        `We're thrilled to announce our latest project focused on ${topic}! 🎉\n\nThis initiative represents our commitment to innovation and excellence.\n\nLearn more: [link]\n\n#${topic.replace(/\s+/g, '')} #News #Community`,
        `Question for our community: What do you think about ${topic}? 🤔\n\nShare your thoughts in the comments below!\n\n#${topic.replace(/\s+/g, '')} #Discussion #Community`,
      ],
    };

    const platformTemplates = templates[platform.toLowerCase()] || templates.linkedin;
    return platformTemplates[Math.floor(Math.random() * platformTemplates.length)];
  }

  async generateReels(dto: GenerateReelsDto): Promise<GenerateReelsResponse> {
    const durationSeconds = this.parseDuration(dto.duration ?? ReelDuration.DURATION_30);
    const scenes = this.buildScenes(dto, durationSeconds);
    const textOverlays = this.buildTextOverlays(scenes, dto);
    const captions = this.buildCaptions(scenes);
    const voiceoverScript = this.buildVoiceoverScript(dto, scenes);
    const music = this.buildMusic(dto);
    const hashtags = this.buildHashtags(dto);
    const captionFinal = this.buildCaptionFinal(dto);
    const ctaFinal = dto.text_content.cta;
    const thumbnailSuggestion = this.buildThumbnailSuggestion(scenes);
    const productionNotes = this.buildProductionNotes(dto);

    return {
      reel_metadata: {
        platform: dto.platform ?? ReelPlatform.INSTAGRAM,
        duration_seconds: durationSeconds,
        theme: dto.theme ?? ReelTheme.BUSINESS,
        tone: dto.tone ?? ReelTone.PROFESSIONAL,
        style: dto.style ?? ReelStyle.MODERN,
        created_at: new Date().toISOString(),
      },
      script: {
        total_duration: durationSeconds,
        scenes,
      },
      text_overlays: textOverlays,
      captions: captions,
      voiceover_script: voiceoverScript,
      music: music,
      hashtags: hashtags,
      caption_final: captionFinal,
      cta_final: ctaFinal,
      thumbnail_suggestion: thumbnailSuggestion,
      production_notes: productionNotes,
    };
  }

  private parseDuration(duration: ReelDuration): number {
    const map: Record<ReelDuration, number> = {
      [ReelDuration.DURATION_15]: 15,
      [ReelDuration.DURATION_30]: 30,
      [ReelDuration.DURATION_60]: 60,
      [ReelDuration.DURATION_90]: 90,
    };
    return map[duration] ?? 30;
  }

  private buildScenes(dto: GenerateReelsDto, totalDuration: number): any[] {
    const mediaCount = dto.media.length;
    const structure = this.getSceneStructure(totalDuration);
    const scenes: any[] = [];
    let currentTime = 0;
    let mediaIndex = 0;

    structure.forEach((segment, index) => {
      const sceneDuration = Math.round((segment.durationRatio * totalDuration) * 10) / 10;
      const shotType = this.getShotTypeForSegment(segment.type, index);
      const transition = this.getTransitionForStyle(dto.style ?? ReelStyle.MODERN, index);
      const voiceover = this.getVoiceoverForSegment(segment.type, dto);
      const captionOverlay = {
        text: this.getCaptionForSegment(segment.type, dto),
        position: this.getCaptionPosition(index),
        animation: this.getCaptionAnimation(dto.style ?? ReelStyle.MODERN),
      };

      scenes.push({
        scene_number: index + 1,
        start_time: currentTime,
        end_time: Math.round((currentTime + sceneDuration) * 10) / 10,
        duration: sceneDuration,
        media_index: mediaCount > 0 ? mediaIndex % mediaCount : null,
        shot_type: shotType,
        transition: transition,
        voiceover: voiceover,
        caption_overlay: captionOverlay,
        music_cue: this.getMusicCueForSegment(segment.type, dto.music_mood ?? MusicMood.UPBEAT),
      });

      currentTime = Math.round((currentTime + sceneDuration) * 10) / 10;
      if (mediaCount > 0) mediaIndex++;
    });

    return scenes;
  }

  private getSceneStructure(totalDuration: number): { type: string; durationRatio: number }[] {
    if (totalDuration <= 15) {
      return [
        { type: 'hook', durationRatio: 0.2 },
        { type: 'core', durationRatio: 0.6 },
        { type: 'cta', durationRatio: 0.2 },
      ];
    } else if (totalDuration <= 30) {
      return [
        { type: 'hook', durationRatio: 0.1 },
        { type: 'intro', durationRatio: 0.17 },
        { type: 'core', durationRatio: 0.56 },
        { type: 'cta', durationRatio: 0.17 },
      ];
    } else if (totalDuration <= 60) {
      return [
        { type: 'hook', durationRatio: 0.05 },
        { type: 'intro', durationRatio: 0.12 },
        { type: 'core', durationRatio: 0.67 },
        { type: 'highlights', durationRatio: 0.1 },
        { type: 'cta', durationRatio: 0.06 },
      ];
    } else {
      return [
        { type: 'hook', durationRatio: 0.05 },
        { type: 'intro', durationRatio: 0.11 },
        { type: 'part1', durationRatio: 0.22 },
        { type: 'part2', durationRatio: 0.22 },
        { type: 'part3', durationRatio: 0.22 },
        { type: 'highlights', durationRatio: 0.11 },
        { type: 'cta', durationRatio: 0.07 },
      ];
    }
  }

  private getShotTypeForSegment(segmentType: string, index: number): string {
    const shotMap: Record<string, string> = {
      hook: ShotType.HOOK,
      intro: ShotType.WIDE,
      core: ShotType.MEDIUM,
      part1: ShotType.MEDIUM,
      part2: ShotType.CLOSE_UP,
      part3: ShotType.B_ROLL,
      highlights: ShotType.TEXT_OVERLAY,
      cta: ShotType.CLOSE_UP,
    };
    return shotMap[segmentType] ?? ShotType.MEDIUM;
  }

  private getTransitionForStyle(style: ReelStyle, index: number): string {
    if (index === 0) return TransitionType.CUT;
    const transitions: Record<ReelStyle, string[]> = {
      [ReelStyle.MODERN]: [TransitionType.SLIDE, TransitionType.ZOOM, TransitionType.BOUNCE],
      [ReelStyle.MINIMALIST]: [TransitionType.FADE, TransitionType.DISSOLVE],
      [ReelStyle.BOLD]: [TransitionType.CUT, TransitionType.GLITCH],
      [ReelStyle.ELEGANT]: [TransitionType.DISSOLVE, TransitionType.FADE],
      [ReelStyle.PLAYFUL]: [TransitionType.BOUNCE, TransitionType.SLIDE],
      [ReelStyle.CINEMATIC]: [TransitionType.DISSOLVE, TransitionType.PAN],
    };
    const styleTransitions = transitions[style] ?? transitions[ReelStyle.MODERN];
    return styleTransitions[index % styleTransitions.length];
  }

  private getVoiceoverForSegment(segmentType: string, dto: GenerateReelsDto): string {
    const title = dto.text_content.title;
    const body = dto.text_content.body;
    const cta = dto.text_content.cta;

    const voiceMap: Record<string, string> = {
      hook: `Découvrez ${title} !`,
      intro: `Aujourd'hui, nous allons parler de ${title}.`,
      core: body,
      part1: body.split('.')[0] || body,
      part2: body.split('.')[1] || `Ensuite, ${title.toLowerCase()}.`,
      part3: body.split('.')[2] || `Et ce n'est pas tout.`,
      highlights: `Voici les points clés à retenir.`,
      cta: cta,
    };
    return voiceMap[segmentType] ?? body;
  }

  private getCaptionForSegment(segmentType: string, dto: GenerateReelsDto): string {
    const title = dto.text_content.title;
    const captionMap: Record<string, string> = {
      hook: title,
      intro: title,
      core: dto.text_content.body.substring(0, 50) + '...',
      part1: title,
      part2: 'Point clé',
      part3: 'À retenir',
      highlights: 'Points clés',
      cta: dto.text_content.cta,
    };
    return captionMap[segmentType] ?? title;
  }

  private getCaptionPosition(index: number): string {
    const positions = ['top', 'center', 'bottom'];
    return positions[index % positions.length];
  }

  private getCaptionAnimation(style: ReelStyle): string {
    const animations: Record<ReelStyle, string> = {
      [ReelStyle.MODERN]: 'slide-up',
      [ReelStyle.MINIMALIST]: 'fade-in',
      [ReelStyle.BOLD]: 'pop-in',
      [ReelStyle.ELEGANT]: 'fade-in',
      [ReelStyle.PLAYFUL]: 'bounce-in',
      [ReelStyle.CINEMATIC]: 'zoom-in',
    };
    return animations[style] ?? 'fade-in';
  }

  private getMusicCueForSegment(segmentType: string, mood: MusicMood): string {
    const cueMap: Record<string, string> = {
      hook: `Start ${mood} track - high energy intro`,
      intro: `Continue ${mood} - build up`,
      core: `Main ${mood} beat - steady rhythm`,
      part1: `${mood} rhythm - section 1`,
      part2: `${mood} rhythm - section 2`,
      part3: `${mood} rhythm - section 3`,
      highlights: `${mood} - crescendo`,
      cta: `${mood} - outro with CTA`,
    };
    return cueMap[segmentType] ?? `Continue ${mood}`;
  }

  private buildTextOverlays(scenes: any[], dto: GenerateReelsDto): any[] {
    return scenes.map((scene) => ({
      scene_number: scene.scene_number,
      text: scene.caption_overlay.text,
      position: scene.caption_overlay.position,
      font_size: scene.scene_number === 1 ? 'large' : 'medium',
      color: '#FFFFFF',
      animation: scene.caption_overlay.animation,
      start_time: scene.start_time,
      end_time: scene.end_time,
    }));
  }

  private buildCaptions(scenes: any[]): any[] {
    return scenes.map((scene) => ({
      text: scene.voiceover,
      start_time: scene.start_time,
      end_time: scene.end_time,
      style: 'standard',
    }));
  }

  private buildVoiceoverScript(dto: GenerateReelsDto, scenes: any[]): any {
    const fullText = scenes.map((s) => s.voiceover).join(' ');
    return {
      full_text: fullText,
      segments: scenes.map((scene) => ({
        text: scene.voiceover,
        start_time: scene.start_time,
        end_time: scene.end_time,
        pace: scene.scene_number === 1 ? 'fast' : 'normal',
      })),
    };
  }

  private buildMusic(dto: GenerateReelsDto): any {
    const mood = dto.music_mood ?? MusicMood.UPBEAT;
    const trackSuggestions: Record<MusicMood, any[]> = {
      [MusicMood.UPBEAT]: [
        { name: 'Good Vibes', artist: 'Trending Track', mood: 'upbeat', bpm: 120 },
        { name: 'Energy Boost', artist: 'Popular Artist', mood: 'upbeat', bpm: 128 },
      ],
      [MusicMood.CHILL]: [
        { name: 'Lo-Fi Dreams', artist: 'Chill Beats', mood: 'chill', bpm: 85 },
        { name: 'Smooth Sailing', artist: 'Relaxing Tunes', mood: 'chill', bpm: 90 },
      ],
      [MusicMood.EMOTIONAL]: [
        { name: 'Heart Strings', artist: 'Emotional Artist', mood: 'emotional', bpm: 70 },
        { name: 'Memories', artist: 'Soulful Sound', mood: 'emotional', bpm: 75 },
      ],
      [MusicMood.TRENDING]: [
        { name: 'Viral Hit 2026', artist: 'Trending Now', mood: 'trending', bpm: 130 },
        { name: 'Chart Topper', artist: 'Hot Artist', mood: 'trending', bpm: 125 },
      ],
      [MusicMood.CINEMATIC]: [
        { name: 'Epic Journey', artist: 'Film Score', mood: 'cinematic', bpm: 90 },
        { name: 'Grand Adventure', artist: 'Orchestral', mood: 'cinematic', bpm: 95 },
      ],
      [MusicMood.CORPORATE]: [
        { name: 'Professional', artist: 'Business Beats', mood: 'corporate', bpm: 100 },
        { name: 'Success Story', artist: 'Corporate Sound', mood: 'corporate', bpm: 110 },
      ],
    };

    return {
      mood: mood,
      suggested_tracks: trackSuggestions[mood] ?? trackSuggestions[MusicMood.UPBEAT],
      cue_points: [
        { time: 0, action: 'Start track' },
        { time: 3, action: 'Build up' },
        { time: 10, action: 'Main beat' },
      ],
    };
  }

  private buildHashtags(dto: GenerateReelsDto): string[] {
    const baseHashtags = dto.text_content.hashtags || [];
    const themeHashtags: Record<string, string[]> = {
      lifestyle: ['#lifestyle', '#daily', '#vibes'],
      business: ['#business', '#entrepreneur', '#success'],
      product: ['#product', '#launch', '#new'],
      tutorial: ['#tutorial', '#howto', '#learn'],
      testimonial: ['#testimonial', '#review', '#feedback'],
      event: ['#event', '#highlights', '#moments'],
      announcement: ['#announcement', '#news', '#update'],
    };
    const theme = dto.theme ?? ReelTheme.BUSINESS;
    const additional = themeHashtags[theme] ?? themeHashtags.business;
    return [...new Set([...baseHashtags, ...additional])].slice(0, 15);
  }

  private buildCaptionFinal(dto: GenerateReelsDto): string {
    const title = dto.text_content.title;
    const cta = dto.text_content.cta;
    const hashtags = this.buildHashtags(dto);
    return `${title}\n\n${dto.text_content.body}\n\n${cta}\n\n${hashtags.join(' ')}`;
  }

  private buildThumbnailSuggestion(scenes: any[]): any {
    const hookScene = scenes[0];
    return {
      scene_number: hookScene?.scene_number ?? 1,
      description: 'Première scène avec accroche visuelle forte',
      text_overlay: hookScene?.caption_overlay?.text ?? '',
    };
  }

  private buildProductionNotes(dto: GenerateReelsDto): any {
    const style = dto.style ?? ReelStyle.MODERN;
    const styleNotes: Record<ReelStyle, { lighting: string[]; editing: string[] }> = {
      [ReelStyle.MODERN]: {
        lighting: ['Éclairage naturel', 'Lumière douce et uniforme'],
        editing: ['Coupes rapides', 'Transitions fluides', 'Color grading moderne'],
      },
      [ReelStyle.MINIMALIST]: {
        lighting: ['Lumière épurée', 'Fond neutre'],
        editing: ['Coupes simples', 'Minimal text overlay', 'Couleurs neutres'],
      },
      [ReelStyle.BOLD]: {
        lighting: ['Contraste élevé', 'Couleurs vives'],
        editing: ['Coupes franches', 'Effets glitch', 'Texte gras'],
      },
      [ReelStyle.ELEGANT]: {
        lighting: ['Lumière dorée', 'Éclairage cinématique'],
        editing: ['Fondus lents', 'Transitions élégantes', 'Color grading chaleureux'],
      },
      [ReelStyle.PLAYFUL]: {
        lighting: ['Lumière vive et colorée', 'Éclairage dynamique'],
        editing: ['Animations rebond', 'Transitions amusantes', 'Emojis animés'],
      },
      [ReelStyle.CINEMATIC]: {
        lighting: ['Golden hour', 'Éclairage dramatique'],
        editing: ['Transitions cinématiques', 'Color grading film', 'Effets de profondeur'],
      },
    };

    const notes = styleNotes[style] ?? styleNotes[ReelStyle.MODERN];
    return {
      equipment_needed: ['Smartphone ou caméra 4K', 'Trépied', 'Microphone', 'Stabilisateur/Gimbal'],
      lighting_tips: notes.lighting,
      filming_tips: ['Filmer en format vertical 9:16', 'Stabiliser la caméra', 'Varier les angles de prise de vue'],
      editing_suggestions: notes.editing,
    };
  }
}
