import { z } from 'zod';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return privateJson({ error: { code: error.code, message: error.message } }, error.status);
  }
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return privateJson({ error: { code: 'INVALID_REQUEST', message: 'Check the image, question, or locality and try again.' } }, 400);
  }
  // Do not log or echo upstream errors, which may contain images, locations, or credentials.
  return privateJson({ error: { code: 'INTERNAL_ERROR', message: 'Context could not complete the request. Please try again.' } }, 500);
}

export function jsonRoute<Input, Output>(input: z.ZodType<Input>, output: z.ZodType<Output>, handler: (value: Input) => Promise<Output>, maxRequestLength = 8_100_000) {
  return async (request: Request) => {
    try {
      if (!request.headers.get('content-type')?.includes('application/json')) {
        throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send this request as JSON.');
      }
      const text = await request.text();
      if (text.length > maxRequestLength) throw new ApiError(413, 'REQUEST_TOO_LARGE', 'This full-resolution photo is too large to analyze. Try another image or move closer to the reference.');
      const value = input.parse(JSON.parse(text));
      const result = await handler(value);
      const parsed = output.safeParse(result);
      if (!parsed.success) throw new ApiError(502, 'INVALID_PROVIDER_RESPONSE', 'The analysis service returned an unreadable response. Please try again.');
      return privateJson(parsed.data);
    } catch (error) { return errorResponse(error); }
  };
}
