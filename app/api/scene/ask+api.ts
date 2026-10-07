import { jsonRoute } from '@/lib/api/server';
import { explore } from '@/lib/orchestration/context';
import { getProviders } from '@/lib/providers';
import { answerSchema, askRequestSchema } from '@/schemas/context';

export const POST = jsonRoute(askRequestSchema, answerSchema, (input) => explore(input, getProviders()));
