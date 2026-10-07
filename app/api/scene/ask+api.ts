import { jsonRoute } from '@/lib/api/server';
import { sealAnswer, verifyEvidence } from '@/lib/server/evidence';
import { explore } from '@/lib/orchestration/context';
import { getProviders } from '@/lib/providers';
import { answerSchema, askRequestSchema } from '@/schemas/context';

export const POST = jsonRoute(askRequestSchema, answerSchema, async (input) => {
  const providers = getProviders();
  await verifyEvidence(input);
  return sealAnswer(await explore(input, providers));
});
