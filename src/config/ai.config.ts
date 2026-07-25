import { registerAs } from '@nestjs/config';

export default registerAs('ai', () => ({
  nvidiaNimApiKey: process.env.NVIDIA_NIM_API_KEY || '',
  nvidiaNimBaseUrl: process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1',
  textModel: process.env.NVIDIA_NIM_TEXT_MODEL || 'meta/llama-3.1-70b-instruct',
  // Real text-to-image model (the previous default was a text2world/video model).
  imageModel: process.env.NVIDIA_NIM_IMAGE_MODEL || 'black-forest-labs/flux.1-schnell',
  imageBaseUrl: process.env.NVIDIA_NIM_IMAGE_BASE_URL || 'https://ai.api.nvidia.com/v1/genai',
  maxTokens: parseInt(process.env.AI_MAX_TOKENS || '1024', 10),
  temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
}));