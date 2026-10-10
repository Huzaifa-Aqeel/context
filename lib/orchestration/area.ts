import type { Answer, AskRequest, Scene } from '@/types/context';
import type { PlaceRecommendation, QlooService } from '@/lib/qloo/service';
import type { MatchOutcome, PlaceAnchor, PlacesService } from '@/lib/places/geoapify';
import { culturalBuckets, geoapifyCategories } from '@/lib/places/qloo-tags';
import { metersBetween, spokenDistance } from '@/lib/location/distance';

const answer = (message: string, scene?: Scene, confidence: Answer['confidence'] = 'medium'): Answer =>
  ({ answer: message, confidence, ...(scene ? { scene } : {}) });

function chooseDiverse(candidates: PlaceRecommendation[], seen: Set<string>, usedBuckets: Set<string>, max: number) {
  const selected: PlaceRecommendation[] = [];
  for (const item of candidates) {
    const bucket = item.bucket ?? 'other';
    if (seen.has(item.qlooId) || usedBuckets.has(bucket)) continue;
    selected.push(item); seen.add(item.qlooId); usedBuckets.add(bucket);
    if (selected.length >= max) break;
  }
  return selected;
}

function placeSentence(candidate: PlaceRecommendation, match: MatchOutcome, anchor: PlaceAnchor,
  request: AskRequest, index: number): string {
  const labels: Record<string, string> = { cafe: 'café', bookstore: 'bookstore', record_store: 'record store',
    museum_gallery: 'museum or gallery', live_music: 'live-music place', park: 'park' };
  const label = candidate.bucket && labels[candidate.bucket] ? `, a ${labels[candidate.bucket]}` : '';
  const point = match.status === 'confirmed' && match.details.latitude !== undefined && match.details.longitude !== undefined
    ? { latitude: match.details.latitude, longitude: match.details.longitude }
    : candidate.latitude !== undefined && candidate.longitude !== undefined
      ? { latitude: candidate.latitude, longitude: candidate.longitude } : undefined;
  const distance = point ? ` ${spokenDistance(metersBetween(anchor, point), request.locale)}${match.status === 'unverified' ? ' based on Qloo location data' : ''}` : '';
  const interest = index === 0 ? candidate.contributingInterestIds.flatMap((id) =>
    request.profile?.entities.find((item) => item.id === id)?.name ?? [])[0] : undefined;
  return `${candidate.name}${label}${distance}${interest ? `, with ${interest} among the interests contributing to the recommendation` : ''}.`;
}

export async function discoverArea(request: AskRequest, qloo: QlooService, anchor: PlaceAnchor,
  places?: PlacesService, baseScene?: Scene, prior?: Scene['area']): Promise<Answer> {
  if (!request.profile?.entities.length) return answer('Set up at least one matched interest to get personalized nearby places.', baseScene, 'low');
  if (!qloo.discoverArea) return answer('Personalized area discovery is unavailable right now.', baseScene, 'low');
  let candidates: PlaceRecommendation[] = [];
  let radius: 800 | 2000 = 800;
  try {
    candidates = await qloo.discoverArea(anchor, request.profile.entities, { device: anchor.kind === 'device', radiusMeters: 800 });
    if (!candidates.length) {
      radius = 2000;
      candidates = await qloo.discoverArea(anchor, request.profile.entities, { device: anchor.kind === 'device', radiusMeters: 2000 });
    }
  } catch { return answer('I could not check Qloo for personalized places nearby right now.', baseScene, 'low'); }
  if (!candidates.length) return answer('I could not find a personalized cultural place match near this location.', baseScene, 'low');

  const topUps: Record<string, PlaceRecommendation[]> = {};
  const seen = new Set<string>(); const buckets = new Set<string>();
  let pool = chooseDiverse(candidates, seen, buckets, 3);
  if (pool.length < 3) {
    for (const config of culturalBuckets) {
      if (Object.keys(topUps).length >= 2 || pool.length >= 3) break;
      if (buckets.has(config.bucket)) continue;
      try {
        const extra = await qloo.discoverArea(anchor, request.profile.entities,
          { device: anchor.kind === 'device', radiusMeters: radius, bucket: config.bucket, take: 5 });
        topUps[config.bucket] = extra;
        pool = [...pool, ...chooseDiverse(extra.filter((item) => item.bucket === config.bucket), seen, buckets, 3 - pool.length)];
      } catch { /* A failed top-up leaves the union ranking useful. */ }
    }
  }
  // Geoapify may reject an identity; continue through the existing Qloo order without reranking it.
  // Keep the union-query order, but do not let a long run of one category prevent
  // already-fetched diversity top-ups from reaching the bounded identity check.
  const inspectedByBucket = new Map<string, number>();
  const unionToCheck = candidates.filter((item) => {
    const bucket = item.bucket ?? 'other';
    const count = inspectedByBucket.get(bucket) ?? 0;
    if (count >= 3) return false;
    inspectedByBucket.set(bucket, count + 1);
    return true;
  });
  const ordered = [...unionToCheck, ...Object.values(topUps).flat()];
  const matches = [...(prior?.matches ?? [])];
  const selected: { item: PlaceRecommendation; match: MatchOutcome }[] = [];
  const selectedBuckets = new Set<string>();
  for (const item of ordered.slice(0, 12)) {
    if (selected.length >= 3) break;
    const bucket = item.bucket ?? 'other';
    if (selectedBuckets.has(bucket) || ordered.findIndex((other) => other.qlooId === item.qlooId) !== ordered.indexOf(item)) continue;
    const cached = matches.find((entry) => entry.qlooId === item.qlooId);
    let match: MatchOutcome = cached?.status === 'confirmed' && cached.details
      ? { status: 'confirmed', details: cached.details }
      : { status: cached?.status === 'ambiguous_or_contradictory' ? 'ambiguous_or_contradictory' : 'unverified' };
    if (!cached && places?.matchCandidate) {
      try { match = await places.matchCandidate({ name: item.name,
        ...(item.latitude !== undefined && item.longitude !== undefined
          ? { position: { latitude: item.latitude, longitude: item.longitude } } : {}), city: item.city },
        geoapifyCategories(bucket)); }
      catch { match = { status: 'unverified' }; }
      matches.push({ qlooId: item.qlooId, status: match.status,
        ...(match.status === 'confirmed' ? { details: match.details } : {}), checkedAt: new Date().toISOString() });
    }
    if (match.status === 'ambiguous_or_contradictory') continue;
    selectedBuckets.add(bucket);
    selected.push({ item, match });
  }
  if (!selected.length) return answer('I found personalized places in this area, but could not verify their identities confidently enough to recommend one.', baseScene, 'low');
  let orientation = prior?.orientation ?? null;
  if (!orientation && anchor.kind === 'device' && !anchor.name && places?.reverse) {
    try { const result = await places.reverse(anchor); orientation = { street: result.street, neighborhood: result.neighborhood, city: result.city }; }
    catch { /* Orientation is optional; Qloo recommendations survive. */ }
  }
  const location = orientation ? [orientation.street, orientation.neighborhood ?? orientation.city].filter(Boolean).join(' in ') : '';
  const intro = anchor.name ? `Near ${anchor.name}, ` : location && anchor.kind === 'device' ? `You're near ${location}. ` : '';
  const names = selected.map(({ item, match }, index) => placeSentence(item, match, anchor, request, index));
  const practicalCaveat = selected.every(({ match }) => match.status === 'unverified')
    ? ' I could not verify practical place details right now.' : '';
  const spoken = `${intro}${selected.length === 1 ? 'One place stands out for you nearby.' : `${selected.length} places stand out for you nearby.`} ${names.join(' ')}${radius === 2000 ? ' These are in a wider two-kilometre area.' : ''}${practicalCaveat}`;
  const scene: Scene = { ...(baseScene ?? { origin: 'conversation', id: crypto.randomUUID(),
    createdAt: new Date().toISOString(), confidence: 'medium' as const,
    culturalEvidence: { entities: [], relationships: [], themes: [], confidence: 0 } }),
    summary: baseScene?.summary ?? spoken,
    area: { anchor, profileSignature: request.profile.signature, qlooUnionResults: candidates.slice(0, 30),
      qlooTopUpResults: topUps, presentedIds: selected.map(({ item }) => item.qlooId),
      matches, orientation, createdAt: new Date().toISOString(), walk10Geometry: prior?.walk10Geometry } };
  return answer(spoken, scene);
}

