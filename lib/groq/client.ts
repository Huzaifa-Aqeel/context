import { ChatClient } from '@/lib/ai/client';
import type { GroqConfig } from '@/lib/server/config';
import type { ProviderFetch } from '@/lib/server/http';

export class GroqClient extends ChatClient {
  constructor(readonly config: GroqConfig, fetcher?: ProviderFetch) {
    super({ apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.reasoningModel, tokenParameter: 'max_completion_tokens', requestOptions: {}, jsonMode: true, label: 'Groq' }, fetcher);
  }
}
