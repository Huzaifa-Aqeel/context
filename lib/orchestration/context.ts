import { ApiError } from '@/lib/api/server';
import { agentTurnSchema } from '@/lib/llm/service';
import type { LlmService } from '@/lib/llm/service';
import type { QlooService } from '@/lib/qloo/service';
import type { VisionService } from '@/lib/vision/service';
import { contextInstructions } from '@/prompts/context';
import { evidenceSchema, locationContextSchema, resolvedEntitySchema, visionEntitySchema } from '@/schemas/context';
import type { Answer, AskRequest, CulturalEvidence, Locality, Scene } from '@/types/context';
import type { UserMode } from '@/lib/modes';

export type Providers = { vision: VisionService; qloo: QlooService; llm: LlmService };
const emptyEvidence = (): CulturalEvidence => ({ entities: [], relationships: [], themes: [], confidence: 0 });
const isConfirmed = (entity: CulturalEvidence['entities'][number]) => Boolean(entity.qlooId && (entity.matchConfidence ?? 0) >= 0.75);

export async function explore(request: AskRequest, providers: Providers): Promise<Answer> {
  let evidence = request.scene?.culturalEvidence ?? emptyEvidence();
  let locationContext = request.scene?.locationContext;
  const completedActions: string[] = [];
  // Bounded native tool loop; no fixed sequence of unnecessary lookups for follow-ups.
  for (let step = 0; step <= 4; step++) {
    const turn = agentTurnSchema.parse(await providers.llm.nextTurn({
      instructions: contextInstructions, request, evidence, locationContext,
      completedActions, allowInvestigation: step < 4,
    }));
    if (turn.kind === 'answer') {
      return {
        answer: turn.result.answer,
        confidence: turn.result.confidence,
        scene: request.scene ? { ...request.scene, culturalEvidence: evidence, locationContext } : undefined,
      };
    }
    const key = JSON.stringify(turn.action);
    if (step === 4 || completedActions.includes(key)) {
      throw new ApiError(422, 'INVESTIGATION_LIMIT', 'I could not find enough additional evidence. Try a more specific question.');
    }
    switch (turn.action.tool) {
      case 'exploreReference': {
        const entityId = turn.action.entityId;
        if (!evidence.entities.some((entity) => entity.qlooId === entityId && isConfirmed(entity))) {
          throw new ApiError(422, 'UNCONFIRMED_REFERENCE', 'That reference has not been confidently identified yet.');
        }
        const reference = evidenceSchema.parse(await providers.qloo.exploreReference(entityId));
        evidence = { ...reference, entities: evidence.entities };
        break;
      }
      case 'analyzeConnections':
        evidence = evidenceSchema.parse(await providers.qloo.analyzeConnections(evidence.entities.filter(isConfirmed), request.locality ?? locationContext?.locality));
        break;
      case 'getLocationContext': {
        const locality = request.locality ?? locationContext?.locality;
        if (!locality) throw new ApiError(422, 'LOCALITY_UNAVAILABLE', 'Tell me an area name to explore local context.');
        locationContext = locationContextSchema.parse(await providers.qloo.getLocationContext(locality));
        break;
      }
    }
    completedActions.push(key);
  }
  throw new ApiError(422, 'INVESTIGATION_LIMIT', 'Try a more specific question.');
}

export async function analyzeScene(input: { image: string; locality?: Locality; mode: UserMode }, providers: Providers): Promise<Scene> {
  const detected = visionEntitySchema.array().max(100).parse(await providers.vision.inspectScene(input.image));
  const meaningful = detected.filter((entity) => entity.culturallyRelevant && entity.confidence >= 0.5).slice(0, 30);
  const entities = resolvedEntitySchema.array().max(30).parse(await providers.qloo.resolveEntities(meaningful));
  const confirmed = entities.filter(isConfirmed);
  const connections = confirmed.length > 1
    ? evidenceSchema.parse(await providers.qloo.analyzeConnections(confirmed, input.locality))
    : emptyEvidence();
  const locationContext = input.locality
    ? locationContextSchema.parse(await providers.qloo.getLocationContext(input.locality))
    : undefined;
  const scene: Scene = {
    id: crypto.randomUUID(), createdAt: new Date().toISOString(),
    summary: 'There is not enough cultural evidence yet.', confidence: 'low',
    culturalEvidence: { ...connections, entities }, locationContext,
  };
  const result = await explore({
    question: 'What cultural context am I missing?', scene,
    locality: input.locality, messages: [], mode: input.mode,
  }, providers);
  return { ...(result.scene ?? scene), summary: result.answer, confidence: result.confidence };
}
