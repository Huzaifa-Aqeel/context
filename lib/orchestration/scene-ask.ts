import { sceneEvidence } from '@/lib/ai/scene-decision';
import type { SceneDecision, SceneReasoningInput, SceneReasoningService } from '@/lib/llm/scene-decision';
import type { PlaceAnchor, PlacesService } from '@/lib/places/geoapify';
import type { QlooService } from '@/lib/qloo/service';
import { researchEvent } from '@/lib/research/event';
import type { ResearchService } from '@/lib/research/tavily';
import type { Answer, AskRequest, Scene } from '@/types/context';
import { discoverDining, fetchDiningDetails } from './dining';
import { continueArea, discoverArea, discoverMall } from './area';
import { exploreEvent, refreshEventRanking } from './event-ask';
import { asksForAreaDiscovery, asksForDiningDiscovery, explicitlyNearDevice, implicitlyNearDevice, visibleReferences } from './intent';
import { metersBetween, spokenDistance, straightLineKilometers } from '@/lib/location/distance';
import { withinGeojson } from '@/lib/location/geometry';

type Services = { qloo: QlooService; reasoner: SceneReasoningService; research?: ResearchService; places?: PlacesService };
const reply = (answer: string, scene: Scene, confidence: Answer['confidence'] = 'medium'): Answer => ({ answer, scene, confidence });
const recent = (date: string, minutes = 15) => Date.now() - new Date(date).getTime() < minutes * 60_000;
const explicitCalendar = (question: string) => /\b(add|save|create|put)\b.*\bcalendar\b|\bremind me\b/i.test(question);

function reasoningInput(request: AskRequest, services: Services): SceneReasoningInput {
  return { question: request.question, messages: request.messages, scene: request.scene,
    interests: request.profile?.entities.map((item) => ({ id: item.id, name: item.name })) ?? [],
    profileSignature: request.profile?.signature,
    available: { research: Boolean(services.research)
      && !asksForDiningDiscovery(request.question) && !asksForAreaDiscovery(request.question)
      && !(request.scene?.area && !request.scene.event), places: Boolean(services.places),
      qloo: true, calendar: Boolean(request.scene?.event), devicePosition: Boolean(request.position) } };
}
function grounded(answer: string | undefined, ids: string[], input: SceneReasoningInput, scene: Scene): Answer {
  const known = sceneEvidence({ ...input, scene });
  if (!answer || !ids.length || ids.some((id) => !Object.hasOwn(known, id)))
    return reply('I could not support that answer from the information I have. Ask about a specific part of this scene.', scene, 'low');
  return reply(answer, scene);
}
async function answerAfterTool(request: AskRequest, services: Services, scene: Scene, completed: SceneDecision): Promise<Answer> {
  try {
    const input = { ...reasoningInput({ ...request, scene }, services), completed };
    const answer = await services.reasoner.answer(input);
    return grounded(answer.answer, answer.evidenceIds, input, scene);
  } catch { return reply('I checked the available information, but could not form a reliable answer. Please ask a narrower question.', scene, 'low'); }
}

async function placeAnchor(plan: SceneDecision, request: AskRequest, scene: Scene, places?: PlacesService): Promise<PlaceAnchor | undefined> {
  if (plan.anchor === 'device') {
    if (!explicitlyNearDevice(request.question)) {
      const active = scene.area?.anchor ?? scene.dining?.resolvedAnchor;
      if (active && active.kind !== 'device') return active;
      if (scene.event?.visual.venueName) return placeAnchor({ ...plan, anchor: 'event_venue' }, request, scene, places);
    }
    const saved = scene.area?.anchor.kind === 'device' ? scene.area.anchor :
      scene.dining?.resolvedAnchor?.kind === 'device' ? scene.dining.resolvedAnchor : undefined;
    if (!request.position && saved && !explicitlyNearDevice(request.question)) return saved;
    if (!request.locationEnabled || !request.position || (!explicitlyNearDevice(request.question) && !implicitlyNearDevice(request.question))) return undefined;
    return { ...request.position, kind: 'device', name: null, timezone: request.deviceTimeZone ?? null,
      source: 'foreground_location', confidence: null };
  }
  if (plan.anchor === 'event_venue') {
    if (scene.dining?.resolvedAnchor?.kind === 'venue') return scene.dining.resolvedAnchor;
    if (scene.area?.anchor.kind === 'venue') return scene.area.anchor;
    if (!scene.event?.visual.venueName || !places) return undefined;
    const name = scene.event.visual.venueName;
    if (scene.event.place?.latitude !== undefined && scene.event.place.longitude !== undefined)
      return { kind: 'venue', name: scene.event.place.name, placeId: scene.event.place.placeId,
        latitude: scene.event.place.latitude, longitude: scene.event.place.longitude,
        timezone: scene.event.place.timezone ?? null, source: 'event_scene', confidence: null };
    const located = places.resolveAnchor ? await places.resolveAnchor(name, scene.event.visual.locationText, 'venue') : undefined;
    if (located) return { ...located, source: 'event_scene' };
    const legacy = await places.findExact(name, { locality: scene.event.visual.locationText });
    return legacy?.latitude !== undefined && legacy.longitude !== undefined
      ? { kind: 'venue', name: legacy.name, placeId: legacy.placeId, latitude: legacy.latitude,
        longitude: legacy.longitude, timezone: legacy.timezone ?? null, source: 'event_scene', confidence: null } : undefined;
  }
  if (plan.anchor === 'named') {
    const current = scene.area?.anchor ?? scene.dining?.resolvedAnchor;
    if (!plan.anchorName && current?.kind === 'named') return current;
    if (!plan.anchorName || !places?.resolveAnchor) return undefined;
    if (current?.kind === 'named' && current.name?.toLowerCase() === plan.anchorName.toLowerCase()) return current;
    return places.resolveAnchor(plan.anchorName, plan.anchorLocality, 'named');
  }
  return scene.area?.anchor ?? scene.dining?.resolvedAnchor;
}

