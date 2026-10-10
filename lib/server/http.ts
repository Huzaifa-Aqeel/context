import { z } from 'zod';
import { ApiError } from '@/lib/api/server';

export type ProviderFetch = typeof globalThis.fetch;
export function providerData<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(502, 'INVALID_PROVIDER_RESPONSE', 'An analysis service returned an unreadable response. Please try again.');
  return result.data;
}

export class ProviderHttp {
  constructor(private baseUrl: string, private headers: Record<string, string>, private provider: 'GROQ' | 'QLOO' | 'AI' | 'TAVILY' | 'PLACES', private fetcher: ProviderFetch = globalThis.fetch) {}

  async response(path: string, init: RequestInit = {}): Promise<Response> {
    let response: Response;
    try {
      // Worker runtimes can require the global receiver for fetch. Calling a
      // stored function as this.fetcher gives it this ProviderHttp instance.
      response = await this.fetcher.call(globalThis, `${this.baseUrl}${path}`, {
        ...init, headers: { Accept: 'application/json', ...this.headers, ...init.headers },
        signal: init.signal ?? AbortSignal.timeout(30_000),
      });
    } catch {
      throw new ApiError(503, `${this.provider}_UNREACHABLE`, 'An analysis service is temporarily unreachable. Please try again.');
    }
    if (!response.ok) {
      // Never echo an upstream error body: it may contain submitted data or credentials.
      if (response.status === 403 && this.provider === 'GROQ') {
        const body = await response.json().catch(() => null) as { error?: { code?: string } } | null;
        if (body?.error?.code === 'model_permission_blocked_project' || body?.error?.code === 'model_permission_blocked_org') throw new ApiError(503, 'GROQ_MODEL_DISABLED', 'The requested Groq model is disabled. Enable it in your Groq project model settings, then try again.');
      }
      if (response.status === 401 || response.status === 403) throw new ApiError(503, `${this.provider}_AUTH`, 'An analysis service could not authenticate. Please try again later.');
      if (response.status === 429) throw new ApiError(429, `${this.provider}_RATE_LIMIT`, 'The analysis service is busy. Wait a moment before trying again.');
      if (response.status === 404) throw new ApiError(404, `${this.provider}_NOT_FOUND`, 'No matching cultural information was found.');
      if (response.status === 400 || response.status === 422) throw new ApiError(422, `${this.provider}_REJECTED`, 'The analysis service could not process this request. Try a different reference or area.');
      throw new ApiError(502, `${this.provider}_ERROR`, 'An analysis service could not complete the request. Please try again.');
    }
    return response;
  }
  async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.response(path, init);
    try { return await response.json(); }
    catch { throw new ApiError(502, 'INVALID_PROVIDER_RESPONSE', 'An analysis service returned an unreadable response.'); }
  }
  json(path: string, body: unknown) {
    return this.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
}
