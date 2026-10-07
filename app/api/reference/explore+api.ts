import { ApiError, jsonRoute } from '@/lib/api/server';
import { sealAnswer, verifyEvidence } from '@/lib/server/evidence';
import { explore } from '@/lib/orchestration/context';
import { getProviders } from '@/lib/providers';
import { answerSchema, referenceRequestSchema } from '@/schemas/context';

export const POST = jsonRoute(referenceRequestSchema, answerSchema, async (input) => {
  const providers = getProviders();
  await verifyEvidence(input);
  if (!input.scene.culturalEvidence.entities.some((entity) => entity.qlooId === input.entityId && (entity.matchConfidence ?? 0) >= 0.75)) {
    throw new ApiError(422, 'UNCONFIRMED_REFERENCE', 'That reference has not been confidently identified yet.');
  }
  return sealAnswer(await explore({ question: `${input.question}\nRequested Qloo reference: ${input.entityId}`, scene: input.scene, profile: input.profile, tasteContext: input.tasteContext, strategy: input.strategy, mode: 'reference', messages: [] }, providers));
});
