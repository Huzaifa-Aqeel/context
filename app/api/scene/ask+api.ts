import { ApiError, jsonRoute } from '@/lib/api/server';
import { sealAnswer, verifyEvidence } from '@/lib/server/evidence';
import { explore } from '@/lib/orchestration/context';
import { getProviders } from '@/lib/providers';
import { answerSchema, askRequestSchema } from '@/schemas/context';

export const POST = jsonRoute(askRequestSchema, answerSchema, async (input) => {
  if (!input.profile?.entities.length) throw new ApiError(403, 'PROFILE_REQUIRED', 'Set up at least one matched interest in My Interests before asking Context.');
  await verifyEvidence(input);
  const providers = getProviders();
  return sealAnswer(await explore(input, providers));
});
