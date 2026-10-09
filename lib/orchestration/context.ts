import { isConfirmed } from '@/lib/qloo/confirmed';
import { investigateTaste, tasteReferences } from '@/lib/taste/context';
import { renderGroundedAnswer } from './grounding';
import { ApiError } from '@/lib/api/server';
import { agentTurnSchema } from '@/lib/llm/service';
import type { LlmService } from '@/lib/llm/service';
import type { QlooService } from '@/lib/qloo/service';
import type { VisionService } from '@/lib/vision/service';
import type { VisionFrame } from '@/lib/vision/service';
import type { ResearchService } from '@/lib/research/tavily';
import type { PlacesService } from '@/lib/places/geoapify';
import { contextInstructions } from '@/prompts/context';
import { evidenceSchema, locationContextSchema, resolvedEntitySchema, visionEntitySchema } from '@/schemas/context';
import type { Answer, AskRequest, CulturalEvidence, Locality, Scene } from '@/types/context';
import type { TasteProfile } from '@/types/taste';
import type { ShelfResolutionEntry } from '@/lib/qloo/display-resolution-cache';
import { modes, type UserMode } from '@/lib/modes';
import { asksAboutArea, asksAboutTaste, asksForConnections, asksForDiningDiscovery, asksForAreaDiscovery, asksForPracticalLookup, asksForRecommendations, namedInQuestion, visibleReferences } from './intent';
import { questionNamesEntity, visualLead, visualName } from './visual';
import { analyzeShelf } from './display';
import { exploreShelf } from './display-ask';
import { displayKindForScene } from '@/lib/display/categories';
import { analyzeEvent } from './event';
import { exploreDining } from './dining';
import { exploreEvent } from './event-ask';
import type { SceneReasoningService } from '@/lib/llm/scene-decision';
import { exploreActiveScene } from './scene-ask';

export type Providers = { vision: VisionService; qloo: QlooService; llm: LlmService; displayLlm?: LlmService; shelfLlm?: LlmService; sceneReasoner?: SceneReasoningService; research?: ResearchService; places?: PlacesService };
const emptyEvidence = (): CulturalEvidence => ({ entities: [], relationships: [], themes: [], confidence: 0 });
const conversationScene = (): Scene => ({ origin: 'conversation', id: crypto.randomUUID(), createdAt: new Date().toISOString(), summary: 'A conversation with Context.', confidence: 'low', culturalEvidence: emptyEvidence() });
export { isConfirmed } from '@/lib/qloo/confirmed';
const normalize = (text: string) => text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const sameLocality = (a?: Locality, b?: Locality) => JSON.stringify(a) === JSON.stringify(b);
const pairKey = (entities: { qlooId?: string }[]) => entities.length === 2 && entities.every((entity) => entity.qlooId) ? entities.map((entity) => entity.qlooId!).sort().join(':') : undefined;

export function mergeEvidence(previous: CulturalEvidence, incoming: CulturalEvidence): CulturalEvidence {
  const entities = new Map(previous.entities.map((entity) => [entity.qlooId ?? entity.detectedName, entity]));
  // Retained visual references take precedence over the bounded related-reference list.
  incoming.entities.forEach((entity) => { const key = entity.qlooId ?? entity.detectedName; if (!entities.has(key) && entities.size < 30) entities.set(key, entity); });
  return {
    entities: [...entities.values()].slice(0, 30),
    relationships: [...new Map([...previous.relationships, ...incoming.relationships].map((relationship) => [`${relationship.source}:${relationship.target}:${relationship.kind}`, relationship])).values()].slice(0, 100),
    facts: [...new Map([...(previous.facts ?? []), ...(incoming.facts ?? [])].filter((fact) => entities.has(fact.entityId)).map((fact) => [fact.entityId, fact])).values()].slice(0, 30),
    investigatedPairs: [...new Set([...(previous.investigatedPairs ?? []), ...(incoming.investigatedPairs ?? [])])].slice(0, 30),
    themes: [...new Set([...previous.themes, ...incoming.themes])].slice(0, 20),
    confidence: Math.max(previous.confidence, incoming.confidence),
  };
}

