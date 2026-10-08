import { synthesize } from '@/lib/ai/audio';
import type { GroqClient } from './client';
export const groqSynthesize = (client: GroqClient, text: string, preferences: { voice?: string; style?: string } = {}) => synthesize({ http: client.http, model: client.config.speechModel, voice: client.config.speechVoice }, text, preferences);
