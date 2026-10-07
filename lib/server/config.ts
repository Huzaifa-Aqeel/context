import { ApiError } from '@/lib/api/server';

type Environment = Record<string, string | undefined>;
export type GroqConfig = { apiKey: string; baseUrl: string; visionModel: string; reasoningModel: string; transcriptionModel: string; speechModel: string; speechVoice: string };
export type QlooConfig = { apiKey: string; baseUrl: string };

function required(value: string | undefined, provider: string) {
  if (!value?.trim()) throw new ApiError(503, 'PROVIDERS_NOT_CONFIGURED', `${provider} is not configured. Please try again later.`);
  return value.trim();
}
function serverUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
    return value.replace(/\/+$/, '');
  } catch { throw new ApiError(503, 'INVALID_PROVIDER_CONFIG', 'An analysis service is not configured correctly.'); }
}
export function groqConfig(env: Environment = process.env): GroqConfig {
  const visionModel = env.GROQ_VISION_MODEL?.trim() || env.vision_model?.trim() || 'qwen/qwen3.8-27b';
  return {
    apiKey: required(env.GROQ_API_KEY, 'Speech and image analysis'),
    baseUrl: serverUrl(env.GROQ_API_URL?.trim() || 'https://api.groq.com/openai/v1'),
    visionModel,
    reasoningModel: env.GROQ_LLM_MODEL?.trim() || visionModel,
    transcriptionModel: env.GROQ_TRANSCRIPTION_MODEL?.trim() || 'whisper-large-v3-turbo',
    speechModel: env.GROQ_TTS_MODEL?.trim() || env.GROQ_TXT_SPEECH?.trim() || 'canopylabs/orpheus-v1-english',
    speechVoice: env.GROQ_TTS_VOICE?.trim() || 'troy',
  };
}
export function qlooConfig(env: Environment = process.env): QlooConfig {
  return {
    apiKey: required(env.QLOO_API_KEY, 'Cultural analysis'),
    baseUrl: serverUrl(env.QLOO_BASE_URL?.trim() || 'https://hackathon.api.qloo.com'),
  };
}
export function providerReadiness(env: Environment = process.env) {
  return { groq: Boolean(env.GROQ_API_KEY?.trim()), qloo: Boolean(env.QLOO_API_KEY?.trim()) };
}
