import { registerAs } from '@nestjs/config';

export default registerAs('ai', () => ({
  nvidiaNimApiKey: process.env.NVIDIA_NIM_API_KEY || '',
  nvidiaNimBaseUrl: process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1',
  textModel: process.env.NVIDIA_NIM_TEXT_MODEL || 'nvidia/llama-3.1-nemotron-70b-instruct',
  imageModel: process.env.NVIDIA_NIM_IMAGE_MODEL || 'nvidia/cosmos-1.0-diffusion-7b-text2world',
  maxTokens: parseInt(process.env.AI_MAX_TOKENS || '1024', 10),
  temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
}));