export async function explore(request: AskRequest, providers: Providers): Promise<Answer> {
  if (request.useLocality === false) request = { ...request, locality: undefined, locationContext: undefined, scene: request.scene ? { ...request.scene, locationContext: undefined } : undefined };
  if (request.scene?.shelf) return exploreShelf(request, providers.displayLlm ?? providers.shelfLlm ?? providers.llm, providers.qloo, providers.research);
  if ((request.scene?.event || request.scene?.dining || request.scene?.area
    || asksForDiningDiscovery(request.question) || asksForAreaDiscovery(request.question)
    || asksForPracticalLookup(request.question)) && providers.sceneReasoner)
    return exploreActiveScene({ ...request, scene: request.scene ?? conversationScene() },
      { qloo: providers.qloo, reasoner: providers.sceneReasoner, research: providers.research, places: providers.places });
  if (asksForDiningDiscovery(request.question) || request.scene?.dining) return exploreDining(request, providers.qloo, providers.places);
  if (request.scene?.event) return exploreEvent(request, providers.qloo, providers.research, providers.places);
  if (!request.scene && !request.locality && !request.locationContext) request = { ...request, scene: conversationScene() };
  let evidence = request.scene?.culturalEvidence ?? emptyEvidence();
  let locationContext = request.locationContext ?? request.scene?.locationContext;
  const areaQuestion = request.mode === 'location' || asksAboutArea(request.question);
  if (!areaQuestion) locationContext = undefined;
  if (request.locality && locationContext && !sameLocality(request.locality, locationContext.locality)) locationContext = undefined;
  let tasteContext = request.profile ? request.tasteContext : undefined;
  const warnings = [...(request.scene?.warnings ?? [])];
  const completedActions: string[] = [];
  const currentScene = () => request.scene ? { ...request.scene, culturalEvidence: evidence, locationContext } : undefined;
  const resultFrom = (answer: string, confidence: Answer['confidence']): Answer => ({ answer, confidence, locationContext, tasteContext,
    scene: request.scene ? { ...request.scene, ...(request.scene.origin === 'conversation' ? { summary: answer, confidence } : {}), culturalEvidence: evidence, locationContext } : undefined });
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
  if (areaQuestion && !locationContext && request.locality) await lookupLocation();
  const visible = visibleReferences(evidence.entities);
  const named = visible.filter((entity) => questionNamesEntity(entity, request.question));
  const requestedUnresolved = evidence.entities.find((entity) => entity.source !== 'qloo' && !isConfirmed(entity) && namedInQuestion(entity.detectedName, request.question));
  if (!areaQuestion && requestedUnresolved) return resultFrom(`I can read ${requestedUnresolved.detectedName} in the image, but I could not match it uniquely in the cultural records.`, 'low');
  const previousName = [...request.messages].reverse().filter((message) => message.role === 'user').flatMap((message) => visible.filter((entity) => questionNamesEntity(entity, message.content)))[0];
  const subject = named[0] ?? previousName ?? (visible.length === 1 ? visible[0] : undefined);
  if (!areaQuestion && /\b(this|it)\b/i.test(request.question) && visible.length > 1 && !subject && !asksForConnections(request.question)) return resultFrom('Which scene reference do you mean?', 'low');
  if (!areaQuestion && asksForConnections(request.question) && /\b(these|they|them)\b/i.test(request.question) && visible.length < 2) return resultFrom(visible.length ? `I have only one confirmed scene reference, ${visualName(visible[0])}, so there is nothing else visible to compare it with.` : 'I do not have two confirmed scene references to compare.', 'low');
  if (!areaQuestion && !visible.length && evidence.entities.some((entity) => entity.source !== 'qloo')) {
    const detected = evidence.entities.filter((entity) => entity.source !== 'qloo').slice(0, 2).map((entity) => entity.detectedName);
    return resultFrom(`I can read ${detected.join(' and ')} in the image, but I could not match ${detected.length === 1 ? 'it' : 'them'} uniquely in the cultural records. You can tell me more about the reference.`, 'low');
  }
  if (!areaQuestion && asksAboutTaste(request.question) && subject && request.profile?.entities.some((interest) => interest.id === subject.qlooId)) return resultFrom(`Yes. ${subject.groundingBasis === 'related' ? `${subject.qlooName} associated with ${subject.detectedName}` : visualName(subject)} is one of the interests in your profile.`, 'high');
  if (!areaQuestion && !asksForConnections(request.question) && !asksAboutTaste(request.question) && !asksForRecommendations(request.question) && /\b(what is|who is|tell me (?:more )?about|explain)\b/i.test(request.question) && subject) {
    const fact = evidence.facts?.find((item) => item.entityId === subject.qlooId);
    if (fact) return resultFrom(renderGroundedAnswer(request, evidence, undefined, undefined, [{ kind: 'fact', entityId: fact.entityId }]).answer, 'medium');
  }
  const references = tasteReferences(request.scene, locationContext, request.locality);
  if (tasteContext && JSON.stringify(tasteContext.referenceIds) !== JSON.stringify(references.map((entity) => entity.id).sort())) tasteContext = undefined;
  if (request.profile && !tasteContext && visible.length && (request.strategy === 'familiar' || request.strategy === 'discover' || asksAboutTaste(request.question))) {
    tasteContext = await investigateTaste(request.profile, references, providers.qloo);
    completedActions.push(JSON.stringify({ tool: 'analyzeTaste' }));
  }
  for (let step = 0; step <= 4; step++) {
    refreshTaste();
    const allowRelated = asksForRecommendations(request.question);
    const activeIds = new Set(visibleReferences(evidence.entities).map((entity) => entity.qlooId));
    const scopedEvidence = allowRelated ? evidence : { ...evidence, entities: evidence.entities.filter((entity) => entity.source !== 'qloo'), facts: evidence.facts?.filter((fact) => activeIds.has(fact.entityId)), relationships: evidence.relationships.filter((item) => activeIds.has(item.source) && activeIds.has(item.target)), themes: evidence.themes.filter((tag) => evidence.facts?.some((fact) => activeIds.has(fact.entityId) && fact.tags.includes(tag))) };
    const turn = agentTurnSchema.parse(await providers.llm.nextTurn({
      instructions: contextInstructions, request, evidence: scopedEvidence, locationContext,
      completedActions, warnings, tasteContext, allowInvestigation: step < 4,
    }));
    if (turn.kind === 'answer') {
      const cited = turn.result.usedTasteConnections ?? [];
      if (cited.some((used) => !request.profile || !tasteContext?.connections.some((connection) => connection.referenceId === used.referenceId && connection.interestId === used.interestId))) {
        throw new ApiError(502, 'UNSUPPORTED_TASTE_BRIDGE', 'The familiar comparison could not be verified with Qloo evidence. Try asking about the reference directly.');
      }
      const hasEvidence = Boolean(evidence.facts?.length || evidence.relationships.length || locationContext?.facts?.length);
      const selections = turn.result.evidenceSelections ?? (cited.length ? cited.map((used) => ({ kind: 'taste' as const, ...used })) : undefined);
      const bridgeRequested = /(?:explain|understand|compare|relate|connect|similar|like|through|familiar|know).*(?:interest|familiar|know|like|compare|relate|connect)|(?:interest|familiar|know|like).*(?:explain|understand|compare|relate|connect)/i.test(request.question);
      const bridge = bridgeRequested ? selections?.find((selection) => selection.kind === 'taste' && tasteContext?.connections.some((connection) => connection.referenceId === selection.referenceId && connection.interestId === selection.interestId && connection.kind === 'affinity' && (connection.strength ?? 0) >= 0.6)) : undefined;
      const anchorFacts: NonNullable<CulturalEvidence['facts']> = [];
      if (bridge?.kind === 'taste' && [...(evidence.facts ?? []), ...(locationContext?.facts ?? [])].some((fact) => fact.entityId === bridge.referenceId) && request.profile?.entities.some((interest) => interest.id === bridge.interestId)) {
        try {
          const fact = await providers.qloo.getEntityFact(bridge.interestId);
          if (fact?.entityId === bridge.interestId && fact.source === 'qloo') anchorFacts.push(fact);
        } catch { /* A failed optional lookup must not block the scene answer. */ }
      }
      const grounded = renderGroundedAnswer(request, evidence, locationContext, tasteContext, selections, anchorFacts);
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
        if (!visibleReferences(evidence.entities).some((entity) => entity.qlooId === entityId)) {
          throw new ApiError(422, 'UNCONFIRMED_REFERENCE', 'That reference has not been confidently identified yet.');
        }
        if (evidence.facts?.some((fact) => fact.entityId === entityId) && !asksForRecommendations(request.question)) break;
        evidence = mergeEvidence(evidence, evidenceSchema.parse(await providers.qloo.exploreReference(entityId)));
        break;
      }
      case 'analyzeTaste':
        if (!request.profile) throw new ApiError(422, 'TASTE_DISABLED', 'Personalization is not enabled. You can still explore the environment.');
        tasteContext = await investigateTaste(request.profile, tasteReferences(request.scene ? { ...request.scene, culturalEvidence: evidence } : undefined, areaQuestion ? locationContext : undefined, areaQuestion ? request.locality : undefined), providers.qloo);
        break;
      case 'analyzeConnections':
        const active = visibleReferences(evidence.entities);
        const explicitlyNamed = active.filter((entity) => questionNamesEntity(entity, request.question));
        const targets = explicitlyNamed.length >= 2 ? explicitlyNamed.slice(0, 2) : active;
        const keyForPair = pairKey(targets);
        if (keyForPair && evidence.investigatedPairs?.includes(keyForPair)) break;
        evidence = mergeEvidence(evidence, { ...evidenceSchema.parse(await providers.qloo.analyzeConnections(targets)), ...(keyForPair ? { investigatedPairs: [keyForPair] } : {}) });
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
        if (detected && isConfirmed(detected)) break;
        const resolved = resolvedEntitySchema.array().parse(await providers.qloo.resolveEntities([{ label: name, category, confidence: detected?.visionConfidence ?? 1, culturallyRelevant: true }], areaQuestion ? request.locality : undefined));
        const confirmed = resolved.map((entity) => ({ ...entity, source: explicitlyNamed ? 'user' as const : entity.source }));
        if (!request.scene) request = { ...request, scene: conversationScene() };
        evidence = { ...evidence, entities: [...evidence.entities.filter((entity) => normalize(entity.detectedName) !== normalizedName), ...confirmed].slice(0, 30) };
        if (confirmed.some(isConfirmed)) {
          const pair = visibleReferences(evidence.entities).filter((entity) => questionNamesEntity(entity, request.question)).slice(0, 2);
          const targets = pair.length >= 2 ? pair : confirmed.filter(isConfirmed);
          const keyForPair = pair.length >= 2 && asksForConnections(request.question) ? pairKey(targets) : undefined;
          evidence = mergeEvidence(evidence, { ...evidenceSchema.parse(await providers.qloo.analyzeConnections(targets, { includeAffinity: Boolean(keyForPair) })), ...(keyForPair ? { investigatedPairs: [keyForPair] } : {}) });
          completedActions.push(JSON.stringify({ tool: 'analyzeConnections' }));
        }
        else warnings.push(`The reference “${name}” could not be matched uniquely. Clarify its exact name and type.`);
        break;
      }
    }
    completedActions.push(key);
  }
  throw new ApiError(422, 'INVESTIGATION_LIMIT', 'Try a more specific question.');
}

