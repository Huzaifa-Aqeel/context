import { ApiError } from '@/lib/api/server';

/** Groq streams WAV with unknown RIFF/data sizes (0xffffffff). Fix them for local playback. */
export function normalizeSpeechWav(bytes: ArrayBuffer): ArrayBuffer {
  const invalid = () => { throw new ApiError(502, 'INVALID_SPEECH_RESPONSE', 'Spoken output could not be generated. The written response is still available.'); };
  if (bytes.byteLength <= 44 || bytes.byteLength > 4_000_000) return invalid();
  const view = new DataView(bytes);
  const text = (offset: number) => String.fromCharCode(...new Uint8Array(bytes, offset, 4));
  if (text(0) !== 'RIFF' || text(8) !== 'WAVE') return invalid();
  let formatFound = false;
  let dataFound = false;
  for (let offset = 12; offset + 8 <= bytes.byteLength;) {
    const name = text(offset);
    const size = view.getUint32(offset + 4, true);
    if (name === 'data') {
      const actual = size === 0xffffffff ? bytes.byteLength - offset - 8 : size;
      if (!formatFound || !actual || offset + 8 + actual > bytes.byteLength) return invalid();
      view.setUint32(offset + 4, actual, true); dataFound = true; break;
    }
    if (offset + 8 + size > bytes.byteLength) return invalid();
    if (name === 'fmt ') { if (size < 16) return invalid(); formatFound = true; }
    offset += 8 + size + (size % 2);
  }
  if (!dataFound) return invalid();
  view.setUint32(4, bytes.byteLength - 8, true);
  return bytes;
}
