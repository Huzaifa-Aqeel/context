import { isConfirmed } from '@/lib/qloo/confirmed';
import { investigateTaste, tasteReferences } from '@/lib/taste/context';
import { renderGroundedAnswer } from './grounding';
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
const conversationScene = (): Scene => ({ origin: 'conversation', id: crypto.randomUUID(), createdAt: new Date().toISOString(), summary: 'A conversation with Context.', confidence: 'low', culturalEvidence: emptyEvidence() });
export { isConfirmed } from '@/lib/qloo/confirmed';
const normalize = (text: string) => text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const sameLocality = (a?: Locality, b?: Locality) => JSON.stringify(a) === JSON.stringify(b);

export function mergeEvidence(previous: CulturalEvidence, incoming: CulturalEvidence): CulturalEvidence {
  const entities = new Map(previous.entities.map((entity) => [entity.qlooId ?? entity.detectedName, entity]));
  // Retained visual references take precedence over the bounded related-reference list.
  incoming.entities.forEach((entity) => { const key = entity.qlooId ?? entity.detectedName; if (!entities.has(key) && entities.size < 30) entities.set(key, entity); });
  return {
    entities: [...entities.values()].slice(0, 30),
    relationships: [...new Map([...previous.relationships, ...incoming.relationships].map((relationship) => [`${relationship.source}:${relationship.target}:${relationship.kind}`, relationship])).values()].slice(0, 100),
    facts: [...new Map([...(previous.facts ?? []), ...(incoming.facts ?? [])].filter((fact) => entities.has(fact.entityId)).map((fact) => [fact.entityId, fact])).values()].slice(0, 30),
    themes: [...new Set([...previous.themes, ...incoming.themes])].slice(0, 20),
    confidence: Math.max(previous.confidence, incoming.confidence),
  };
}