export async function analyzeScene(input: { image: string; locality?: Locality; mode: UserMode; question?: string; profile?: TasteProfile; resolutionCache?: { entries: ShelfResolutionEntry[] } }, providers: Providers): Promise<Scene> {
  const frame = await providers.vision.inspectScene(input.image);
  const sceneType = Array.isArray(frame) ? 'general' : (frame as VisionFrame).sceneType;
  const displayKind = displayKindForScene(sceneType);
  const detected = (displayKind ? visionEntitySchema.array() : visionEntitySchema.array().max(120))
    .parse(Array.isArray(frame) ? frame : (frame as VisionFrame).entities);
  if (displayKind) return analyzeShelf(displayKind, detected, input.profile, providers.qloo, providers.displayLlm ?? providers.shelfLlm ?? providers.llm, input.resolutionCache?.entries);
  if (sceneType === 'event_material') return analyzeEvent(Array.isArray(frame) ? undefined : (frame as VisionFrame).event, detected, input.profile, providers.qloo);
  const meaningful = detected.filter((entity) => entity.culturallyRelevant).slice(0, 30);
  const environmentalObservations = detected.filter((entity) => !entity.culturallyRelevant).sort((a, b) => Number(Boolean(b.necessaryInformation)) - Number(Boolean(a.necessaryInformation))).slice(0, 5).map(({ label, confidence, position, necessaryInformation }) => ({ label, confidence, position, necessaryInformation }));
  const shortlist = meaningful.filter((entity) => entity.confidence >= 0.5).sort((a, b) => Number((input.question ?? '').toLowerCase().includes(b.label.toLowerCase())) - Number((input.question ?? '').toLowerCase().includes(a.label.toLowerCase())) || b.confidence - a.confidence).slice(0, 8);
  const resolved = shortlist.length ? resolvedEntitySchema.array().max(30).parse(await providers.qloo.resolveEntities(shortlist, input.locality)) : [];
  const entities = meaningful.map((entity) => resolved.find((item) => normalize(item.detectedName) === normalize(entity.label)) ?? { detectedName: entity.label, detectedCategory: entity.category, visionConfidence: entity.confidence, source: 'vision' as const, resolutionPending: true,
    ...(entity.carrier ? { carrier: entity.carrier } : {}), ...(entity.visualDescription ? { visualDescription: entity.visualDescription } : {}),
    ...(entity.visibleText ? { visibleText: entity.visibleText } : {}), ...(entity.relatedName ? { relatedName: entity.relatedName } : {}), ...(entity.position ? { position: entity.position } : {}) });
  const confirmed = entities.filter(isConfirmed);
  const connections = confirmed.length ? evidenceSchema.parse(await providers.qloo.analyzeConnections(confirmed, { includeAffinity: false })) : emptyEvidence();
  let locationContext;
  if (input.locality && (input.mode === 'location' || (input.question && asksAboutArea(input.question)))) {
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
    ...scene, summary: `${environmentalObservations.filter((item) => item.confidence >= 0.7).length ? `The image appears to contain ${environmentalObservations.filter((item) => item.confidence >= 0.7).map((item) => item.label).join(', ')}. ` : ''}${entities.length ? `${entities.slice(0, 2).map(visualLead).join(' ')} I could not match ${entities.length === 1 ? 'that reference' : 'those references'} uniquely in the cultural records.` : 'I could not identify distinctive cultural references in this image. Try a readable poster, book title, brand, or landmark.'}`,
    warnings: [...new Set([...(scene.warnings ?? []), ...(locationContext?.warnings ?? [])])],
  };
  if (!input.question && input.mode === 'scene' && confirmed.length === 1 && connections.facts?.some((fact) => fact.entityId === confirmed[0].qlooId)) {
    const answer = renderGroundedAnswer({ question: 'What cultural context am I missing?', scene, mode: 'scene', messages: [] }, scene.culturalEvidence, undefined, undefined, [{ kind: 'fact', entityId: confirmed[0].qlooId! }]);
    return { ...scene, summary: answer.answer, confidence: answer.limited ? 'low' : 'medium' };
  }
  const result = await explore({
    question: input.question || modes.find((mode) => mode.id === input.mode)!.question, scene,
    locality: input.mode === 'location' || (input.question && asksAboutArea(input.question)) ? input.locality : undefined, messages: [], mode: input.mode,
  }, providers);
  return { ...(result.scene ?? scene), summary: result.answer, confidence: result.confidence };
}
