import { ApiError, errorResponse } from '@/lib/api/server';
import { synthesizeSpeech } from '@/lib/providers';
import { speechRequestSchema } from '@/schemas/context';

export async function POST(request: Request) {
  try {
    if (!request.headers.get('content-type')?.includes('application/json')) throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the response text as JSON.');
    const text = await request.text();
    if (text.length > 2000) throw new ApiError(413, 'REQUEST_TOO_LARGE', 'Send a shorter spoken response.');
    const input = speechRequestSchema.parse(JSON.parse(text));
    const audio = await synthesizeSpeech(input.text, { voice: input.voice, style: input.style });
    return new Response(audio, { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}
