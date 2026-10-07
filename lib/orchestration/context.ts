import { isConfirmed } from '@/lib/qloo/confirmed';
import { investigateTaste, tasteReferences } from '@/lib/taste/context';
import { ApiError } from '@/lib/api/server';
import { agentTurnSchema } from '@/lib/llm/service';
import type { LlmService } from '@/lib/llm/service';
import type { QlooService } from '@/lib/qloo/service';
import type { VisionService } from '@/lib/vision/service';
import { contextInstructions } from '@/prompts/context';
import { evidenceSchema, locationContextSchema, resolvedEntitySchema, visionEntitySchema } from '@/schemas/context';
import type { Answer, AskRequest, CulturalEvidence, Locality, Scene } from '@/types/context';
import { modes, type UserMode } from '@/lib/modes';

export type Providers = { vision: VisionService; qloo: QlooService; llm: LlmService };
const emptyEvidence = (): CulturalEvidence => ({ entities: [], relationships: [], themes: [], confidence: 0 });
export { isConfirmed } from '@/lib/qloo/confirmed';
const normalize = (text: string) => text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const sameLocality = (a?: Locality, b?: Locality) => JSON.stringify(a) === JSON.stringify(b);

export function mergeEvidence(previous: CulturalEvidence, incoming: CulturalEvidence): CulturalEvidence {
  const entities = new Map(incoming.entities.map((entity) => [entity.qlooId ?? entity.detectedName, entity]));
  // Keep original visual provenance when a recommendation repeats a visible reference.
  previous.entities.forEach((entity) => entities.set(entity.qlooId ?? entity.detectedName, entity));
  return {
    entities: [...entities.values()].slice(0, 30),
    relationships: [...new Map([...previous.relationships, ...incoming.relationships].map((relationship) => [`${relationship.source}:${relationship.target}:${relationship.kind}`, relationship])).values()].slice(0, 100),
    facts: [...new Map([...(previous.facts ?? []), ...(incoming.facts ?? [])].map((fact) => [fact.entityId, fact])).values()].slice(0, 30),
    themes: [...new Set([...previous.themes, ...incoming.themes])].slice(0, 20),
    confidence: Math.max(previous.confidence, incoming.confidence),
  };
}

