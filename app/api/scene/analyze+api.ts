import { ApiError, jsonRoute } from '@/lib/api/server';
import { sealDocument, sealScene, verifyDocument } from '@/lib/server/evidence';
import { analyzeScene } from '@/lib/orchestration/context';
import { getProviders } from '@/lib/providers';
import { analyzeRequestSchema, sceneSchema } from '@/schemas/context';
import { MAX_SCENE_REQUEST_LENGTH } from '@/lib/image-limits';

export const POST = jsonRoute(analyzeRequestSchema, sceneSchema, async (input) => {
  if (!input.profile?.entities.length) throw new ApiError(403, 'PROFILE_REQUIRED', 'Set up at least one matched interest in My Interests before capturing a scene.');
  await verifyDocument(input.profile, 'taste-profile');
  if (input.resolutionCache) await verifyDocument(input.resolutionCache, 'shelf-resolution-cache');
  const scene = await analyzeScene(input, getProviders());
  return sealScene({ ...scene, resolutionCache: scene.resolutionCache ? await sealDocument(scene.resolutionCache, 'shelf-resolution-cache') : undefined });
}, MAX_SCENE_REQUEST_LENGTH);
