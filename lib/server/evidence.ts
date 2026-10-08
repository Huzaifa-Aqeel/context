import { ApiError } from '@/lib/api/server';
import type { Answer, AskRequest, Scene } from '@/types/context';

// Stateless authentication: submitted provider evidence must be issued by this server.
// Key rotation invalidates old sessions. No database or retained scene is required.
async function signingKey() {
  const secret = process.env.SESSION_SIGNING_KEY?.trim() || process.env.GROQ_API_KEY?.trim() || process.env.LLM_API_KEY?.trim();
  if (!secret) throw new ApiError(503, 'PROVIDERS_NOT_CONFIGURED', 'Analysis is not configured. Please try again later.');
  return crypto.subtle.importKey('raw', new TextEncoder().encode(`context-evidence-v1:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
function payload(value: { signature?: string }, kind: string) {
  const { signature: _signature, ...data } = value;
  return new TextEncoder().encode(`${kind}:${canonical(data)}`);
}
export async function sealDocument<T extends { signature?: string }>(value: T, kind: string): Promise<T> {
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(), payload(value, kind)));
  return { ...value, signature: Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('') };
}
export async function verifyDocument(value: { signature?: string }, kind: string) {
  if (!value.signature || !/^[a-f0-9]{64}$/.test(value.signature)) throw new ApiError(400, 'INVALID_CONTEXT', 'This exploration context has expired. Capture a new scene or explore the area again.');
  const bytes = Uint8Array.from(value.signature.match(/../g)!, (byte) => parseInt(byte, 16));
  if (!await crypto.subtle.verify('HMAC', await signingKey(), bytes, payload(value, kind))) throw new ApiError(400, 'INVALID_CONTEXT', 'This exploration context has changed. Capture a new scene or explore the area again.');
}
export async function verifyEvidence(request: Pick<AskRequest, 'scene' | 'locationContext' | 'profile' | 'tasteContext'>) {
  if (request.scene) await verifyDocument(request.scene, 'scene');
  if (request.locationContext) await verifyDocument(request.locationContext, 'locality');
  if (request.profile) await verifyDocument(request.profile, 'taste-profile');
  if (request.tasteContext) {
    await verifyDocument(request.tasteContext, 'taste-context');
    if (request.tasteContext.profileSignature !== request.profile?.signature) throw new ApiError(400, 'INVALID_TASTE_CONTEXT', 'Your interests changed. Refresh the interest connections.');
  }
}
export const sealScene = (scene: Scene) => sealDocument(scene, 'scene');
export async function sealAnswer(answer: Answer): Promise<Answer> {
  const locationContext = answer.locationContext ? await sealDocument(answer.locationContext, 'locality') : undefined;
  const scene = answer.scene ? await sealScene({ ...answer.scene, locationContext }) : undefined;
  const tasteContext = answer.tasteContext ? await sealDocument(answer.tasteContext, 'taste-context') : undefined;
  return { ...answer, locationContext, scene, tasteContext };
}
