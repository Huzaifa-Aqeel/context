import { jsonRoute } from '@/lib/api/server';
import { sealScene } from '@/lib/server/evidence';
import { analyzeScene } from '@/lib/orchestration/context';
import { getProviders } from '@/lib/providers';
import { analyzeRequestSchema, sceneSchema } from '@/schemas/context';
import { MAX_SCENE_REQUEST_LENGTH } from '@/lib/image-limits';

export const POST = jsonRoute(analyzeRequestSchema, sceneSchema, async (input) => sealScene(await analyzeScene(input, getProviders())), MAX_SCENE_REQUEST_LENGTH);
