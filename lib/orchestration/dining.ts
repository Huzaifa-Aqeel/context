import type { QlooService, PlaceRecommendation } from '@/lib/qloo/service';
import type { PlaceAnchor, PlacesService } from '@/lib/places/geoapify';
import type { Answer, AskRequest, PlaceDetails, Scene } from '@/types/context';
import { isDiningComparisonRequest, asksForDiningDiscovery, asksForDiningPlaceDetails, explicitlyNamedPlace } from './intent';
import { metersBetween, spokenDistance, straightLineKilometers } from '@/lib/location/distance';

function reply(answer: string, scene?: Scene, confidence: Answer['confidence'] = 'medium'): Answer {
  return { answer, confidence, ...(scene ? { scene } : {}) };
}

type DiningAnchor = { kind: 'device' } | { kind: 'named'; name: string; placeId: string };

function firstContributor(candidate: PlaceRecommendation, request: AskRequest): string | undefined {
  return candidate.contributingInterestIds.flatMap((id) => request.profile?.entities.find((item) => item.id === id)?.name ?? [])[0];
}
function qlooDiningKind(candidate: PlaceRecommendation): string | undefined {
  const cuisine = candidate.cuisineTags.find((tag) => !/^(restaurant|dining place)$/i.test(tag));
  const category = candidate.restaurantCategory && !/^restaurant$/i.test(candidate.restaurantCategory)
    ? candidate.restaurantCategory.toLowerCase() : 'restaurant';
  return cuisine && !category.includes(cuisine.toLowerCase()) ? `${cuisine} ${category}` : cuisine ?? category;
}
function qlooDistance(candidate: PlaceRecommendation, anchor: PlaceAnchor): number | undefined {
  // The Insights distance is measured from the rounded Qloo query point for device anchors.
  // Recompute from cached Qloo coordinates and the full-precision foreground position when possible.
  if (candidate.latitude !== undefined && candidate.longitude !== undefined)
    return metersBetween(anchor, { latitude: candidate.latitude, longitude: candidate.longitude });
  return candidate.distanceMeters;
}
export function qlooDetailAnswer(candidate: PlaceRecommendation, detail: string | undefined, anchor: PlaceAnchor | undefined,
  locale: string | undefined): string | undefined {
  if (detail === 'cuisine' && (candidate.cuisineTags.length || candidate.restaurantCategory && !/^restaurant$/i.test(candidate.restaurantCategory)))
    return `${candidate.name} is listed as ${indefinite(qlooDiningKind(candidate)!)} ${qlooDiningKind(candidate)}.`;
  if (detail === 'address' && candidate.address) return `${candidate.name} is listed at ${candidate.address}.`;
  if (detail === 'phone' && candidate.phone) return `${candidate.name}'s listed phone number is ${candidate.phone}.`;
  if (detail === 'rating' && candidate.businessRating !== undefined)
    return `Qloo lists a business rating of ${candidate.businessRating.toFixed(1)} out of 5 for ${candidate.name}.`;
  if (detail === 'distance' && anchor) {
    const distance = qlooDistance(candidate, anchor);
    if (distance !== undefined) return `${candidate.name} is ${spokenDistance(distance, locale)} in a straight line from ${anchor.name ?? 'you'}, based on Qloo location data.`;
  }
  return undefined;
}
export function diningKind(details: PlaceDetails | undefined): string | undefined {
  if (!details) return undefined;
  const categories = details.categories ?? [];
  const kind = ['restaurant', 'cafe', 'fast_food', 'food_court', 'pub', 'bar']
    .find((category) => categories.includes(`catering.${category}`));
  const label = { restaurant: 'restaurant', cafe: 'café', fast_food: 'fast-food place',
    food_court: 'food court', pub: 'pub', bar: 'bar' }[kind ?? ''] ?? (categories.includes('catering') ? 'dining place' : undefined);
  const cuisine = details.cuisine?.replace(/[;_]+/g, ', ').trim();
  return cuisine ? `${cuisine} ${label ?? 'dining place'}` : label;
}
const indefinite = (word: string) => /^[aeiou]/i.test(word) ? 'an' : 'a';
export function describeCandidate(candidate: PlaceRecommendation, request: AskRequest, anchor: PlaceAnchor,
  primary: boolean): string {
  const taste = firstContributor(candidate, request);
  const kind = qlooDiningKind(candidate);
  const distance = qlooDistance(candidate, anchor);
  const parts = [primary ? `${candidate.name} ranks highest for your saved interests` : `${candidate.name} is another Qloo-ranked option`];
  if (kind) parts.push(`${indefinite(kind)} ${kind}`);
  if (distance !== undefined) parts.push(`${spokenDistance(distance, request.locale)} in a straight line`);
  if (candidate.address) parts.push(`at ${candidate.address}`);
  else if (candidate.city) parts.push(`in ${candidate.city}`);
  if (candidate.businessRating !== undefined) parts.push(`Qloo lists a business rating of ${candidate.businessRating.toFixed(1)} out of 5`);
  const reason = taste ? `with ${taste} among the interests contributing to the recommendation`
    : 'ranked by Qloo for your saved interests; no individual contributing interest was provided';
  return `${parts.join(', ')}, ${reason}.`;
}

