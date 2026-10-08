import { transcribe } from '@/lib/ai/audio';
import type { GroqClient } from './client';
export const groqTranscribe = (client: GroqClient, audio: File) => transcribe({ http: client.http, model: client.config.transcriptionModel }, audio);
