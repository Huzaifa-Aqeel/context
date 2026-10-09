import type { Providers } from '@/lib/orchestration/context';
import { audioConfig, chatConfig, qlooConfig, tavilyConfig } from '@/lib/server/config';
import { AudioClient, transcribe } from '@/lib/ai/audio';
import { ChatClient } from '@/lib/ai/client';
import { ChatVision } from '@/lib/ai/vision';
import { ChatReasoning } from '@/lib/ai/reasoning';
import { ChatSceneReasoning } from '@/lib/ai/scene-decision';
import { extractInterests, extractInterestEdits, extractStructuredInterests } from '@/lib/ai/interests';
import type { StructuredInterests } from '@/types/taste';
import { QlooClient } from '@/lib/qloo/client';
import { TavilyClient } from '@/lib/research/tavily';
import { GeoapifyClient } from '@/lib/places/geoapify';

/** API routes alone import this module. Each request gets fresh provider/evidence caches. */
export function getProviders(): Providers {
  const display = chatConfig('display');
  return { vision: new ChatVision(new ChatClient(chatConfig('vision'))), llm: new ChatReasoning(new ChatClient(chatConfig('llm'))),
    displayLlm: new ChatReasoning(new ChatClient(display), display.model, display.briefThinking),
    sceneReasoner: new ChatSceneReasoning(new ChatClient(display), display.model, display.briefThinking), qloo: new QlooClient(qlooConfig()),
    ...(process.env.TAVILY_API_KEY?.trim() ? { research: new TavilyClient(tavilyConfig()) } : {}),
    ...((process.env.GEOAPIFY_API_KEY ?? process.env.geoapify_api_key)?.trim()
      ? { places: new GeoapifyClient((process.env.GEOAPIFY_API_KEY ?? process.env.geoapify_api_key)!.trim()) } : {}) };
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
