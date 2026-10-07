import { jsonRoute } from '@/lib/api/server';
import { explore } from '@/lib/orchestration/context';
import { getProviders } from '@/lib/providers';
import { answerSchema, locationRequestSchema } from '@/schemas/context';

export const POST = jsonRoute(locationRequestSchema, answerSchema, (input) => explore({ ...input, mode: 'location', messages: [] }, getProviders()));