export async function continueArea(request: AskRequest, qloo: QlooService, places: PlacesService | undefined,
  scene: Scene): Promise<Answer> {
  if (!scene.area) return answer('I need an area search first.', scene, 'low');
  const state = scene.area;
  const extras = { ...state.qlooTopUpResults };
  let available = [...state.qlooUnionResults, ...Object.values(extras).flat()]
    .filter((item) => !state.presentedIds.includes(item.qlooId)
      && !state.matches.some((entry) => entry.qlooId === item.qlooId && entry.status === 'ambiguous_or_contradictory'));
  if (!available.length && qloo.discoverArea && request.profile?.entities.length) {
    for (const config of culturalBuckets) {
      if (Object.keys(extras).length >= 2 || available.length) break;
      if (Object.hasOwn(extras, config.bucket)) continue;
      try {
        extras[config.bucket] = await qloo.discoverArea(state.anchor, request.profile.entities,
          { device: state.anchor.kind === 'device', radiusMeters: state.qlooUnionResults[0]?.radiusMeters === 2000 ? 2000 : 800,
            bucket: config.bucket, take: 5 });
        available = extras[config.bucket].filter((item) => !state.presentedIds.includes(item.qlooId));
      } catch { extras[config.bucket] = []; }
    }
  }
  const matches = [...state.matches];
  for (const item of available) {
    const previous = matches.find((entry) => entry.qlooId === item.qlooId);
    let match: MatchOutcome = previous?.status === 'confirmed' && previous.details
      ? { status: 'confirmed', details: previous.details }
      : { status: previous?.status === 'ambiguous_or_contradictory' ? 'ambiguous_or_contradictory' : 'unverified' };
    if (!previous && places?.matchCandidate) {
      try { match = await places.matchCandidate({ name: item.name,
        ...(item.latitude !== undefined && item.longitude !== undefined
          ? { position: { latitude: item.latitude, longitude: item.longitude } } : {}), city: item.city },
        geoapifyCategories(item.bucket ?? 'other')); }
      catch { match = { status: 'unverified' }; }
      matches.push({ qlooId: item.qlooId, status: match.status,
        ...(match.status === 'confirmed' ? { details: match.details } : {}), checkedAt: new Date().toISOString() });
    }
    if (match.status === 'ambiguous_or_contradictory') continue;
    return answer(placeSentence(item, match, state.anchor, request, 1), { ...scene,
      area: { ...state, qlooTopUpResults: extras, matches, presentedIds: [...state.presentedIds, item.qlooId] } });
  }
  return answer('I do not have another Qloo-ranked place from this area yet.',
    { ...scene, area: { ...state, qlooTopUpResults: extras, matches } }, 'low');
}
