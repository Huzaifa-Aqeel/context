import { z } from 'zod';
import { apiErrorSchema } from '@/schemas/context';
import { withRequestSignal } from './timeout';

export function apiUrl(path: string) {
  const configuredOrigin = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '');
  return configuredOrigin ? `${configuredOrigin}${path}` : path;
}

export async function postApi<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  return withRequestSignal(async (signal) => {
    const response = await fetch(apiUrl(path), {
      method: 'POST', headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
      body: body instanceof FormData ? body : JSON.stringify(body), signal,
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      const error = apiErrorSchema.safeParse(payload);
      throw new Error(error.success ? error.data.error.message : 'Context could not complete the request. Please try again.');
    }
    return schema.parse(payload);
  }, 180_000);
}