/** The anchor position belongs only to active scene memory; it is never saved in preferences. */
export async function discoverDining(request: AskRequest, qloo: QlooService,
  anchor: { position: { latitude: number; longitude: number }; source: DiningAnchor; resolved?: PlaceAnchor },
  baseScene?: Scene): Promise<Answer> {
  if (!request.profile?.entities.length) return reply('Set up at least one matched interest before finding dining places.', baseScene, 'low');
  if (!qloo.recommendDining) return reply('Nearby dining is unavailable right now.', baseScene, 'low');
  let candidates;
  try { candidates = await qloo.recommendDining(anchor.position, request.profile.entities,
    { device: anchor.source.kind === 'device' }); }
  catch { return reply('I could not check Qloo for nearby dining places right now. Please try again.', baseScene, 'low'); }
  if (!candidates.length) return reply('I could not find a Qloo-supported nearby dining place that fits your interests.', baseScene, 'low');
  const resolvedAnchor: PlaceAnchor = anchor.resolved ?? {
    ...anchor.position, kind: anchor.source.kind,
    name: 'name' in anchor.source ? anchor.source.name : null,
    placeId: 'placeId' in anchor.source ? anchor.source.placeId : undefined,
    timezone: anchor.source.kind === 'device' ? request.deviceTimeZone ?? null : null,
    source: anchor.source.kind === 'device' ? 'foreground_location' : 'geoapify_geocode', confidence: null,
  };
  const selected = candidates.slice(0, 6);
  const area = resolvedAnchor.name ? `Near ${resolvedAnchor.name}`
    : anchor.source.kind === 'device' ? 'Near you' : `Near ${anchor.source.name}`;
  const spoken = `${area}, ${selected.map((candidate, index) => describeCandidate(candidate, request, resolvedAnchor, index === 0)).join(' ')}${candidates[0].radiusMeters === 5000 ? ' These are in a wider five-kilometre area.' : ''}`;
  const scene: Scene = { ...(baseScene ?? { origin: 'conversation', id: crypto.randomUUID(), createdAt: new Date().toISOString(),
    confidence: 'medium' as const, culturalEvidence: { entities: [], relationships: [], themes: [], confidence: 0 } }),
    summary: baseScene?.summary ?? spoken,
    dining: { candidates, selectedIds: selected.map((item) => item.qlooId), matches: [], places: [],
      discoveredAt: new Date().toISOString(), position: anchor.position,
      resolvedAnchor,
      anchor: anchor.source.kind === 'named' ? undefined : anchor.source,
      profileSignature: request.profile.signature } };
  return reply(spoken, scene);
}

export async function fetchDiningDetails(scene: Scene, targetId: string, places?: PlacesService, refreshOpening = false): Promise<Scene | undefined> {
  const target = scene.dining?.candidates.find((candidate) => candidate.qlooId === targetId);
  if (!target) return undefined;
  const previous = scene.dining?.places?.find((item) => item.qlooId === targetId)?.details;
  if (previous && (!refreshOpening || Date.now() - new Date(previous.checkedAt).getTime() <= 15 * 60_000)) return scene;
  if (!places) return undefined;
  const match = places.matchCandidate
    ? await places.matchCandidate({ name: target.name,
      ...(target.latitude !== undefined && target.longitude !== undefined ? { position: { latitude: target.latitude, longitude: target.longitude } } : {}),
      city: target.city }, ['catering']) : undefined;
  const details = match ? match.status === 'confirmed' ? match.details : undefined
    : await places.findExact(target.name, { position: scene.dining?.position,
      requireDining: true, maxDistanceMeters: target.radiusMeters });
  if (!details) return undefined;
  const others = (scene.dining?.places ?? []).filter((item) => item.qlooId !== targetId);
  return { ...scene, dining: { ...scene.dining!, places: [...others, { qlooId: targetId, details }] } };
}