/** Scene-first Event and place orchestration. Qwen selects evidence needs; code owns provider calls and actions. */
export async function exploreActiveScene(request: AskRequest, services: Services): Promise<Answer> {
  let scene = request.scene!;
  if (scene.event) scene = await refreshEventRanking(scene, request.profile, services.qloo);
  if (scene.dining?.profileSignature && scene.dining.profileSignature !== request.profile?.signature) {
    // Physical identity and address evidence remain valid; only the taste ordering is stale.
    if (!/^\s*(?:is .* open|what (?:is|are) .* hours|where is|what is .* address|phone|how far)/i.test(request.question)
      && scene.dining.resolvedAnchor && request.profile?.entities.length) {
      const anchor = scene.dining.resolvedAnchor;
      return discoverDining(request, services.qloo, { position: { latitude: anchor.latitude, longitude: anchor.longitude },
        source: anchor.kind === 'device' ? { kind: 'device' } : anchor.kind === 'venue'
          ? { kind: 'event_venue', name: anchor.name ?? 'the venue', placeId: anchor.placeId ?? '' }
          : { kind: 'named', name: anchor.name ?? 'the area', placeId: anchor.placeId ?? '' }, resolved: anchor }, scene, services.places);
    }
  }
  if (scene.area?.profileSignature && scene.area.profileSignature !== request.profile?.signature
    && !/^\s*(?:is .* open|what (?:is|are) .* hours|where is|what is .* address|phone|how far)/i.test(request.question)) {
    return discoverArea(request, services.qloo, scene.area.anchor, services.places, scene, scene.area);
  }
  const event = scene.event;
  // An in-progress Calendar confirmation has a deterministic safety path. It must not be reinterpreted as dining.
  if (event?.pendingCalendar || event?.pendingCalendarDetails)
    return exploreEvent({ ...request, scene }, services.qloo, services.research, services.places);

  let plan: SceneDecision;
  try { plan = await services.reasoner.plan(reasoningInput({ ...request, scene }, services)); }
  catch { return reply('I could not interpret that question reliably. Please ask it again more specifically.', scene, 'low'); }
  const input = reasoningInput({ ...request, scene }, services);
  if (plan.scope === 'general') return reply('Please ask about this scene, or capture a new one to change context.', scene, 'low');
  if (plan.scope === 'event' && !scene.event || plan.scope === 'dining' && !scene.dining && plan.next !== 'dining_discovery'
    || plan.scope === 'area' && !scene.area && !['area_discovery', 'mall_discovery', 'practical_lookup'].includes(plan.next))
    return reply('I do not have that part of the scene to answer from.', scene, 'low');
  if (plan.next === 'clarify') return reply(plan.answer ?? 'Which part of this scene do you mean?', scene, 'low');
  if (plan.next === 'answer') return grounded(plan.answer, plan.evidenceIds, input, scene);

  if (plan.next === 'calendar') {
    if (!scene.event || !explicitCalendar(request.question)) return reply('I can add an event only when you explicitly ask me to add it to Calendar.', scene, 'low');
    return exploreEvent({ ...request, scene }, services.qloo, services.research, services.places);
  }
  if (plan.next === 'event_research') {
    if (plan.scope !== 'event' || asksForDiningDiscovery(request.question) || asksForAreaDiscovery(request.question)
      || !scene.event || !plan.researchKind || !services.research)
      return reply('I cannot check current event information right now.', scene, 'low');
    const eventState = scene.event;
    if (!eventState.researchChecks?.some((check) => check.kind === plan.researchKind && recent(check.checkedAt))) {
      try {
        const found = await researchEvent(eventState, plan.researchKind, services.research);
        scene = { ...scene, event: { ...eventState,
          researchedFacts: [...eventState.researchedFacts, ...found.facts].slice(-30),
          verifiedTicketUrl: found.verifiedTicketUrl ?? eventState.verifiedTicketUrl,
          verifiedStart: found.verifiedStart ?? eventState.verifiedStart,
          researchChecks: [...(eventState.researchChecks ?? []), { kind: plan.researchKind, checkedAt: new Date().toISOString() }].slice(-20) } };
      } catch { return reply('I could not verify current event information right now.', scene, 'low'); }
    }
    return answerAfterTool(request, services, scene, plan);
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
    if (plan.anchor === 'device' && explicitlyNearDevice(request.question) && !request.locationEnabled)
      return reply('Turn on Location in Personalization to find restaurants near you.', scene, 'low');
    let anchor: PlaceAnchor | undefined;
    try { anchor = await placeAnchor(plan, request, scene, services.places); }
    catch { return reply('I could not locate that place reliably right now.', scene, 'low'); }
    if (!anchor) return reply(plan.anchor === 'device' ? 'I need foreground location permission to find restaurants near you.'
      : !services.places && plan.anchor === 'event_venue' ? 'I cannot verify the event venue location, and I will not substitute your current location.'
        : 'Which city or neighborhood is that place in? I could not locate it uniquely.', scene, 'low');
    const source = anchor.kind === 'device' ? { kind: 'device' as const } : anchor.kind === 'venue'
      ? { kind: 'event_venue' as const, name: anchor.name ?? 'the venue', placeId: anchor.placeId ?? '' }
      : { kind: 'named' as const, name: anchor.name ?? 'the area', placeId: anchor.placeId ?? '' };
    return discoverDining(request, services.qloo, { position: { latitude: anchor.latitude, longitude: anchor.longitude },
      source, resolved: anchor }, scene, services.places);
  }
  if (plan.next === 'area_discovery') {
    if (plan.anchor === 'device' && explicitlyNearDevice(request.question) && !request.locationEnabled)
      return reply('Turn on Location in Personalization to explore places around you.', scene, 'low');
    let anchor: PlaceAnchor | undefined;
    try { anchor = await placeAnchor(plan, request, scene, services.places); }
    catch { return reply('I could not locate that area reliably right now.', scene, 'low'); }
    if (!anchor) return reply(plan.anchor === 'device' ? 'I need foreground location permission to explore places around you.'
      : 'Which neighborhood or part of the city do you want to explore?', scene, 'low');
    return discoverArea(request, services.qloo, anchor, services.places, scene,
      scene.area?.anchor.latitude === anchor.latitude && scene.area.anchor.longitude === anchor.longitude ? scene.area : undefined);
  }
  if (plan.next === 'mall_discovery') {
    if (!plan.anchorName) return reply('Which mall do you mean?', scene, 'low');
    return discoverMall(request, services.qloo, services.places, plan.anchorName, plan.anchorLocality, scene);
  }
  if (plan.next === 'area_more') return continueArea(request, services.qloo, services.places, scene);
  if (plan.next === 'practical_lookup') {
    const category = { restroom: 'amenity.toilet', atm: 'service.financial.atm',
      pharmacy: 'healthcare.pharmacy' }[plan.practicalCategory ?? 'restroom'];
    if (!services.places?.practicalLookup) return reply('Practical place lookup is unavailable right now.', scene, 'low');
    const scopedPlan = scene.event && !explicitlyNearDevice(request.question) && !plan.anchor
      ? { ...plan, anchor: 'event_venue' as const } : plan;
    const anchor = await placeAnchor(scopedPlan, request, scene, services.places);
    if (!anchor) return reply('I need a location before I can look for that practical place.', scene, 'low');
    try {
      const found = await services.places.practicalLookup(anchor, category);
      const first = found[0];
      if (!first) return reply('I could not find a mapped practical place of that kind nearby.', scene, 'low');
      return reply(`${first.name}${first.address ? ` is at ${first.address}` : ' is mapped nearby'}. This is a practical place lookup, not a personalized recommendation.`, scene);
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
    if (!services.places) return reply(`I found ${target.name} through Qloo, but I cannot verify its address or current details yet.`, scene, 'low');
    try {
      const updated = await fetchDiningDetails(scene, target.qlooId, services.places, plan.detail === 'opening');
      if (!updated) return reply(`I could not uniquely verify practical details for ${target.name}.`, scene, 'low');
      if (plan.detail === 'distance') {
        const place = updated.dining?.places?.find((item) => item.qlooId === target.qlooId)?.details;
        if (place?.latitude !== undefined && place.longitude !== undefined && updated.dining?.position) {
          const km = straightLineKilometers(updated.dining.position, { latitude: place.latitude, longitude: place.longitude });
          return reply(`${place.name} is about ${km} kilometers from ${updated.dining.anchor?.kind === 'event_venue' ? updated.dining.anchor.name : 'you'} in a straight line.${place.address ? ` Its address is ${place.address}.` : ''} This is not a walking route.`, updated);
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
