import { ApiError } from '@/lib/api/server';
import { providerData } from '@/lib/server/http';
import { transcriptionSchema } from '@/schemas/context';
import type { GroqClient } from './client';

export async function groqTranscribe(client: GroqClient, audio: File) {
  const form = new FormData();
  form.append('file', audio, audio.name);
  form.append('model', client.config.transcriptionModel);
  form.append('response_format', 'json');
  form.append('temperature', '0');
  const result = await client.http.request('/audio/transcriptions', { method: 'POST', body: form });
  if (typeof result === 'object' && result !== null && 'text' in result && typeof result.text === 'string' && !result.text.trim()) {
    throw new ApiError(422, 'NO_SPEECH', 'I did not hear a question. Please record again or type your question.');
  }
  return providerData(transcriptionSchema, result);
}
