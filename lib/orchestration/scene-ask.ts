import { sceneEvidence } from '@/lib/ai/scene-decision';
import type { SceneDecision, SceneReasoningInput, SceneReasoningService } from '@/lib/llm/scene-decision';
import type { PlaceAnchor, PlacesService } from '@/lib/places/geoapify';
import type { QlooService } from '@/lib/qloo/service';
import { researchEvent } from '@/lib/research/event';
import type { ResearchService } from '@/lib/research/tavily';
import type { Answer, AskRequest, Scene } from '@/types/context';
import { diningKind, discoverDining, fetchDiningDetails, qlooDetailAnswer } from './dining';
import { eventPrintedAnswer, exploreEvent } from './event-ask';
import { asksForAreaDiscovery, isDiningComparisonRequest, asksForDiningDiscovery, asksForDiningPlaceDetails, asksForPracticalLookup, explicitlyNamedPlace, explicitlyNearDevice, practicalCategoryFromQuestion, visibleReferences } from './intent';
import { metersBetween, spokenDistance, straightLineKilometers } from '@/lib/location/distance';
import { withinGeojson } from '@/lib/location/geometry';
import { openingStatusAt } from '@/lib/places/opening-hours';

type Services = { qloo: QlooService; reasoner: SceneReasoningService; research?: ResearchService; places?: PlacesService };
const reply = (answer: string, scene: Scene, confidence: Answer['confidence'] = 'medium'): Answer => ({ answer, scene, confidence });
const recent = (date: string, minutes = 15) => Date.now() - new Date(date).getTime() < minutes * 60_000;
const explicitCalendar = (question: string) => /\b(add|save|create|put)\b.*\bcalendar\b|\bremind me\b/i.test(question);
const freshCheckRequested = (question: string) => /\brecheck\b|\brefresh\b|\bcheck\b.{0,60}\bagain\b/i.test(question);
const answerKey = (question: string) => question.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

function cachedEventAnswer(request: AskRequest, scene: Scene, services: Services): Answer | undefined {
  if (!scene.event || freshCheckRequested(request.question) || explicitCalendar(request.question)) return undefined;
  const cached = scene.event.answerCache?.findLast((item) => item.question === answerKey(request.question) && recent(item.createdAt));
  if (!cached) return undefined;
  const evidence = sceneEvidence(reasoningInput({ ...request, scene }, services));
  return cached.evidence.every((item) => evidence[item.id] === item.value)
    ? reply(cached.answer, scene, cached.confidence) : undefined;
}

function reasoningInput(request: AskRequest, services: Services): SceneReasoningInput {
  return { question: request.question, messages: request.messages, scene: request.scene,
    interests: request.profile?.entities.map((item) => ({ id: item.id, name: item.name })) ?? [],
    available: { research: Boolean(services.research)
      && !asksForDiningDiscovery(request.question) && !asksForAreaDiscovery(request.question)
      && !asksForPracticalLookup(request.question)
      && !(request.scene?.area && !request.scene.event), places: Boolean(services.places),
      qloo: true, calendar: Boolean(request.scene?.event), devicePosition: Boolean(request.position),
      locationEnabled: Boolean(request.locationEnabled) } };
}
function grounded(answer: string | undefined, ids: string[], input: SceneReasoningInput, scene: Scene): Answer {
  const known = sceneEvidence({ ...input, scene });
  if (!answer || !ids.length || ids.some((id) => !Object.hasOwn(known, id)))
    return reply('I could not support that answer from the information I have. Ask about a specific part of this scene.', scene, 'low');
  return reply(answer, scene);
}
async function answerAfterTool(request: AskRequest, services: Services, scene: Scene, completed: SceneDecision,
  cacheResearch = false): Promise<Answer> {
  try {
    const input = { ...reasoningInput({ ...request, scene }, services), completed };
    const answer = await services.reasoner.answer(input);
    const result = grounded(answer.answer, answer.evidenceIds, input, scene);
    if (!cacheResearch || !scene.event || answerKey(request.question).length > 800 || result.confidence === 'low'
      || !answer.evidenceIds.some((id) => id.startsWith('research:'))) return result;
    const known = sceneEvidence(input);
    const evidence = answer.evidenceIds.map((id) => ({ id, value: known[id] })).filter((item): item is { id: string; value: string } => Boolean(item.value));
    if (evidence.length !== answer.evidenceIds.length) return result;
    const previous = scene.event.answerCache?.filter((item) => item.question !== answerKey(request.question)) ?? [];
    return { ...result, scene: { ...scene, event: { ...scene.event, answerCache: [...previous,
      { question: answerKey(request.question), answer: result.answer, confidence: result.confidence,
        evidence, createdAt: new Date().toISOString() }].slice(-8) } } };
  } catch { return reply('I checked the available information, but could not form a reliable answer. Please ask a narrower question.', scene, 'low'); }
}