export async function explore(request: AskRequest, providers: Providers): Promise<Answer> {
  let evidence = request.scene?.culturalEvidence ?? emptyEvidence();
  let locationContext = request.locationContext ?? request.scene?.locationContext;
  if (request.locality && locationContext && !sameLocality(request.locality, locationContext.locality)) locationContext = undefined;
  let tasteContext = request.profile ? request.tasteContext : undefined;
  const warnings = [...(request.scene?.warnings ?? [])];
  const completedActions: string[] = [];
  async function lookupLocation() {
    const locality = request.locality ?? locationContext?.locality;
    if (!locality) throw new ApiError(422, 'LOCALITY_UNAVAILABLE', 'Tell me an area name to explore local context.');
    locationContext = locationContextSchema.parse(await providers.qloo.getLocationContext(locality));
    completedActions.push(JSON.stringify({ tool: 'getLocationContext' }));
  }
  // Location-only requests always obtain evidence; follow-ups reuse it.
  if (request.mode === 'location' && !locationContext) await lookupLocation();
  const references = tasteReferences(request.scene, locationContext);
  if (tasteContext && JSON.stringify(tasteContext.referenceIds) !== JSON.stringify(references.map((entity) => entity.id).sort())) tasteContext = undefined;
  if (request.profile && !tasteContext && (request.strategy === 'familiar' || request.strategy === 'discover' || /interests|familiar|stand out|things I know|something I.*know/i.test(request.question))) {
    tasteContext = await investigateTaste(request.profile, references, providers.qloo);
    completedActions.push(JSON.stringify({ tool: 'analyzeTaste' }));
  }
  for (let step = 0; step <= 4; step++) {
    const turn = agentTurnSchema.parse(await providers.llm.nextTurn({
      instructions: contextInstructions, request, evidence, locationContext,
      completedActions, warnings, tasteContext, allowInvestigation: step < 4,
    }));
    if (turn.kind === 'answer') {
      const usedTasteConnections = turn.result.usedTasteConnections ?? [];
      if (usedTasteConnections.some((used) => !request.profile || !tasteContext?.connections.some((connection) => connection.referenceId === used.referenceId && connection.interestId === used.interestId))) {
        throw new ApiError(502, 'UNSUPPORTED_TASTE_BRIDGE', 'The familiar comparison could not be verified with Qloo evidence. Try asking about the reference directly.');
      }
      const hasEvidence = Boolean(evidence.facts?.length || evidence.relationships.length || locationContext?.facts?.length);
      const confidence = hasEvidence ? turn.result.confidence : 'low';
      const allWarnings = [...new Set([...warnings, ...(locationContext?.warnings ?? []), ...(tasteContext?.warnings ?? [])])].slice(0, 10);
      return {
        answer: turn.result.answer, confidence, locationContext, tasteContext, usedTasteConnections, warnings: allWarnings,
        scene: request.scene ? { ...request.scene, culturalEvidence: evidence, locationContext, warnings: allWarnings } : undefined,
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
        evidence = mergeEvidence(evidence, evidenceSchema.parse(await providers.qloo.exploreReference(entityId)));
        break;
      }
      case 'analyzeTaste':
        if (!request.profile) throw new ApiError(422, 'TASTE_DISABLED', 'Personalization is not enabled. You can still explore the environment.');
        tasteContext = await investigateTaste(request.profile, tasteReferences(request.scene ? { ...request.scene, culturalEvidence: evidence } : undefined, locationContext), providers.qloo);
        break;
      case 'analyzeConnections':
        evidence = mergeEvidence(evidence, evidenceSchema.parse(await providers.qloo.analyzeConnections(evidence.entities.filter(isConfirmed))));
        break;
      case 'getLocationContext':
        await lookupLocation();
        continue;
      case 'resolveEntity': {
        const { name, category } = turn.action;
        const normalizedName = normalize(name);
        const explicitlyNamed = [request.question, ...request.messages.filter((message) => message.role === 'user').map((message) => message.content)]
          .some((text) => ` ${normalize(text)} `.includes(` ${normalizedName} `));
        const detected = evidence.entities.find((entity) => normalize(entity.detectedName) === normalizedName && entity.source !== 'qloo');
        if (!explicitlyNamed && !detected) throw new ApiError(422, 'UNSUPPORTED_REFERENCE', 'Name the reference you want to investigate.');
        const resolved = resolvedEntitySchema.array().parse(await providers.qloo.resolveEntities([{ label: name, category, confidence: detected?.visionConfidence ?? 1, culturallyRelevant: true }]));
        const confirmed = resolved.map((entity) => ({ ...entity, source: explicitlyNamed ? 'user' as const : entity.source }));
        evidence = { ...evidence, entities: [...evidence.entities.filter((entity) => normalize(entity.detectedName) !== normalizedName), ...confirmed].slice(0, 30) };
        if (confirmed.some(isConfirmed)) evidence = mergeEvidence(evidence, evidenceSchema.parse(await providers.qloo.analyzeConnections(confirmed.filter(isConfirmed))));
        else warnings.push(`The reference “${name}” could not be matched uniquely. Clarify its exact name and type.`);
        break;
      }
    }
    completedActions.push(key);
  }
  throw new ApiError(422, 'INVESTIGATION_LIMIT', 'Try a more specific question.');
}

export async function analyzeScene(input: { image: string; locality?: Locality; mode: UserMode }, providers: Providers): Promise<Scene> {
  const detected = visionEntitySchema.array().max(100).parse(await providers.vision.inspectScene(input.image));
  const meaningful = detected.filter((entity) => entity.culturallyRelevant && entity.confidence >= 0.5).slice(0, 8);
  const entities = meaningful.length ? resolvedEntitySchema.array().max(30).parse(await providers.qloo.resolveEntities(meaningful)) : [];
  const confirmed = entities.filter(isConfirmed);
  const connections = confirmed.length ? evidenceSchema.parse(await providers.qloo.analyzeConnections(confirmed)) : emptyEvidence();
  const locationContext = input.locality ? locationContextSchema.parse(await providers.qloo.getLocationContext(input.locality)) : undefined;
  const scene: Scene = {
    id: crypto.randomUUID(), createdAt: new Date().toISOString(),
    summary: 'There is not enough cultural evidence yet.', confidence: 'low',
    culturalEvidence: { ...connections, entities }, locationContext,
  };
  if (!confirmed.length && !locationContext?.facts?.length) return {
    ...scene, summary: entities.length ? 'I could not confidently match the visible references to cultural records. Tell me a reference’s exact name and type, or try a closer image.' : 'I could not identify distinctive cultural references in this image. Try a readable poster, book title, brand, or landmark, or explore an area by name.',
    warnings: locationContext?.warnings,
  };
  const result = await explore({
    question: modes.find((mode) => mode.id === input.mode)!.question, scene,
    locality: input.locality, messages: [], mode: input.mode,
  }, providers);
  return { ...(result.scene ?? scene), summary: result.answer, confidence: result.confidence };
}