export async function explore(request: AskRequest, providers: Providers): Promise<Answer> {
  if (request.useLocality === false) request = { ...request, locality: undefined, locationContext: undefined, scene: request.scene ? { ...request.scene, locationContext: undefined } : undefined };
  if (!request.scene && !request.locality && !request.locationContext) request = { ...request, scene: conversationScene() };
  let evidence = request.scene?.culturalEvidence ?? emptyEvidence();
  let locationContext = request.locationContext ?? request.scene?.locationContext;
  if (request.locality && locationContext && !sameLocality(request.locality, locationContext.locality)) locationContext = undefined;
  let tasteContext = request.profile ? request.tasteContext : undefined;
  const warnings = [...(request.scene?.warnings ?? [])];
  const completedActions: string[] = [];
  const currentScene = () => request.scene ? { ...request.scene, culturalEvidence: evidence, locationContext } : undefined;
  function refreshTaste() {
    const references = tasteReferences(currentScene(), locationContext, request.locality).map((entity) => entity.id).sort();
    if (tasteContext && (tasteContext.profileSignature !== request.profile?.signature || JSON.stringify(tasteContext.referenceIds) !== JSON.stringify(references))) {
      tasteContext = undefined;
      const previous = completedActions.indexOf(JSON.stringify({ tool: 'analyzeTaste' }));
      if (previous >= 0) completedActions.splice(previous, 1);
    }
  }
  async function lookupLocation() {
    const locality = request.locality ?? locationContext?.locality;
    if (!locality) throw new ApiError(422, 'LOCALITY_UNAVAILABLE', 'Enable location context to explore your area.');
    try { locationContext = locationContextSchema.parse(await providers.qloo.getLocationContext(locality)); }
    catch { locationContext = { locality, culturalThemes: [], relatedEntities: [], facts: [], confidence: 'low', warnings: ['Local cultural evidence is unavailable right now. I can still explore available scene references.'] }; }
    completedActions.push(JSON.stringify({ tool: 'getLocationContext' }));
  }
  // The area endpoint obtains evidence; unified conversation investigates locality only as needed.
  if (request.mode === 'location' && !locationContext) await lookupLocation();
  const references = tasteReferences(request.scene, locationContext, request.locality);
  if (tasteContext && JSON.stringify(tasteContext.referenceIds) !== JSON.stringify(references.map((entity) => entity.id).sort())) tasteContext = undefined;
  if (request.profile && !tasteContext && (request.strategy === 'familiar' || request.strategy === 'discover' || /interests|familiar|stand out|things I know|something I.*know/i.test(request.question))) {
    tasteContext = await investigateTaste(request.profile, references, providers.qloo);
    completedActions.push(JSON.stringify({ tool: 'analyzeTaste' }));
  }
  for (let step = 0; step <= 4; step++) {
    refreshTaste();
    const turn = agentTurnSchema.parse(await providers.llm.nextTurn({
      instructions: contextInstructions, request, evidence, locationContext,
      completedActions, warnings, tasteContext, allowInvestigation: step < 4,
    }));
    if (turn.kind === 'answer') {
      const cited = turn.result.usedTasteConnections ?? [];
      if (cited.some((used) => !request.profile || !tasteContext?.connections.some((connection) => connection.referenceId === used.referenceId && connection.interestId === used.interestId))) {
        throw new ApiError(502, 'UNSUPPORTED_TASTE_BRIDGE', 'The familiar comparison could not be verified with Qloo evidence. Try asking about the reference directly.');
      }
      const hasEvidence = Boolean(evidence.facts?.length || evidence.relationships.length || locationContext?.facts?.length);
      const grounded = renderGroundedAnswer(request, evidence, locationContext, tasteContext, turn.result.evidenceSelections ?? (cited.length ? cited.map((used) => ({ kind: 'taste' as const, ...used })) : undefined));
      const confidence = !hasEvidence || grounded.limited ? 'low' : turn.result.confidence;
      const allWarnings = [...new Set([...warnings, ...(locationContext?.warnings ?? []), ...(tasteContext?.warnings ?? [])])].slice(0, 10);
      return {
        answer: grounded.answer, confidence, locationContext, tasteContext, usedTasteConnections: grounded.usedTasteConnections, warnings: allWarnings,
        scene: request.scene ? { ...request.scene, ...(request.scene.origin === 'conversation' ? { summary: grounded.answer, confidence } : {}), culturalEvidence: evidence, locationContext, warnings: allWarnings } : undefined,
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
        tasteContext = await investigateTaste(request.profile, tasteReferences(request.scene ? { ...request.scene, culturalEvidence: evidence } : undefined, locationContext, request.locality), providers.qloo);
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
        if (!request.scene) request = { ...request, scene: conversationScene() };
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

export async function analyzeScene(input: { image: string; locality?: Locality; mode: UserMode; question?: string }, providers: Providers): Promise<Scene> {
  const detected = visionEntitySchema.array().max(100).parse(await providers.vision.inspectScene(input.image));
  const meaningful = detected.filter((entity) => entity.culturallyRelevant).slice(0, 30);
  const environmentalObservations = detected.filter((entity) => !entity.culturallyRelevant).sort((a, b) => Number(Boolean(b.necessaryInformation)) - Number(Boolean(a.necessaryInformation))).slice(0, 5).map(({ label, confidence, position, necessaryInformation }) => ({ label, confidence, position, necessaryInformation }));
  const shortlist = meaningful.filter((entity) => entity.confidence >= 0.5).sort((a, b) => Number((input.question ?? '').toLowerCase().includes(b.label.toLowerCase())) - Number((input.question ?? '').toLowerCase().includes(a.label.toLowerCase())) || b.confidence - a.confidence).slice(0, 8);
  const resolved = shortlist.length ? resolvedEntitySchema.array().max(30).parse(await providers.qloo.resolveEntities(shortlist)) : [];
  const entities = meaningful.map((entity) => resolved.find((item) => normalize(item.detectedName) === normalize(entity.label)) ?? { detectedName: entity.label, detectedCategory: entity.category, visionConfidence: entity.confidence, source: 'vision' as const, resolutionPending: true, ...(entity.position ? { position: entity.position } : {}) });
  const confirmed = entities.filter(isConfirmed);
  const connections = confirmed.length ? evidenceSchema.parse(await providers.qloo.analyzeConnections(confirmed)) : emptyEvidence();
  let locationContext;
  if (input.locality) {
    try { locationContext = locationContextSchema.parse(await providers.qloo.getLocationContext(input.locality)); }
    catch { locationContext = { locality: input.locality, culturalThemes: [], relatedEntities: [], facts: [], confidence: 'low' as const, warnings: ['Local cultural evidence is unavailable right now. Scene exploration can continue.'] }; }
  }
  const scene: Scene = {
    origin: 'image',
    id: crypto.randomUUID(), createdAt: new Date().toISOString(),
    summary: 'There is not enough cultural evidence yet.', confidence: 'low',
    culturalEvidence: { ...connections, entities }, locationContext,
    environmentalObservations,
    warnings: [...(meaningful.length > shortlist.length ? ['I found more possible references than I could check right now. Ask about a specific one to explore it.'] : []), ...(locationContext?.warnings ?? [])],
  };
  if (!confirmed.length && !locationContext?.facts?.length) return {
    ...scene, summary: `${environmentalObservations.filter((item) => item.confidence >= 0.7).length ? `The image appears to contain ${environmentalObservations.filter((item) => item.confidence >= 0.7).map((item) => item.label).join(', ')}. ` : ''}${entities.length ? 'I could not confidently identify the cultural references in this image. Tell me the name of something you noticed, or try a closer image.' : 'I could not identify distinctive cultural references in this image. Try a readable poster, book title, brand, or landmark.'}`,
    warnings: [...new Set([...(scene.warnings ?? []), ...(locationContext?.warnings ?? [])])],
  };
  const result = await explore({
    question: input.question || modes.find((mode) => mode.id === input.mode)!.question, scene,
    locality: input.locality, messages: [], mode: input.mode,
  }, providers);
  return { ...(result.scene ?? scene), summary: result.answer, confidence: result.confidence };
}
