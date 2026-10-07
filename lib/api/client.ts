import { z } from 'zod';
import { apiErrorSchema } from '@/schemas/context';

export async function postApi<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  const configuredOrigin = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '');
  const response = await fetch(configuredOrigin ? `${configuredOrigin}${path}` : path, {
    method: 'POST',
    headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    body: body instanceof FormData ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(payload);
    throw new Error(error.success ? error.data.error.message : 'Context could not complete the request. Please try again.');
  }
  return schema.parse(payload);
}
