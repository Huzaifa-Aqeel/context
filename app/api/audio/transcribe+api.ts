import { ApiError, errorResponse, privateJson } from '@/lib/api/server';
import { transcribeAudio } from '@/lib/providers';
import { transcriptionSchema } from '@/schemas/context';

const audioTypes = new Set(['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/webm', 'audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/ogg']);
const audioExtensions: Record<string, string> = {
  m4a: 'audio/mp4', mp4: 'audio/mp4', webm: 'audio/webm', wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg',
};
const extensionForType: Record<string, string> = {
  'audio/mp4': 'm4a', 'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a', 'audio/webm': 'webm',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg',
};

function recordingPart(value: unknown): value is { size: number; type?: string; name?: string; arrayBuffer: () => Promise<ArrayBuffer> } {
  return typeof value === 'object' && value !== null && 'size' in value && typeof value.size === 'number'
    && 'arrayBuffer' in value && typeof value.arrayBuffer === 'function';
}

function detectedAudioType(bytes: Uint8Array) {
  const marker = (offset: number, value: string) => bytes.length >= offset + value.length &&
    [...value].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
  if (marker(4, 'ftyp')) return 'audio/mp4';
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'audio/webm';
  if (marker(0, 'RIFF') && marker(8, 'WAVE')) return 'audio/wav';
  if (marker(0, 'ID3') || (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (marker(0, 'OggS')) return 'audio/ogg';
  return undefined;
}

export async function POST(request: Request) {
  try {
    if (!request.headers.get('content-type')?.includes('multipart/form-data')) {
      throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send an audio recording.');
    }
    // The server uses Web FormData; React Native's global type lacks get().
    const form = await request.formData() as unknown as { get(name: string): unknown };
    const audio = form.get('audio');
    if (!recordingPart(audio)) throw new ApiError(400, 'INVALID_AUDIO', 'No audio recording was received. Please record again.');
    if (audio.size === 0) throw new ApiError(400, 'EMPTY_AUDIO', 'The recording was empty. Please record again.');
    if (audio.size > 10_000_000) throw new ApiError(413, 'AUDIO_TOO_LARGE', 'Record a shorter question.');
    const name = typeof audio.name === 'string' ? audio.name : '';
    const extension = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
    const declaredType = typeof audio.type === 'string' ? audio.type.toLowerCase().split(';')[0] : '';
    const bytes = new Uint8Array(await audio.arrayBuffer());
    const type = detectedAudioType(bytes) ?? (audioTypes.has(declaredType) ? declaredType : audioExtensions[extension]);
    if (!type) throw new ApiError(400, 'INVALID_AUDIO', 'This recording format is not supported. Please record again.');
    // Multipart parsers may provide a Blob or a generic MIME type for native recordings.
    // Normalize it to a real File before forwarding to the transcription provider.
    const filename = audioExtensions[extension] === type ? name : `recording.${extensionForType[type]}`;
    const normalized = new File([bytes], filename, { type });
    return privateJson(transcriptionSchema.parse(await transcribeAudio(normalized)));
  } catch (error) { return errorResponse(error); }
}
