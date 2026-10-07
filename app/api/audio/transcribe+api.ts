import { ApiError, errorResponse, privateJson } from '@/lib/api/server';
import { transcribeAudio } from '@/lib/providers';
import { transcriptionSchema } from '@/schemas/context';

export async function POST(request: Request) {
  try {
    if (!request.headers.get('content-type')?.includes('multipart/form-data')) {
      throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send an audio recording.');
    }
    // The server uses Web FormData; React Native's global type lacks get().
    const form = await request.formData() as unknown as { get(name: string): unknown };
    const audio = form.get('audio');
    if (!(audio instanceof File) || audio.size === 0 || !['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/webm', 'audio/wav', 'audio/mpeg'].includes(audio.type)) {
      throw new ApiError(400, 'INVALID_AUDIO', 'Provide a supported audio recording.');
    }
    if (audio.size > 10_000_000) throw new ApiError(413, 'AUDIO_TOO_LARGE', 'Record a shorter question.');
    return privateJson(transcriptionSchema.parse(await transcribeAudio(audio)));
  } catch (error) { return errorResponse(error); }
}
