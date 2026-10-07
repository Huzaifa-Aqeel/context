import { z } from 'zod';
import type { GroqConfig } from '@/lib/server/config';
import { ProviderHttp, providerData, type ProviderFetch } from '@/lib/server/http';

const completionSchema = z.object({ choices: z.array(z.object({
  message: z.object({
    content: z.string().nullable().optional(),
    tool_calls: z.array(z.object({ id: z.string(), type: z.literal('function'), function: z.object({ name: z.string(), arguments: z.string() }) })).optional(),
  }), finish_reason: z.string().nullable().optional(),
})).min(1) });

export class GroqClient {
  readonly http: ProviderHttp;
  constructor(readonly config: GroqConfig, fetcher?: ProviderFetch) {
    this.http = new ProviderHttp(config.baseUrl, { Authorization: `Bearer ${config.apiKey}` }, 'GROQ', fetcher);
  }
  async completion(body: Record<string, unknown>) {
    return providerData(completionSchema, await this.http.json('/chat/completions', body)).choices[0];
  }
}
