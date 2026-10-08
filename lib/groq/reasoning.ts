import { ChatReasoning } from '@/lib/ai/reasoning';
import type { GroqClient } from './client';

/** Legacy import compatibility; analysis uses the shared configurable adapter. */
export class GroqReasoning extends ChatReasoning {
  constructor(client: GroqClient) { super(client, client.config.reasoningModel); }
}
