import { normalizeSpeechWav } from './wav';
import { directionPrefix } from '@/lib/audio/options';
import { speechRequestSchema } from '@/schemas/context';
import type { GroqClient } from './client';

export async function groqSynthesize(client: GroqClient, text: string, preferences: { voice?: string; style?: string } = {}): Promise<ArrayBuffer> {
  const request = speechRequestSchema.parse({ text, ...preferences });
  const input = directionPrefix(request.style) + request.text;
  const response = await client.http.response('/audio/speech', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'audio/wav' },
    body: JSON.stringify({ model: client.config.speechModel, voice: request.voice ?? client.config.speechVoice, input, response_format: 'wav' }),
  });
  return normalizeSpeechWav(await response.arrayBuffer());
}
