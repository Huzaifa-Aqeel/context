import { z } from 'zod';
import { apiErrorSchema } from '@/schemas/context';
import { withRequestSignal } from './timeout';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { resolveApiUrl } from './origin';

export function apiUrl(path: string) {
  return resolveApiUrl(path, process.env.EXPO_PUBLIC_API_URL, Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost,
    Platform.OS !== 'web', typeof __DEV__ !== 'undefined' && __DEV__);
}

export async function postApi<T>(path: string, body: unknown, schema: z.ZodType<T>, parent?: AbortSignal): Promise<T> {
  return withRequestSignal(async (signal) => {
    const response = await fetch(apiUrl(path), {
      method: 'POST', headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
      body: body instanceof FormData ? body : JSON.stringify(body), signal,
    });
    const payload: unknown = await response.json().catch(() => {
      throw new Error('Context’s API server did not return data. Start the Expo server or configure EXPO_PUBLIC_API_URL.');
    });
    if (!response.ok) {
      const error = apiErrorSchema.safeParse(payload);
      throw new Error(error.success ? error.data.error.message : 'Context could not complete the request. Please try again.');
    }
    return schema.parse(payload);
  }, 180_000, parent);
}
