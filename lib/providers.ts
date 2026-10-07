import type { Providers } from '@/lib/orchestration/context';
import { groqConfig, qlooConfig } from '@/lib/server/config';
import { GroqClient } from '@/lib/groq/client';
import { GroqVision } from '@/lib/groq/vision';
import { GroqReasoning } from '@/lib/groq/reasoning';
import { groqTranscribe } from '@/lib/groq/transcription';
import { QlooClient } from '@/lib/qloo/client';

/** API routes alone import this module. Each request gets fresh provider/evidence caches. */
export function getProviders(): Providers {
  const groq = new GroqClient(groqConfig());
  return { vision: new GroqVision(groq), llm: new GroqReasoning(groq), qloo: new QlooClient(qlooConfig()) };
}

export async function transcribeAudio(audio: File): Promise<{ text: string }> {
  return groqTranscribe(new GroqClient(groqConfig()), audio);
}

export async function synthesizeSpeech(text: string, preferences: { voice?: string; style?: string } = {}): Promise<ArrayBuffer> {
  const { groqSynthesize } = await import('@/lib/groq/speech');
  return groqSynthesize(new GroqClient(groqConfig()), text, preferences);
}
