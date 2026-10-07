import { jsonRoute } from '@/lib/api/server';
import { analyzeScene } from '@/lib/orchestration/context';
import { getProviders } from '@/lib/providers';
import { analyzeRequestSchema, sceneSchema } from '@/schemas/context';

export const POST = jsonRoute(analyzeRequestSchema, sceneSchema, (input) => analyzeScene(input, getProviders()));
