import { ApiError } from '@/lib/api/server';
import { ProviderHttp, providerData, type ProviderFetch } from '@/lib/server/http';
import type { AudioConfig } from '@/lib/server/config';
import { speechRequestSchema, transcriptionSchema } from '@/schemas/context';
import { directionPrefix } from '@/lib/audio/options';
import { normalizeSpeechWav } from '@/lib/groq/wav';

type AudioConnection = { http: ProviderHttp; model: string; voice?: string };
export class AudioClient implements AudioConnection {
  readonly http: ProviderHttp;
  readonly model: string;
  readonly voice: string;
  constructor(config: AudioConfig, fetcher?: ProviderFetch) {
    this.model = config.model; this.voice = config.voice;
    this.http = new ProviderHttp(config.baseUrl, { Authorization: `Bearer ${config.apiKey}` }, new URL(config.baseUrl).hostname === 'api.groq.com' ? 'GROQ' : 'AI', fetcher);
  }
}
export async function transcribe(client: AudioConnection, audio: File) {
  const form = new FormData();
  form.append('file', audio, audio.name); form.append('model', client.model); form.append('response_format', 'json'); form.append('temperature', '0');
  const result = await client.http.request('/audio/transcriptions', { method: 'POST', body: form });
  if (typeof result === 'object' && result !== null && 'text' in result && typeof result.text === 'string' && !result.text.trim()) throw new ApiError(422, 'NO_SPEECH', 'I did not hear a question. Please record again or type your question.');
  return providerData(transcriptionSchema, result);
}
export async function synthesize(client: AudioConnection, text: string, preferences: { voice?: string; style?: string } = {}): Promise<ArrayBuffer> {
  const request = speechRequestSchema.parse({ text, ...preferences });
  const response = await client.http.response('/audio/speech', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'audio/wav' },
    body: JSON.stringify({ model: client.model, voice: request.voice ?? client.voice, input: directionPrefix(request.style) + request.text, response_format: 'wav' }),
  });
  return normalizeSpeechWav(await response.arrayBuffer());
}
