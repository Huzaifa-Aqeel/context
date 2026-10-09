import { z } from 'zod';
import type { TavilyConfig } from '@/lib/server/config';
import { ProviderHttp, providerData, type ProviderFetch } from '@/lib/server/http';

const responseSchema = z.object({ results: z.array(z.object({
  title: z.string().default(''), url: z.string(), content: z.string().default(''),
})).max(20) });

export type ResearchSource = { title: string; url: string; content: string; retrievedAt: string };
export interface ResearchService {
  search(query: string): Promise<ResearchSource[]>;
}

function safeUrl(value: string) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : undefined; }
  catch { return undefined; }
}

export class TavilyClient implements ResearchService {
  private http: ProviderHttp;
  constructor(config: TavilyConfig, fetcher?: ProviderFetch) {
    this.http = new ProviderHttp(config.baseUrl, { Authorization: `Bearer ${config.apiKey}` }, 'TAVILY', fetcher);
  }
  async search(query: string): Promise<ResearchSource[]> {
    if (!query.trim() || query.length > 500) throw new Error('Provide a concise research question.');
    const response = providerData(responseSchema, await this.http.json('/search', {
      query, search_depth: 'basic', topic: 'general', max_results: 5, chunks_per_source: 2,
      include_answer: false, include_raw_content: false, include_images: false,
    }));
    const retrievedAt = new Date().toISOString();
    return response.results.flatMap((result) => {
      const url = safeUrl(result.url);
      if (!url || !result.content.trim()) return [];
      return [{ title: result.title.slice(0, 500), url, content: result.content.slice(0, 3500), retrievedAt }];
    });
  }
}