/** Compatibility path for direct deterministic calls; production Ask uses the structured scene planner. */
export async function exploreDining(request: AskRequest, qloo: QlooService, places?: PlacesService): Promise<Answer> {
  if (asksForDiningDiscovery(request.question)) {
    if (!request.locationEnabled) return reply('Turn on Location in Personalization to find restaurants near you.', undefined, 'low');
    const named = explicitlyNamedPlace(request.question)
      ? request.question.replace(/[.!?]+$/, '').match(/\b(?:near|around|in)\s+(?:the\s+)?(.+)$/i) : null;
    if (named) {
      const resolved = await places?.resolveAnchor?.(named[1], undefined, 'named').catch(() => undefined);
      if (!resolved) return reply(`I could not locate ${named[1]} confidently enough to search near it.`, undefined, 'low');
      return discoverDining(request, qloo, { position: { latitude: resolved.latitude, longitude: resolved.longitude },
        source: { kind: 'named', name: resolved.name ?? named[1], placeId: resolved.placeId ?? '' }, resolved });
    }
    if (!request.position) return reply('I need foreground location permission to find restaurants near you. Enable it and ask again.', undefined, 'low');
    return discoverDining(request, qloo, { position: request.position, source: { kind: 'device' } });
  }
  if (isDiningComparisonRequest(request.question) && request.scene?.dining)
    return reply('I do not compare dining recommendations. Ask about one recommended place’s cuisine, address, distance, business rating, phone number, or opening hours instead.', request.scene, 'low');
  if (!asksForDiningPlaceDetails(request.question)) return reply('For dining, ask for restaurants or bars near you or a named place, or ask for one recommended place’s details.', request.scene, 'low');
  const scene = request.scene;
  const candidates = scene?.dining?.candidates ?? [];
  if (!candidates.length) return reply('Ask me to find a nearby restaurant first.', scene, 'low');
  const named = candidates.filter((candidate) => request.question.toLowerCase().includes(candidate.name.toLowerCase()));
  const target = named[0] ?? (candidates.length === 1 || /\b(first|top|primary|best match)\b/i.test(request.question) ? candidates[0]
    : /\b(second|alternative|other)\b/i.test(request.question) ? candidates[1] : undefined);
  if (!target) return reply('Which dining place do you mean?', scene, 'low');
  const detail = /\b(cuisine|kind of food|category|kind of place)\b/i.test(request.question) ? 'cuisine'
    : /\b(address|where)\b/i.test(request.question) ? 'address'
      : /\b(phone|number)\b/i.test(request.question) ? 'phone'
        : /\b(how far|distance)\b/i.test(request.question) ? 'distance'
          : /\b(rating|stars?)\b/i.test(request.question) ? 'rating' : undefined;
  const fromQloo = qlooDetailAnswer(target, detail, scene?.dining?.resolvedAnchor, request.locale);
  if (fromQloo) return reply(fromQloo, scene);
  if (detail === 'rating') return reply(`I could not verify a business rating for ${target.name}.`, scene, 'low');
  if (/\b(open|hours|address|phone|number|accessible|accessibility|take me|directions|navigate|where|how far|distance|cuisine|kind of food|category|kind of place)\b/i.test(request.question)) {
    if (/\b(accessible|accessibility)\b/i.test(request.question)) return reply(`I do not have verified accessibility details for ${target.name}.`, scene, 'low');
    if (!places) return reply(`I found ${target.name} through Qloo, but I cannot verify its address or current details yet. Context does not open maps.`, scene, 'low');
    let details = scene!.dining!.places?.find((item) => item.qlooId === target.qlooId)?.details;
    const staleHours = /\b(open|hours)\b/i.test(request.question) && details && Date.now() - new Date(details.checkedAt).getTime() > 15 * 60_000;
    if (!details || staleHours) {
      try { details = await places.findExact(target.name, { position: scene!.dining!.position,
        requireDining: true, maxDistanceMeters: target.radiusMeters }); }
      catch { return reply(`I could not verify practical details for ${target.name} right now.`, scene, 'low'); }
    }
    if (!details) return reply(`I could not uniquely verify an address for ${target.name}.`, scene, 'low');
    const others = (scene!.dining!.places ?? []).filter((item) => item.qlooId !== target.qlooId);
    const nextScene = { ...scene!, dining: { ...scene!.dining!, places: [...others, { qlooId: target.qlooId, details }] } };
    if (/\b(cuisine|kind of food|category|kind of place)\b/i.test(request.question)) return reply(diningKind(details)
      ? `${details.name} is listed as ${indefinite(diningKind(details)!)} ${diningKind(details)}.`
      : `I could not verify the cuisine or restaurant category for ${details.name}.`, nextScene);
    if (/\b(phone|number)\b/i.test(request.question)) return reply(details.phone ? `${details.name}'s listed phone number is ${details.phone}.` : `I could not verify a phone number for ${details.name}.`, nextScene, details.phone ? 'high' : 'low');
    if (/\b(open|hours)\b/i.test(request.question)) return reply(details.openNow === undefined ? `I could not verify whether ${details.name} is open now.` : `${details.name} is listed as ${details.openNow ? 'open' : 'closed'} right now.`, nextScene, details.openNow === undefined ? 'low' : 'medium');
    if (/\b(how far|distance)\b/i.test(request.question) && scene!.dining!.position && details.latitude !== undefined && details.longitude !== undefined) {
      const km = straightLineKilometers(scene!.dining!.position, { latitude: details.latitude, longitude: details.longitude });
      return reply(`${details.name} is about ${km} kilometers away in a straight line.${details.address ? ` Its address is ${details.address}.` : ''} This is not a walking route.`, nextScene);
    }
    return reply(details.address ? `${details.name} is at ${details.address}. You can enter that address in your own map; Context does not open maps.`
      : `I could not verify an address for ${details.name}.`, nextScene, details.address ? 'high' : 'low');
  }
  return reply(`I could not verify that practical detail for ${target.name}.`, scene, 'low');
}
