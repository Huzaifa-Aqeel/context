import { ApiError } from '@/lib/api/server';

type Environment = Record<string, string | undefined>;
export type ChatConfig = { apiKey: string; baseUrl: string; model: string; tokenParameter: 'max_tokens' | 'max_completion_tokens'; requestOptions: Record<string, unknown>; jsonMode: boolean; label: string; timeoutMs?: number; briefThinking?: boolean };
export type AudioConfig = { apiKey: string; baseUrl: string; model: string; voice: string; label: string };
export type GroqConfig = { apiKey: string; baseUrl: string; visionModel: string; reasoningModel: string; transcriptionModel: string; speechModel: string; speechVoice: string };
export type QlooConfig = { apiKey: string; baseUrl: string };
export type TavilyConfig = { apiKey: string; baseUrl: string };

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
export function tavilyConfig(env: Environment = process.env): TavilyConfig {
  return { apiKey: required(env.TAVILY_API_KEY, 'Research'), baseUrl: serverUrl(env.TAVILY_API_URL?.trim() || 'https://api.tavily.com') };
}
const configured = (env: Environment, prefix: string) => ['API_KEY', 'API_URL', 'MODEL'].some((part) => Boolean(env[`${prefix}_${part}`]?.trim()));
function providerLabel(baseUrl: string, override?: string) {
  if (override?.trim()) return override.trim().slice(0, 80);
  const host = new URL(baseUrl).hostname;
  if (host === 'api.groq.com') return 'Groq';
  if (host.endsWith('.aliyuncs.com')) return 'Alibaba Cloud';
  if (host === 'api.openai.com') return 'OpenAI';
  return 'the configured AI provider';
}
function chatOptions(env: Environment, prefix: string, baseUrl: string, inherited?: ChatConfig): Pick<ChatConfig, 'tokenParameter' | 'requestOptions' | 'jsonMode'> {
  const sameEndpoint = inherited?.baseUrl === baseUrl;
  const tokenParameter = env[`${prefix}_TOKEN_PARAMETER`]?.trim() || (sameEndpoint ? inherited.tokenParameter : new URL(baseUrl).hostname === 'api.groq.com' ? 'max_completion_tokens' : 'max_tokens');
  if (tokenParameter !== 'max_tokens' && tokenParameter !== 'max_completion_tokens') throw new ApiError(503, 'INVALID_PROVIDER_CONFIG', 'The model token parameter is not configured correctly.');
  let requestOptions: Record<string, unknown> = sameEndpoint ? inherited.requestOptions : new URL(baseUrl).hostname.endsWith('.aliyuncs.com') ? { enable_thinking: false } : {};
  const raw = env[`${prefix}_REQUEST_OPTIONS`]?.trim();
  if (raw) {
    try {
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
      const reserved = ['model', 'messages', 'tools', 'tool_choice', 'max_tokens', 'max_completion_tokens', 'response_format', 'stream'];
      if (Object.keys(value).some((key) => reserved.includes(key) || key === '__proto__' || key === 'constructor' || key === 'prototype')) throw new Error();
      requestOptions = { ...requestOptions, ...value };
    } catch { throw new ApiError(503, 'INVALID_PROVIDER_CONFIG', 'The model request options are not configured correctly.'); }
  }
  const jsonSetting = env[`${prefix}_JSON_MODE`]?.trim();
  if (jsonSetting && !['true', 'false'].includes(jsonSetting)) throw new ApiError(503, 'INVALID_PROVIDER_CONFIG', 'The model JSON mode is not configured correctly.');
  return { tokenParameter, requestOptions, jsonMode: jsonSetting ? jsonSetting === 'true' : sameEndpoint ? inherited.jsonMode : true };
}
/** Explicit generic settings take precedence; incomplete settings never borrow a legacy provider's key. */
export function chatConfig(role: 'llm' | 'vision' | 'display' | 'shelf', env: Environment = process.env): ChatConfig {
  if (role === 'display' || role === 'shelf') {
    const inherited = chatConfig('llm', env);
    const setting = (name: string) => env[`DISPLAY_${name}`]?.trim() || env[`SHELF_${name}`]?.trim();
    const baseUrl = serverUrl(setting('API_URL') || inherited.baseUrl);
    const sameEndpoint = baseUrl === inherited.baseUrl;
    const model = required(setting('MODEL') || (baseUrl.includes('.aliyuncs.com') ? 'qwen3.8-max' : inherited.model), 'Display reasoning model');
    const thinkingSetting = setting('BRIEF_THINKING');
    if (thinkingSetting && !['true', 'false'].includes(thinkingSetting)) throw new ApiError(503, 'INVALID_PROVIDER_CONFIG', 'Display brief reasoning is not configured correctly.');
    const briefThinking = thinkingSetting ? thinkingSetting === 'true' : new URL(baseUrl).hostname.endsWith('.aliyuncs.com') && /^qwen3\.8-max(?:$|-)/i.test(model);
    const optionsEnv = { ...env, DISPLAY_TOKEN_PARAMETER: setting('TOKEN_PARAMETER'),
      DISPLAY_REQUEST_OPTIONS: setting('REQUEST_OPTIONS'), DISPLAY_JSON_MODE: setting('JSON_MODE') };
    const options = chatOptions(optionsEnv, 'DISPLAY', baseUrl, sameEndpoint ? inherited : undefined);
    return { baseUrl, apiKey: required(setting('API_KEY') || (sameEndpoint ? inherited.apiKey : undefined), 'Display reasoning credentials'),
      model,
      label: providerLabel(baseUrl, setting('PROVIDER_NAME') || (sameEndpoint ? inherited.label : undefined)),
      timeoutMs: Math.min(Math.max(Number(setting('TIMEOUT_MS')) || 90_000, 10_000), 180_000),
      ...options, briefThinking,
      tokenParameter: !setting('TOKEN_PARAMETER') && briefThinking ? 'max_completion_tokens' : options.tokenParameter };
  }
  const visionTimeoutMs = Math.min(Math.max(Number(env.VISION_TIMEOUT_MS) || 60_000, 10_000), 180_000);
  if (role === 'vision' && env.VISION_API_KEY?.trim() && env.VISION_API_URL?.trim() && env.VISION_MODEL?.trim()) {
    const baseUrl = serverUrl(env.VISION_API_URL.trim());
    return { apiKey: env.VISION_API_KEY.trim(), baseUrl, model: env.VISION_MODEL.trim(), label: providerLabel(baseUrl, env.VISION_PROVIDER_NAME), ...chatOptions(env, 'VISION', baseUrl), timeoutMs: visionTimeoutMs };
  }
  let shared: ChatConfig | undefined;
  if (configured(env, 'LLM')) {
    const baseUrl = serverUrl(required(env.LLM_API_URL, 'AI endpoint'));
    shared = { apiKey: required(env.LLM_API_KEY, 'AI credentials'), baseUrl, model: required(env.LLM_MODEL, 'AI model'), label: providerLabel(baseUrl, env.LLM_PROVIDER_NAME), ...chatOptions(env, 'LLM', baseUrl) };
  }
  if (role === 'vision' && configured(env, 'VISION')) {
    const baseUrl = serverUrl(required(env.VISION_API_URL?.trim() || shared?.baseUrl, 'Image analysis endpoint'));
    const sameEndpoint = baseUrl === shared?.baseUrl;
    return { baseUrl, apiKey: required(env.VISION_API_KEY?.trim() || (sameEndpoint ? shared?.apiKey : undefined), 'Image analysis credentials'), model: required(env.VISION_MODEL?.trim() || shared?.model, 'Image analysis model'), label: providerLabel(baseUrl, env.VISION_PROVIDER_NAME || (sameEndpoint ? shared?.label : undefined)), ...chatOptions(env, 'VISION', baseUrl, shared), timeoutMs: visionTimeoutMs };
  }
  if (shared) {
    if (role === 'vision') return { ...shared, label: providerLabel(shared.baseUrl, env.VISION_PROVIDER_NAME || shared.label), ...chatOptions(env, 'VISION', shared.baseUrl, shared), timeoutMs: visionTimeoutMs };
    return shared;
  }
  const legacy = groqConfig(env);
  return { apiKey: legacy.apiKey, baseUrl: legacy.baseUrl, model: role === 'vision' ? legacy.visionModel : legacy.reasoningModel, label: providerLabel(legacy.baseUrl), ...chatOptions(env, role === 'vision' ? 'VISION' : 'LLM', legacy.baseUrl), ...(role === 'vision' ? { timeoutMs: visionTimeoutMs } : {}) };
}
export function providerReadiness(env: Environment = process.env) {
  const ready = (role: 'llm' | 'vision') => { try { chatConfig(role, env); return true; } catch { return false; } };
  const audioReady = (role: 'transcription' | 'tts') => { try { audioConfig(role, env); return true; } catch { return false; } };
  return { vision: ready('vision'), llm: ready('llm'), transcription: audioReady('transcription'), tts: audioReady('tts'), groq: Boolean(env.GROQ_API_KEY?.trim()), qloo: Boolean(env.QLOO_API_KEY?.trim()) };
}
export function analysisLabels(env: Environment = process.env) {
  const label = (role: 'llm' | 'vision') => { try { return chatConfig(role, env).label; } catch { return 'the configured AI provider'; } };
  const audioLabel = (role: 'transcription' | 'tts') => { try { return audioConfig(role, env).label; } catch { return 'the configured audio provider'; } };
  return { vision: label('vision'), llm: label('llm'), transcription: audioLabel('transcription'), tts: audioLabel('tts') };
}
export function audioConfig(role: 'transcription' | 'tts', env: Environment = process.env): AudioConfig {
  const prefix = role === 'tts' ? 'TTS' : 'TRANSCRIPTION';
  const legacyUrl = (env.GROQ_API_URL?.trim() || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
  const baseUrl = serverUrl(env[`${prefix}_API_URL`]?.trim() || legacyUrl);
  const sameEndpoint = baseUrl === legacyUrl;
  const model = env[`${prefix}_MODEL`]?.trim() || (sameEndpoint ? role === 'tts' ? env.GROQ_TTS_MODEL?.trim() || env.GROQ_TXT_SPEECH?.trim() || 'canopylabs/orpheus-v1-english' : env.GROQ_TRANSCRIPTION_MODEL?.trim() || 'whisper-large-v3-turbo' : undefined);
  return { baseUrl, apiKey: required(env[`${prefix}_API_KEY`]?.trim() || (sameEndpoint ? env.GROQ_API_KEY : undefined), `${role} credentials`), model: required(model, `${role} model`), voice: env.TTS_VOICE?.trim() || env.GROQ_TTS_VOICE?.trim() || 'troy', label: providerLabel(baseUrl, env[`${prefix}_PROVIDER_NAME`]) };
}
