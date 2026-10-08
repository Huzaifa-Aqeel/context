import { ChatVision } from '@/lib/ai/vision';
import type { GroqClient } from './client';

/** Legacy import compatibility; analysis uses the shared configurable adapter. */
export class GroqVision extends ChatVision {
  constructor(client: GroqClient) { super(client, client.config.visionModel); }
}
