import { ApiError } from '@/lib/api/server';
import type { Providers } from '@/lib/orchestration/context';

/** API routes alone import this module. Connect real adapters here after choosing providers. */
export function getProviders(): Providers {
  throw new ApiError(503, 'PROVIDERS_NOT_CONFIGURED', 'Cultural analysis is not available yet. Your scene has not been analyzed.');
}

export async function transcribeAudio(_audio: File): Promise<{ text: string }> {
  throw new ApiError(503, 'PROVIDERS_NOT_CONFIGURED', 'Voice transcription is not available yet. You can type your question.');
}
