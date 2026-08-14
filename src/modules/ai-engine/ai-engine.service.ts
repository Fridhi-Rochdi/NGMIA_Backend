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
  async generateText(
    options: GenerateTextOptions,
    overrideModel?: string,
    overrideSystem?: string,
  ): Promise<string> {
    const { prompt, tone = 'professional', length = 'MEDIUM' } = options;
    const apiKey = process.env.NVIDIA_NIM_API_KEY;
    const baseUrl = process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1';
    const model = overrideModel || process.env.NVIDIA_NIM_TEXT_MODEL || 'meta/llama-3.1-70b-instruct';

    if (!apiKey) {
      console.error('NVIDIA_NIM_API_KEY is not set in environment variables');
      throw new Error('AI Engine is not configured correctly. Missing API Key.');
    }

    // Determine target max_tokens based on length requested
    let maxTokens = 500;
    const upperLength = length.toUpperCase();
    if (upperLength === 'SHORT') maxTokens = 200;
    else if (upperLength === 'MEDIUM') maxTokens = 800;
    else if (upperLength === 'LONG') maxTokens = 1500;
    else if (upperLength === 'COMPLET') maxTokens = 160000;
    if (options.maxTokens) maxTokens = options.maxTokens;

    const defaultSystemPrompt = `You are a world-class expert marketing copywriter and conversion strategist for NextGen MarketingAI.
Your goal is to generate highly engaging, persuasive, and high-converting marketing content (Ads, Social Posts, Emails).

STRICT CONSTRAINTS:
1. Output language: You MUST write the final content in the SAME language as the user's prompt (e.g., if the user prompts in French, write in French. If in English, write in English).
2. Tone: Adhere strictly to the requested tone: ${tone}.
3. Formatting: Use proper spacing, bullet points, and appropriate emojis to make the text visually appealing and easy to read on mobile.
4. Framework: Use proven marketing frameworks like AIDA (Attention, Interest, Desire, Action) or PAS (Problem, Agitation, Solution).
5. Output ONLY the marketing copy itself. Do NOT include meta-commentary like "Here is your post:" or "Sure, I can help with that."

Apply your deep understanding of human psychology, persuasion, and modern social media algorithms to maximize engagement and conversions.`;
    const systemPrompt = overrideSystem || defaultSystemPrompt;

    // Cap max_tokens to the model's remaining context window.
    const promptTokens = Math.ceil((prompt.length + systemPrompt.length) / 4);
    const modelMaxContext = 131072;
    const maxAllowedTokens = Math.max(1, modelMaxContext - promptTokens - 100);
    if (maxTokens > maxAllowedTokens) {
      console.warn(`[AI Engine] Capping max_tokens from ${maxTokens} to ${maxAllowedTokens} for model context window`);
      maxTokens = maxAllowedTokens;
    }

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

  async generateImage(options: GenerateImageOptions): Promise<string> {
    const { prompt, size = '512x512' } = options;
    const apiKey = process.env.NVIDIA_NIM_API_KEY;

    if (!apiKey) {
      console.error('[AiEngine] NVIDIA_NIM_API_KEY is not set');
      throw new Error('AI Engine is not configured correctly. Missing API Key.');
    }

    // Parse size to width/height for FLUX API
    const [width, height] = size.split('x').map(Number);
    const validWidths = [1024, 768, 1344, 896, 1152, 832];
    const validHeights = [1024, 1344, 768, 1152, 896, 1216, 832];
    const finalWidth = validWidths.includes(width) ? width : 1024;
    const finalHeight = validHeights.includes(height) ? height : 1024;

    console.log('[AiEngine] generateImage() called');
    console.log('[AiEngine] Prompt:', prompt);
    console.log('[AiEngine] Size:', size, '->', finalWidth, 'x', finalHeight);

    const imageBaseUrl = process.env.NVIDIA_NIM_IMAGE_BASE_URL || 'https://ai.api.nvidia.com/v1/genai';
    const imageModel = process.env.NVIDIA_NIM_IMAGE_MODEL || 'black-forest-labs/flux.2-klein-4b';
    const invokeUrls = Array.from(new Set([
      ...(process.env.NVIDIA_NIM_IMAGE_URLS || '')
        .split(',')
        .map(url => url.trim())
        .filter(Boolean),
      process.env.NVIDIA_NIM_IMAGE_URL || '',
      `${imageBaseUrl}/${imageModel}`,
      `${imageBaseUrl}/black-forest-labs/flux.2-klein-4b`,
      `${imageBaseUrl}/black-forest-labs/flux.1-schnell`,
    ].filter(Boolean)));
    const timeoutMs = Number(process.env.NVIDIA_NIM_IMAGE_TIMEOUT_MS || 60000);
    const maxAttempts = Number(process.env.NVIDIA_NIM_IMAGE_ATTEMPTS || 2);
    let lastError: Error | null = null;

    for (const invokeUrl of invokeUrls) {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
          console.log(`[AiEngine] Calling NVIDIA FLUX API attempt ${attempt}/${maxAttempts}:`, invokeUrl);

          const response = await fetch(invokeUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            signal: controller.signal,
            body: JSON.stringify({
              prompt,
              width: finalWidth,
              height: finalHeight,
              steps: 4,
              seed: Math.floor(Math.random() * 2147483647),
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('[AiEngine] NVIDIA Image API Error:', response.status, errorText);
            throw new Error(`Image generation failed: ${response.status} - ${errorText || response.statusText}`);
          }

          const data = await response.json();
          console.log('[AiEngine] Image generation response:', JSON.stringify(data).substring(0, 200));

          if (data.images && data.images.length > 0) {
            return `data:image/png;base64,${data.images[0]}`;
          }
          if (data.image) {
            return `data:image/png;base64,${data.image}`;
          }
          if (Array.isArray(data.artifacts) && data.artifacts.length > 0) {
            const artifact = data.artifacts[0];
            if (artifact?.base64) {
              const mimeType = artifact.mime_type || artifact.mimeType || 'image/jpeg';
              return `data:${mimeType};base64,${artifact.base64}`;
            }
            if (artifact?.url) {
              return artifact.url;
            }
          }
          if (data.uri) {
            return data.uri;
          }

          throw new Error('Image generation failed: NVIDIA response did not contain an image');
        } catch (error) {
          const isAbort = error instanceof Error && error.name === 'AbortError';
          lastError = isAbort
            ? new Error(`Image generation timed out after ${timeoutMs}ms on ${invokeUrl}`)
            : error instanceof Error ? error : new Error(String(error));
          console.error(`[AiEngine] Image generation attempt ${attempt}/${maxAttempts} failed:`, lastError.message);
        } finally {
          clearTimeout(timeout);
        }
      }
    }

    throw lastError || new Error('Image generation failed');
  }

  async generateBranding(options: GenerateBrandingOptions): Promise<{
    tagline: string;
    mission: string;
    vision: string;
    colorPalette: string;
    typography: string;
    description: string;
    personality?: string;
    logoConcept?: string;
    visualStyle?: string;
    messagingAngle?: string;
  }> {
    const model = process.env.NVIDIA_NIM_BRANDING_MODEL || 'z-ai/glm-5.2';
    const values = Array.isArray(options.values)
      ? options.values
      : typeof options.values === 'string'
        ? [options.values]
        : [];
    const system = `You are a senior brand strategist, naming director, and identity designer.
Return only strict JSON. No markdown, no comments, no prose before or after the JSON.
The JSON must contain these string fields: tagline, mission, vision, colorPalette, typography, description, personality, logoConcept, visualStyle, messagingAngle.
colorPalette must be exactly 3 accessible hex colors separated by commas. Avoid generic startup blue unless the brief demands it.
typography must be exactly 2 real font family names separated by a comma.
Create a bespoke brand identity based only on the user's brief. Avoid generic words like leader, exceptional, innovative, solution unless made specific by the brief.
Make it feel like a premium brand system from an expert identity studio: strategic, concrete, differentiated, and visually actionable.`;
    const prompt = `Generate a premium brand identity platform in French.
Brand name: ${options.brandName}
Industry: ${options.industry || ''}
Description: ${options.description || ''}
Style: ${options.style || ''}
Values: ${values.map(value => String(value).trim()).filter(Boolean).join(', ')}

Creative requirements:
- Find a distinct positioning, not a generic company description.
- Tagline: short, ownable, 4 to 9 words, no cliché.
- Mission and vision: concrete, premium, useful for a SaaS/tech landing page.
- Palette: 3 hex colors with roles: primary, background/neutral, accent.
- Typography: one expressive heading font and one highly readable body font.
- logoConcept: describe one simple visual symbol that can become a logo mark.
- visualStyle: give a concise art direction for UI, website, posters, and logo.
- messagingAngle: one sentence explaining the brand's sharp commercial promise.

Return JSON only:
{
  "tagline": "...",
  "mission": "...",
  "vision": "...",
  "colorPalette": "#000000, #FFFFFF, #C27A2C",
  "typography": "Heading Font, Body Font",
  "description": "...",
  "personality": "...",
  "logoConcept": "...",
  "visualStyle": "...",
  "messagingAngle": "..."
}`;

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await this.generateText({
          prompt: `${prompt}${attempt > 1 ? `\nPrevious attempt failed: ${lastError?.message}. Return only a smaller valid JSON object with the exact required fields.` : ''}`,
          tone: 'expert',
          length: 'LONG',
          language: 'français',
          maxTokens: 2048,
        }, model, system);

        const parsed = this.parseBrandingJson(response);
        const required = ['tagline', 'mission', 'vision', 'colorPalette', 'typography', 'description'];
        const missing = required.filter(field => typeof parsed[field] !== 'string' || !parsed[field].trim());
        if (missing.length) {
          throw new Error(`Branding AI response is missing required fields: ${missing.join(', ')}`);
        }

        const colors = this.extractHexColors(parsed.colorPalette);
        if (colors.length !== 3) {
          throw new Error('Branding AI returned an invalid colorPalette. Expected exactly 3 hex colors.');
        }

        const fonts = String(parsed.typography).split(',').map((font: string) => font.trim()).filter(Boolean);
        if (fonts.length < 2) {
          throw new Error('Branding AI returned invalid typography. Expected heading and body fonts.');
        }

        return {
          tagline: parsed.tagline.trim(),
          mission: parsed.mission.trim(),
          vision: parsed.vision.trim(),
          colorPalette: colors.join(', '),
          typography: fonts.slice(0, 2).join(', '),
          description: parsed.description.trim(),
          personality: typeof parsed.personality === 'string' ? parsed.personality.trim() : '',
          logoConcept: typeof parsed.logoConcept === 'string' ? parsed.logoConcept.trim() : '',
          visualStyle: typeof parsed.visualStyle === 'string' ? parsed.visualStyle.trim() : '',
          messagingAngle: typeof parsed.messagingAngle === 'string' ? parsed.messagingAngle.trim() : '',
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`[AI Engine] Branding generation attempt ${attempt}/2 failed: ${lastError.message}`);
      }
    }

    throw lastError || new Error('Branding AI generation failed');
  }

  private parseBrandingJson(response: string): any {
    const candidate = this.extractJsonObject(response);
    if (!candidate) {
      throw new Error('Branding AI response did not contain a JSON object');
    }

    const cleaned = candidate.replace(/,\s*([}\]])/g, '$1').trim();
    const attempts = new Set<string>([candidate, cleaned]);
    const openBraces = (cleaned.match(/{/g) || []).length;
    const closeBraces = (cleaned.match(/}/g) || []).length;
    if (openBraces > closeBraces) {
      attempts.add(`${cleaned}${'}'.repeat(openBraces - closeBraces)}`.replace(/,\s*([}\]])/g, '$1'));
    }

    const errors: string[] = [];
    for (const attempt of attempts) {
      try {
        return JSON.parse(attempt);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    throw new Error(`Branding AI returned invalid JSON: ${errors.slice(0, 2).join(' | ')}`);
  }

  private extractHexColors(value: string): string[] {
    return Array.from(new Set(String(value).match(/#[0-9a-f]{6}\b/gi) || []))
      .map(color => color.toUpperCase())
      .slice(0, 3);
  }

  private extractJsonObject(response: string): string | null {
    const fencedJson = response.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    const source = fencedJson || response;
    const firstBrace = source.indexOf('{');
    if (firstBrace === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = firstBrace; index < source.length; index += 1) {
      const char = source[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === '{') depth += 1;
      if (char === '}') depth -= 1;
      if (depth === 0) return source.slice(firstBrace, index + 1);
    }

    return source.slice(firstBrace);
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

  // ─── Methods required by other modules ───

  async generateTextStreaming(options: GenerateTextOptions, model?: string, system?: string): Promise<string> {
    return this.generateText(options, model, system);
  }

  async generateLogo(options: { brandName: string; industry?: string; style?: string; logoDescription?: string; primaryColor?: string; secondaryColor?: string; accentColor?: string }): Promise<string> {
    const {
      brandName,
      industry = 'business',
      style = 'modern',
      logoDescription = '',
      primaryColor,
      secondaryColor,
      accentColor,
    } = options;
    const prompt = [
      `Premium vector-like brand symbol for "${brandName}".`,
      `${industry} identity, ${style} style, expert logo design.`,
      primaryColor && secondaryColor && accentColor
        ? `Palette: ${primaryColor}, ${secondaryColor}, ${accentColor}.`
        : '',
      logoDescription ? `Symbol concept: ${logoDescription.slice(0, 220)}.` : '',
      'Create one simple memorable abstract mark, clear silhouette, balanced negative space, scalable geometry, refined proportions, centered on a clean flat background. No words, no letters, no initials, no watermark, no mockup, no 3D render, no extra readable text.',
    ].filter(Boolean).join(' ');

    const logoUrl = await this.generateImage({
      prompt,
      size: '768x768',
      style,
    });

    if (/placehold\.co|Image\+Generation\+Failed|No\+Image\+Generated|Error\+Generating\+Image/i.test(logoUrl)) {
      throw new Error('Logo image generation failed');
    }

    return logoUrl;
  }

  async generateWebsiteContentJson(options: any): Promise<any> {
    const { businessName, description, services, language } = options;
    const isFr = language === 'fr';
    return { sections: [{ type: 'hero', data: { heading: businessName, subheading: description?.slice(0, 120) || '' } }, { type: 'about', data: { heading: isFr ? 'À propos' : 'About', body: description || '' } }, { type: 'services', data: { heading: isFr ? 'Nos services' : 'Our services', items: (services || []).map(n => ({ name: n, description: '' })) } }, { type: 'contact', data: { heading: isFr ? 'Contact' : 'Contact' } }], language: language || 'fr' };
  }

  async generateThemePatch(instruction: string, _theme: any): Promise<any> {
    const l = instruction.toLowerCase();
    if (l.includes('dark')) return { primaryColor: '#111827', secondaryColor: '#1F2937' };
    if (l.includes('modern')) return { fontFamily: 'Inter', template: 'modern' };
    return { fontFamily: 'Inter' };
  }

  async generateSectionJson(options: any): Promise<any> {
    return { type: 'custom', data: { heading: options.request?.slice(0, 80) || 'New section', subheading: '', body: '', items: [] } };
  }
}
