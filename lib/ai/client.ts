import { z } from 'zod';
import type { ChatConfig } from '@/lib/server/config';
import { ProviderHttp, providerData, type ProviderFetch } from '@/lib/server/http';

const completionSchema = z.object({ choices: z.array(z.object({
  message: z.object({ content: z.string().nullable().optional(), tool_calls: z.array(z.object({ id: z.string(), type: z.literal('function'), function: z.object({ name: z.string(), arguments: z.string() }) })).optional() }),
  finish_reason: z.string().nullable().optional(),
})).min(1) });
export interface CompletionClient {
  readonly model: string;
  completion(body: Record<string, unknown>): Promise<z.infer<typeof completionSchema>['choices'][number]>;
}
/** OpenAI-compatible Chat Completions transport; credentials and dialect stay server-side. */
export class ChatClient implements CompletionClient {
  readonly http: ProviderHttp;
  readonly model: string;
  constructor(private settings: ChatConfig, fetcher?: ProviderFetch) {
    this.model = settings.model;
    this.http = new ProviderHttp(settings.baseUrl, { Authorization: `Bearer ${settings.apiKey}` }, new URL(settings.baseUrl).hostname === 'api.groq.com' ? 'GROQ' : 'AI', fetcher);
  }
  async completion(body: Record<string, unknown>) {
    const { max_completion_tokens, max_tokens, response_format, ...rest } = body;
    const params = { ...rest, ...this.settings.requestOptions, model: body.model ?? this.model,
      ...(max_completion_tokens !== undefined || max_tokens !== undefined ? { [this.settings.tokenParameter]: max_completion_tokens ?? max_tokens } : {}),
      ...(this.settings.jsonMode && response_format ? { response_format } : {}),
    };
    return providerData(completionSchema, await this.http.json('/chat/completions', params)).choices[0];
  }
}
