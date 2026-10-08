import type { Providers } from '@/lib/orchestration/context';
import { audioConfig, chatConfig, qlooConfig } from '@/lib/server/config';
import { AudioClient, transcribe } from '@/lib/ai/audio';
import { ChatClient } from '@/lib/ai/client';
import { ChatVision } from '@/lib/ai/vision';
import { ChatReasoning } from '@/lib/ai/reasoning';
import { extractInterests, extractInterestEdits, extractStructuredInterests } from '@/lib/ai/interests';
import type { StructuredInterests } from '@/types/taste';
import { QlooClient } from '@/lib/qloo/client';

/** API routes alone import this module. Each request gets fresh provider/evidence caches. */
export function getProviders(): Providers {
  return { vision: new ChatVision(new ChatClient(chatConfig('vision'))), llm: new ChatReasoning(new ChatClient(chatConfig('llm'))), qloo: new QlooClient(qlooConfig()) };
}

export const extractTasteInterests = (text: string) => extractInterests(new ChatClient(chatConfig('llm')), text);
export const extractStructuredTasteInterests = (text: string) => extractStructuredInterests(new ChatClient(chatConfig('llm')), text);
export const extractTasteEdits = (text: string, interests: StructuredInterests) => extractInterestEdits(new ChatClient(chatConfig('llm')), text, interests);

export async function transcribeAudio(audio: File): Promise<{ text: string }> {
  return transcribe(new AudioClient(audioConfig('transcription')), audio);
}

export async function synthesizeSpeech(text: string, preferences: { voice?: string; style?: string } = {}): Promise<ArrayBuffer> {
  const { synthesize } = await import('@/lib/ai/audio');
  return synthesize(new AudioClient(audioConfig('tts')), text, preferences);
}
