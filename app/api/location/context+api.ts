import { jsonRoute } from '@/lib/api/server';
import { sealAnswer, verifyEvidence } from '@/lib/server/evidence';
import { explore } from '@/lib/orchestration/context';
import { getProviders } from '@/lib/providers';
import { answerSchema, locationRequestSchema } from '@/schemas/context';

export const POST = jsonRoute(locationRequestSchema, answerSchema, async (input) => {
  const providers = getProviders();
  await verifyEvidence(input);
  return sealAnswer(await explore({ ...input, mode: 'location' }, providers));
});
