import { Injectable, Logger } from '@nestjs/common';
import { StorageService } from '../../common/storage/storage.service';
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

const LANG_NAMES: Record<string, string> = {
  fr: 'French',
  en: 'English',
  es: 'Spanish',
  ar: 'Arabic',
  de: 'German',
};

@Injectable()
export class AiEngineService {
  private readonly logger = new Logger(AiEngineService.name);

  constructor(private readonly storage: StorageService) {}

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
      console.log(`[AI Engine] Sending request to ${baseUrl}/chat/completions`);
      console.log(`[AI Engine] Model: ${model}`);
      console.log(`[AI Engine] API Key starts with: ${apiKey.substring(0, 10)}...`);
      
      const payload = {
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: maxTokens,
        top_p: 1,
      };
      
      console.log(`[AI Engine] Payload:`, JSON.stringify(payload, null, 2));

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[AI Engine] NVIDIA API Error Response:', response.status, response.statusText, errorText);
        throw new Error(`Failed to generate content from AI engine: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('[AI Engine] Response Data:', JSON.stringify(data).substring(0, 500) + '...');
      
      const generatedText = data.choices[0].message.content.trim();
      console.log('[AI Engine] Generated Text (first 100 chars):', generatedText.substring(0, 100));
      return generatedText;
    } catch (error) {
      console.error('[AI Engine] AI Generation Error Caught:', error);
      throw error;
    }
  }

  async generateWebsiteHtml(options: {
    prompt: string;
    businessName: string;
    template?: string;
    colors?: { primary?: string; secondary?: string; accent?: string };
  }): Promise<string> {
    const apiKey = process.env.NVIDIA_NIM_API_KEY;
    const baseUrl = process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1';
    const model = process.env.NVIDIA_NIM_TEXT_MODEL || 'meta/llama-3.1-70b-instruct';

    if (!apiKey) {
      throw new Error('AI Engine is not configured correctly. Missing API Key.');
    }

    const systemPrompt = `You are an expert web developer specializing in creating stunning, professional business showcase websites.
You generate complete, self-contained HTML files with embedded Tailwind CSS and animations.

STRICT RULES:
1. Output ONLY a complete, valid HTML document starting with <!DOCTYPE html>
2. Use Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
3. Use Google Fonts Inter for typography
4. Create a FULL website with: sticky navigation, hero section, services, about, contact form, footer
5. The website must be responsive (mobile-first)
6. Add smooth scroll, hover effects, and CSS animations
7. Use the exact colors specified by the user
8. Write all content in FRENCH
9. DO NOT include any explanation or markdown — ONLY raw HTML
10. The site must look premium and professional`;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: options.prompt },
        ],
        temperature: 0.5,
        max_tokens: 4096,
        top_p: 1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('NVIDIA API Error (website):', errorText);
      throw new Error('Failed to generate website HTML from AI engine');
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  }

  /**
   * Real text-to-image via NVIDIA NIM, with a graceful fallback.
   * Generation is a best-effort enhancement: if the image API is unavailable
   * or returns an unexpected shape, we return a branded SVG placeholder so the
   * calling flow (website generation, images module) never breaks.
   *
   * `scope` groups saved files (e.g. per website id); returns a public URL.
   */
  async generateImage(
    options: GenerateImageOptions & { scope?: string },
  ): Promise<string> {
    const { prompt, size = '1024x1024', scope = 'images' } = options as any;
    const apiKey = process.env.NVIDIA_NIM_API_KEY;

    // Image generation is off by default: this key exposes no text-to-image
    // model, so calling the endpoint just hangs. Enable with AI_IMAGE_ENABLED=true
    // once a working image model/provider is configured.
    if (apiKey && process.env.AI_IMAGE_ENABLED === 'true') {
      try {
        const base64 = await this.callNvidiaImage(prompt, size, apiKey);
        if (base64) return this.storage.saveBase64(scope, base64, this.imageExt(base64));
      } catch (err: any) {
        this.logger.warn(`Image generation failed, using placeholder: ${err.message}`);
      }
    }
    // Deterministic, on-brand SVG placeholder (data URI) — instant, always works.
    return this.placeholderImage(prompt, size);
  }

  /** Detect image format from a base64 payload's magic prefix. */
  private imageExt(base64: string): string {
    const b = base64.replace(/^data:image\/\w+;base64,/, '');
    if (b.startsWith('/9j/')) return 'jpg';
    if (b.startsWith('iVBOR')) return 'png';
    if (b.startsWith('UklGR')) return 'webp';
    if (b.startsWith('R0lGOD')) return 'gif';
    return 'png';
  }

  /** fetch() with an AbortController timeout so a dead endpoint fails fast. */
  private async fetchWithTimeout(url: string, options: any, ms: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private async callNvidiaImage(
    prompt: string,
    size: string,
    apiKey: string,
  ): Promise<string | null> {
    const baseUrl = process.env.NVIDIA_NIM_IMAGE_BASE_URL || 'https://ai.api.nvidia.com/v1/genai';
    const model = process.env.NVIDIA_NIM_IMAGE_MODEL || 'black-forest-labs/flux.1-schnell';
    const [w, h] = size.split('x').map((n) => parseInt(n, 10) || 1024);

    const res = await this.fetchWithTimeout(`${baseUrl}/${model}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      body: JSON.stringify({
        prompt,
        mode: 'base',
        samples: 1,
        width: w,
        height: h,
        steps: 30,
        cfg_scale: 3.5,
        seed: 0,
      }),
    }, 30000);

    if (!res.ok) {
      throw new Error(`NVIDIA image API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data: any = await res.json();
    // Handle the common response shapes across NVIDIA image models.
    return (
      data?.artifacts?.[0]?.base64 ||
      data?.image ||
      data?.b64_json ||
      data?.data?.[0]?.b64_json ||
      null
    );
  }

  private placeholderImage(prompt: string, size: string): string {
    const [w, h] = size.split('x').map((n) => parseInt(n, 10) || 1024);
    const label = (prompt || 'Image').slice(0, 40);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#ec4899"/>
  </linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <text x="50%" y="50%" fill="#ffffff" font-family="Inter,sans-serif" font-size="${Math.round(w / 22)}"
    font-weight="600" text-anchor="middle" dominant-baseline="middle" opacity="0.85">${this.escapeXml(label)}</text>
</svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  }

  private escapeXml(s: string): string {
    return s.replace(/[<>&'"]/g, (c) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] as string,
    );
  }

  // ============================================================
  // Structured website content generation (JSON, not raw HTML)
  // ============================================================

  /** Ask the LLM for the full structured content of a website as JSON. */
  async generateWebsiteContentJson(input: {
    businessName: string;
    businessType: string;
    description: string;
    services?: string[];
    targetAudience?: string;
    tone?: string;
    language?: string;
    context?: string;
    sections?: string[];
  }): Promise<any> {
    const lang = input.language || 'fr';
    const wanted =
      input.sections?.length
        ? input.sections.join(', ')
        : 'hero, about, services, testimonials, faq, cta, contact';

    const langName = LANG_NAMES[lang] || 'French';
    const system = `You are a senior conversion copywriter and web designer. Output ONLY valid minified JSON (no markdown, no commentary).
Write ALL user-facing text in ${langName}, in a "${input.tone || 'professional'}" tone.
Return {"meta":{"title":string,"description":string},"sections":[...]} using ONLY these section shapes:
{"type":"hero","data":{"eyebrow":string,"title":string,"subtitle":string,"ctaLabel":string,"imagePrompt":string}}
{"type":"about","data":{"title":string,"body":string,"imagePrompt":string,"stats":[{"value":string,"label":string}]}}
{"type":"services","data":{"title":string,"subtitle":string,"items":[{"name":string,"description":string,"icon":string}]}}
{"type":"testimonials","data":{"title":string,"items":[{"quote":string,"author":string,"role":string}]}}
{"type":"faq","data":{"title":string,"items":[{"question":string,"answer":string}]}}
{"type":"cta","data":{"title":string,"subtitle":string,"buttonLabel":string}}
{"type":"contact","data":{"title":string,"subtitle":string}}
RULES:
- Include ONLY these sections, in EXACTLY this order: ${wanted}.
- REFORMULATE the provided description in your own words — NEVER output the given description text verbatim anywhere. about.body must be a fresh 2-4 sentence rewrite.
- Deeply tailor everything to the exact business type and the extra context (e.g. a small coffee shop vs a fine-dining restaurant read very differently).
- hero.title = a punchy 4-8 word headline (NOT the description). hero.eyebrow = a 2-3 word tagline. hero.subtitle = ONE short value-proposition sentence.
- services: 3 to 6 items. testimonials: exactly 3. faq: 4 to 6 entries. about.stats: exactly 3.
- "icon" = ONE name from this EXACT list (never an emoji): coffee, utensils, star, heart, shield, truck, clock, gift, users, sparkles, tag, wifi, leaf, home, camera, bolt, award, check. Pick the most relevant.
- "imagePrompt" = a DETAILED English photo prompt specific to THIS business (subject, setting, lighting, "realistic, high quality, professional photography").`;

    const user = `Entreprise: ${input.businessName}
Type précis: ${input.businessType}
Description (à REFORMULER, ne jamais copier telle quelle): ${input.description}
${input.context ? `Contexte / détails supplémentaires: ${input.context}` : ''}
${input.services?.length ? `Services: ${input.services.join(', ')}` : ''}
${input.targetAudience ? `Public cible: ${input.targetAudience}` : ''}
Génère le contenu complet du site, parfaitement adapté à ce type d'entreprise et à son contexte.`;

    const raw = await this.llmChat(system, user, 3000, 0.6, true);
    return this.extractJson(raw);
  }

  /** Ask the LLM to produce ONE new section from a free-form user request. */
  async generateSectionJson(input: {
    request: string;
    businessName: string;
    businessType: string;
    description: string;
    tone?: string;
    language?: string;
  }): Promise<any> {
    const lang = input.language || 'fr';
    const langName = LANG_NAMES[lang] || 'French';
    const system = `You are an expert web copywriter. Output ONLY valid minified JSON, no markdown.
Write all text in ${langName} in a "${input.tone || 'professional'}" tone.
The user describes a section to add to a static showcase website. Produce ONE section as:
{"type":"custom","data":{"heading":string,"subheading":string,"body":string,"imagePrompt":string|null,"items":[{"name":string,"description":string}]}}
Use "items" only if the request implies a list (features, steps, FAQ...), otherwise return an empty array.
The section is STATIC (no working forms/backends). If asked for a form, render its visual only.`;

    const user = `Entreprise: ${input.businessName} (${input.businessType}). ${input.description}
Section demandée: "${input.request}"`;

    const raw = await this.llmChat(system, user, 1200, 0.6, true);
    return this.extractJson(raw);
  }

  /**
   * Translate a free-text design instruction into a small theme patch.
   * Only visual theme keys change — content is untouched (no regeneration).
   */
  async generateThemePatch(instruction: string, theme: any): Promise<any> {
    const system = `You adjust a website's VISUAL theme only. Output ONLY minified JSON containing ONLY the keys the user wants changed, from this exact set and allowed values:
{"radius":"none|small|medium|large|full","buttonStyle":"pill|rounded|square","animations":true|false,"density":"compact|normal|spacious","fontFamily":"Inter|Poppins|Montserrat|Playfair Display|Roboto|Lora","primaryColor":"#RRGGBB","secondaryColor":"#RRGGBB","accentColor":"#RRGGBB","template":"modern|classic|minimal|bold"}
Current theme: ${JSON.stringify(theme)}. Do not invent other keys. Colors must be hex.`;
    const raw = await this.llmChat(system, instruction, 300, 0.3, true);
    return this.extractJson(raw);
  }

  /** Low-level chat completion against NVIDIA NIM. */
  private async llmChat(
    system: string,
    user: string,
    maxTokens: number,
    temperature = 0.7,
    json = false,
  ): Promise<string> {
    const apiKey = process.env.NVIDIA_NIM_API_KEY;
    const baseUrl = process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1';
    const model = process.env.NVIDIA_NIM_TEXT_MODEL || 'meta/llama-3.1-70b-instruct';
    if (!apiKey) throw new Error('AI Engine is not configured. Missing NVIDIA_NIM_API_KEY.');

    const res = await this.fetchWithTimeout(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature,
        max_tokens: maxTokens,
        top_p: 1,
        // Force valid JSON output for structured calls (fixes malformed JSON).
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
    }, 90000);
    if (!res.ok) {
      throw new Error(`NVIDIA text API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data: any = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  }

  /** Robustly extract a JSON object from an LLM response (strips fences/prose). */
  private extractJson(raw: string): any {
    if (!raw) throw new Error('Empty AI response');
    let text = raw.trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) text = fence[1].trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
    try {
      return JSON.parse(text);
    } catch {
      // Salvage common LLM JSON slips: trailing commas before } or ].
      return JSON.parse(text.replace(/,\s*([}\]])/g, '$1'));
    }
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