function placeAnchor(request: AskRequest): PlaceAnchor | undefined {
  // Deictic searches use foreground location; named searches resolve separately.
  if (!request.locationEnabled || !request.position) return undefined;
  return { ...request.position, kind: 'device', name: null, timezone: request.deviceTimeZone ?? null,
    source: 'foreground_location', confidence: null };
}
async function discoveryAnchor(request: AskRequest, plan: SceneDecision, services: Services): Promise<PlaceAnchor | undefined> {
  const namedInQuestion = plan.anchorName && request.question.toLocaleLowerCase().includes(plan.anchorName.toLocaleLowerCase());
  if (plan.anchor === 'named' && namedInQuestion)
    return services.places?.resolveAnchor?.(plan.anchorName!, plan.anchorLocality, 'named').catch(() => undefined);
  if (plan.anchor === 'named') return undefined;
  return placeAnchor(request);
}
function namedAnchorFromQuestion(question: string): string | undefined {
  if (!explicitlyNamedPlace(question) || explicitlyNearDevice(question)) return undefined;
  return question.replace(/[.!?]+$/, '').match(/\b(?:near|around|in)\s+(?:the\s+)?(.+)$/i)?.[1]?.trim();
}

/** Scene-first Event and place orchestration. Qwen selects evidence needs; code owns provider calls and actions. */
export async function exploreActiveScene(request: AskRequest, services: Services): Promise<Answer> {
  let scene = request.scene!;
  if (!request.locationEnabled && (asksForDiningDiscovery(request.question)
    || asksForAreaDiscovery(request.question) || asksForPracticalLookup(request.question)))
    return reply('Turn on Location in Personalization to search for places near you.', scene, 'low');
  if (scene.event && !scene.event.pendingCalendar && !scene.event.pendingCalendarDetails) {
    const printed = eventPrintedAnswer(scene, request.question);
    if (printed) return printed;
    const cached = cachedEventAnswer(request, scene, services);
    if (cached) return cached;
  }
  const event = scene.event;
  // An in-progress Calendar confirmation has a deterministic safety path. It must not be reinterpreted as dining.
  if (event?.pendingCalendar || event?.pendingCalendarDetails)
    return exploreEvent({ ...request, scene }, services.qloo, services.research, services.places);
  if (scene.dining && isDiningComparisonRequest(request.question))
    return reply('I do not compare dining recommendations. Ask about one recommended place’s cuisine, address, distance, business rating, phone number, or opening hours instead.', scene, 'low');
  if (asksForAreaDiscovery(request.question) && !asksForDiningDiscovery(request.question) && !asksForPracticalLookup(request.question))
    return reply('Please name a place category: restaurant or bar, bookstore, record store, game shop, pharmacy, ATM, or restroom.', scene, 'low');
  let plan: SceneDecision;
  try { plan = await services.reasoner.plan(reasoningInput({ ...request, scene }, services)); }
  catch { return reply('I could not interpret that question reliably. Please ask it again more specifically.', scene, 'low'); }
  const namedAnchor = namedAnchorFromQuestion(request.question);
  if (asksForDiningDiscovery(request.question)) plan = { scope: 'dining', next: 'dining_discovery', evidenceIds: [],
    anchor: namedAnchor ? 'named' : 'device', anchorName: namedAnchor };
  const practicalCategory = asksForPracticalLookup(request.question) ? practicalCategoryFromQuestion(request.question) : undefined;
  if (practicalCategory) plan = { scope: 'area', next: 'practical_lookup', practicalCategory, evidenceIds: [],
    anchor: namedAnchor ? 'named' : 'device', anchorName: namedAnchor };
  // Explicit user scope wins over the planner's anchor suggestion.
  if (['dining_discovery', 'area_discovery', 'practical_lookup'].includes(plan.next)) {
    if (explicitlyNearDevice(request.question)) plan = { ...plan, anchor: 'device', anchorName: undefined };
    else if (explicitlyNamedPlace(request.question)) plan = { ...plan, anchor: 'named' };
  }
  const input = reasoningInput({ ...request, scene }, services);
  if (plan.scope === 'dining' && !asksForDiningDiscovery(request.question)
    && !asksForDiningPlaceDetails(request.question))
    return reply('For dining, ask for restaurants or bars near you or a named place, or ask for one recommended place’s details.', scene, 'low');
  if (plan.scope === 'general') return reply('Please ask about this scene, or capture a new one to change context.', scene, 'low');
  if (plan.scope === 'event' && !scene.event || plan.scope === 'dining' && !scene.dining && plan.next !== 'dining_discovery'
    || plan.scope === 'area' && !scene.area && !['area_discovery', 'practical_lookup'].includes(plan.next))
    return reply('I do not have that part of the scene to answer from.', scene, 'low');
  if (plan.next === 'clarify') return reply(plan.answer ?? 'Which part of this scene do you mean?', scene, 'low');
  if (plan.next === 'answer') return grounded(plan.answer, plan.evidenceIds, input, scene);

  if (plan.next === 'calendar') {
    if (!scene.event || !explicitCalendar(request.question)) return reply('I can add an event only when you explicitly ask me to add it to Calendar.', scene, 'low');
    return exploreEvent({ ...request, scene }, services.qloo, services.research, services.places);
  }
  if (plan.next === 'event_research') {
    if (plan.scope !== 'event' || asksForDiningDiscovery(request.question) || asksForAreaDiscovery(request.question)
      || asksForPracticalLookup(request.question)
      || !scene.event || !plan.researchKind || !services.research)
      return reply('I cannot check current event information right now.', scene, 'low');
    const eventState = scene.event;
    if (freshCheckRequested(request.question)
      || !eventState.researchChecks?.some((check) => check.kind === plan.researchKind && recent(check.checkedAt))) {
      try {
        const found = await researchEvent(eventState, plan.researchKind, services.research);
        scene = { ...scene, event: { ...eventState,
          researchedFacts: [...eventState.researchedFacts, ...found.facts].slice(-30),
          verifiedTicketUrl: found.verifiedTicketUrl ?? eventState.verifiedTicketUrl,
          verifiedStart: found.verifiedStart ?? eventState.verifiedStart,
          researchChecks: [...(eventState.researchChecks ?? []), { kind: plan.researchKind, checkedAt: new Date().toISOString() }].slice(-20) } };
      } catch { return reply('I could not verify current event information right now.', scene, 'low'); }
    }
    return answerAfterTool(request, services, scene, plan, true);
  }
  if (plan.next === 'venue_details') {
    if (!scene.event?.visual.venueName) return reply('I could not read a specific venue from this material.', scene, 'low');
    if (plan.detail === 'accessibility') return reply(`I do not have verified accessibility details for ${scene.event.visual.venueName}.`, scene, 'low');
    if (plan.detail === 'distance' && (!request.locationEnabled || !request.position))
      return reply(`I need foreground Location to estimate your distance from ${scene.event.visual.venueName}.`, scene, 'low');
    if (!services.places) return reply(`The material names ${scene.event.visual.venueName}, but I cannot verify its practical details right now.`, scene, 'low');
    try {
      const place = scene.event.place && (plan.detail !== 'opening' || recent(scene.event.place.checkedAt))
        ? scene.event.place : await services.places.findExact(scene.event.visual.venueName,
          { locality: scene.event.visual.locationText });
      if (!place) return reply(`I could not uniquely verify ${scene.event.visual.venueName}'s location.`, scene, 'low');
      scene = { ...scene, event: { ...scene.event, place } };
      if (plan.detail === 'distance') {
        if (!request.locationEnabled || !request.position) return reply(`I need foreground Location to estimate distance from you. ${place.address ? `${place.name} is at ${place.address}.` : ''}`.trim(), scene, 'low');
        if (place.latitude !== undefined && place.longitude !== undefined) {
          const km = straightLineKilometers(request.position, { latitude: place.latitude, longitude: place.longitude });
          return reply(`${place.name} is about ${km} kilometers away in a straight line.${place.address ? ` Its address is ${place.address}.` : ''} This is not a walking route.`, scene);
        }
      }
      return answerAfterTool(request, services, scene, plan);
    } catch { return reply('I could not verify that venue right now.', scene, 'low'); }
  }
  if (plan.next === 'dining_discovery') {
    if (!asksForDiningDiscovery(request.question)) return reply(
      'Ask for restaurants or bars near you or near a named place.', scene, 'low');
    const anchor = await discoveryAnchor(request, plan, services);
    if (!anchor) return reply(plan.anchor === 'named' ? 'Which named place and city should I search near? I could not locate it uniquely.'
      : request.locationEnabled ? 'I need foreground location permission to find restaurants near you.'
      : 'Turn on Location in Personalization to find restaurants near you.',
    scene, 'low');
    return discoverDining(request, services.qloo, { position: { latitude: anchor.latitude, longitude: anchor.longitude },
      source: anchor.kind === 'named' ? { kind: 'named', name: anchor.name ?? plan.anchorName ?? 'that place', placeId: anchor.placeId ?? '' }
        : { kind: 'device' }, resolved: anchor }, scene);
  }
  if (plan.next === 'area_discovery') {
    return reply('Please name a place category, such as bookstore, record store, game shop, pharmacy, ATM, restroom, restaurant, or bar.', scene, 'low');
  }
  if (plan.next === 'area_more') return reply('Please name the category you want to find next.', scene, 'low');
  if (plan.next === 'practical_lookup') {
    if (!practicalCategory) return reply('Please name a practical place category to search for.', scene, 'low');
    const category = { bookstore: 'commercial.books', record_store: 'commercial.video_and_music',
      game_shop: 'commercial.hobby.games,commercial.toy_and_game', restroom: 'amenity.toilet',
      atm: 'service.financial.atm', pharmacy: 'healthcare.pharmacy' }[practicalCategory];
    if (!services.places?.practicalLookup) return reply('Practical place lookup is unavailable right now.', scene, 'low');
    const anchor = await discoveryAnchor(request, plan, services);
    if (!anchor) return reply(plan.anchor === 'named' ? 'Which named place and city should I search near? I could not locate it uniquely.'
      : request.locationEnabled ? 'I need foreground location permission to look for that practical place.'
      : 'Turn on Location in Personalization to find practical places near you.', scene, 'low');
    try {
      const found = await services.places.practicalLookup(anchor, category);
      const first = found[0];
      if (!first) return reply(`I could not find a mapped ${practicalCategory.replace('_', ' ')} nearby.`, scene, 'low');
      const checked = await services.places.details?.(first.placeId).catch(() => undefined);
      const place = checked ? { ...first, ...checked, latitude: checked.latitude ?? first.latitude,
        longitude: checked.longitude ?? first.longitude, timezone: checked.timezone ?? first.timezone } : first;
      const distance = place.latitude !== undefined && place.longitude !== undefined
        ? `${spokenDistance(metersBetween(anchor, { latitude: place.latitude, longitude: place.longitude }), request.locale)} in a straight line from ${anchor.name ?? 'you'}` : undefined;
      const timezone = place.timezone ?? anchor.timezone ?? (anchor.kind === 'device' ? request.deviceTimeZone : undefined);
      const open = place.openNow ?? (place.openingHours && timezone ? openingStatusAt(place.openingHours, new Date(), timezone) : undefined);
      const status = open === undefined ? 'I could not verify whether it is open now.'
        : `It is listed as ${open ? 'open' : 'closed'} right now.`;
      return reply(`The closest mapped ${practicalCategory.replace('_', ' ')} I found is ${place.name}${distance ? `, ${distance}` : ''}${place.address ? `, at ${place.address}` : ''}. ${status} This is a practical lookup, not a personalized recommendation.`, scene);
    } catch { return reply('I could not check practical places right now.', scene, 'low'); }
  }
  if (plan.next === 'area_details') {
    const item = [...(scene.area?.qlooUnionResults ?? []), ...Object.values(scene.area?.qlooTopUpResults ?? {}).flat()]
      .find((entry) => entry.qlooId === plan.targetId);
    if (!item || !scene.area) return reply('Which recommended place do you mean?', scene, 'low');
    const match = scene.area.matches.find((entry) => entry.qlooId === item.qlooId);
    if (plan.detail === 'walking') {
      if (!services.places?.walk10) return reply('I cannot check the walking area right now.', scene, 'low');
      let geometry = scene.area.walk10Geometry;
      if (geometry === undefined) {
        try { geometry = await services.places.walk10(scene.area.anchor); }
        catch { geometry = null; }
        scene = { ...scene, area: { ...scene.area, walk10Geometry: geometry } };
      }
      const point = match?.details?.latitude !== undefined && match.details.longitude !== undefined
        ? { latitude: match.details.latitude, longitude: match.details.longitude }
        : item.latitude !== undefined && item.longitude !== undefined ? { latitude: item.latitude, longitude: item.longitude } : undefined;
      const contained = point ? withinGeojson(point, geometry) : undefined;
      return reply(contained === true ? `${item.name} is within about a ten-minute walking area according to the map estimate.`
        : contained === false ? `${item.name} is outside the estimated ten-minute walking area. I cannot give an exact walking time.`
          : `I could not verify walking reachability for ${item.name}.`, scene, contained === undefined ? 'low' : 'medium');
    }
    if (plan.detail === 'distance') {
      const point = match?.details?.latitude !== undefined && match.details.longitude !== undefined
        ? { latitude: match.details.latitude, longitude: match.details.longitude }
        : item.latitude !== undefined && item.longitude !== undefined ? { latitude: item.latitude, longitude: item.longitude } : undefined;
      return reply(point ? `${item.name} is ${spokenDistance(metersBetween(scene.area.anchor, point), request.locale)} in a straight line.`
        : `I could not verify a distance to ${item.name}.`, scene, point ? 'medium' : 'low');
    }
    if (!match?.details) return reply(`I could not verify practical details for ${item.name}.`, scene, 'low');
    if (plan.detail === 'opening') return reply(match.details.openingHours
      ? `${item.name} lists these opening hours: ${match.details.openingHours}. I have not verified whether it is open right now.`
      : `I could not confirm ${item.name}'s opening hours.`, scene, 'low');
    if (plan.detail === 'phone') return reply(match.details.phone ? `${item.name}'s listed phone number is ${match.details.phone}.`
      : `I could not confirm a phone number for ${item.name}.`, scene, match.details.phone ? 'medium' : 'low');
    return reply(match.details.address ? `${item.name} is at ${match.details.address}.`
      : `I could not confirm an address for ${item.name}.`, scene, match.details.address ? 'medium' : 'low');
  }
  if (plan.next === 'dining_details') {
    if (!scene.dining) return reply('I need a dining recommendation first.', scene, 'low');
    const target = scene.dining.candidates.find((item) => item.qlooId === plan.targetId);
    if (!target) return reply('Which recommended dining place do you mean?', scene, 'low');
    if (plan.detail === 'accessibility') return reply(`I do not have verified accessibility details for ${target.name}.`, scene, 'low');
    const fromQloo = qlooDetailAnswer(target, plan.detail, scene.dining.resolvedAnchor, request.locale);
    if (fromQloo && plan.detail !== 'opening' && plan.detail !== 'walking') return reply(fromQloo, scene);
    if (plan.detail === 'rating') return reply(`I could not verify a business rating for ${target.name}.`, scene, 'low');
    if (plan.detail === 'walking') {
      if (!services.places?.walk10 || !scene.dining.resolvedAnchor) return reply('I cannot check the walking area right now.', scene, 'low');
      let geometry = scene.dining.walk10Geometry;
      if (geometry === undefined) {
        try { geometry = await services.places.walk10(scene.dining.resolvedAnchor); }
        catch { geometry = null; }
        scene = { ...scene, dining: { ...scene.dining, walk10Geometry: geometry } };
      }
      const match = scene.dining?.matches?.find((item) => item.qlooId === target.qlooId);
      const point = match?.details?.latitude !== undefined && match.details.longitude !== undefined
        ? { latitude: match.details.latitude, longitude: match.details.longitude }
        : target.latitude !== undefined && target.longitude !== undefined
          ? { latitude: target.latitude, longitude: target.longitude } : undefined;
      const contained = point ? withinGeojson(point, geometry) : undefined;
      return reply(contained === true ? `${target.name} is within about a ten-minute walking area according to the map estimate.`
        : contained === false ? `${target.name} is outside the estimated ten-minute walking area. I cannot give an exact walking time.`
          : `I could not verify walking reachability for ${target.name}.`, scene, contained === undefined ? 'low' : 'medium');
    }
    if (!services.places && !scene.dining.places?.some((item) => item.qlooId === target.qlooId))
      return reply(`I found ${target.name} through Qloo, but I cannot verify its practical details yet.`, scene, 'low');
    try {
      const updated = await fetchDiningDetails(scene, target.qlooId, services.places, plan.detail === 'opening');
      if (!updated) return reply(`I could not uniquely verify practical details for ${target.name}.`, scene, 'low');
      const place = updated.dining?.places?.find((item) => item.qlooId === target.qlooId)?.details;
      if (plan.detail === 'cuisine') {
        const kind = diningKind(place);
        return reply(kind ? `${target.name} is listed as ${/^[aeiou]/i.test(kind) ? 'an' : 'a'} ${kind}.`
          : `I could not verify the cuisine or restaurant category for ${target.name}.`, updated, kind ? 'medium' : 'low');
      }
      if (plan.detail === 'phone') return reply(place?.phone ? `${target.name}'s listed phone number is ${place.phone}.`
        : `I could not verify a phone number for ${target.name}.`, updated, place?.phone ? 'medium' : 'low');
      if (plan.detail === 'address') return reply(place?.address ? `${target.name} is at ${place.address}.`
        : `I could not verify an address for ${target.name}.`, updated, place?.address ? 'medium' : 'low');
      if (plan.detail === 'opening') {
        if (!place?.openingHours) return reply(`I could not confirm ${target.name}'s opening hours.`, updated, 'low');
        if (/\b(hours|opening hours|schedule)\b/i.test(request.question))
          return reply(`${target.name} lists these opening hours: ${place.openingHours}.`, updated);
        const timezone = place.timezone ?? updated.dining?.resolvedAnchor?.timezone;
        const status = timezone ? openingStatusAt(place.openingHours, new Date(), timezone) : undefined;
        return reply(status === undefined ? `I found listed hours for ${target.name}, but I could not confirm whether it is open now.`
          : `${target.name} is listed as ${status ? 'open' : 'closed'} right now.`, updated,
        status === undefined ? 'low' : 'medium');
      }
      if (plan.detail === 'distance') {
        if (place?.latitude !== undefined && place.longitude !== undefined && updated.dining?.position) {
          const km = straightLineKilometers(updated.dining.position, { latitude: place.latitude, longitude: place.longitude });
          const origin = updated.dining.resolvedAnchor?.kind === 'named'
            ? updated.dining.resolvedAnchor.name ?? 'the named place' : 'you';
          return reply(`${place.name} is about ${km} kilometers from ${origin} in a straight line.${place.address ? ` Its address is ${place.address}.` : ''} This is not a walking route.`, updated);
        }
      }
      return answerAfterTool(request, services, updated, plan);
    } catch { return reply(`I could not verify practical details for ${target.name} right now.`, scene, 'low'); }
  }
  if (plan.next === 'qloo_connection') {
    const visible = visibleReferences(scene.culturalEvidence.entities);
    const pair = plan.pairIds?.map((id) => visible.find((item) => item.qlooId === id));
    if (!pair || pair.length !== 2 || pair.some((item) => !item) || pair[0]!.qlooId === pair[1]!.qlooId)
      return reply('Which two named references on this material do you want compared?', scene, 'low');
    const key = pair.map((item) => item!.qlooId!).sort().join(':');
    const alreadyKnown = scene.culturalEvidence.relationships.some((item) => [item.source, item.target].sort().join(':') === key);
    if (!alreadyKnown && !scene.culturalEvidence.investigatedPairs?.includes(key)) {
      try {
        const result = await services.qloo.analyzeConnections(pair as typeof visible, { includeAffinity: true });
        scene = { ...scene, culturalEvidence: { ...scene.culturalEvidence,
          relationships: [...scene.culturalEvidence.relationships, ...result.relationships.filter((item) =>
            [item.source, item.target].sort().join(':') === key)].slice(-100),
          investigatedPairs: [...(scene.culturalEvidence.investigatedPairs ?? []), key].slice(-30) } };
      } catch { return reply('I could not check that cultural connection right now.', scene, 'low'); }
    }
    return answerAfterTool(request, services, scene, plan);
  }
  return reply('I could not determine what information this question needs. Please ask it more specifically.', scene, 'low');
}
