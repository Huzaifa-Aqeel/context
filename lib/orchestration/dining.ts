import type { QlooService, PlaceRecommendation } from '@/lib/qloo/service';
import type { PlaceAnchor, PlacesService, MatchOutcome } from '@/lib/places/geoapify';
import type { Answer, AskRequest, Scene } from '@/types/context';
import { asksForDiningDiscovery } from './intent';
import { metersBetween, spokenDistance, straightLineKilometers } from '@/lib/location/distance';
import { instantForWallTime, openingStatusAt, wallTime } from '@/lib/places/opening-hours';

function reply(answer: string, scene?: Scene, confidence: Answer['confidence'] = 'medium'): Answer {
  return { answer, confidence, ...(scene ? { scene } : {}) };
}

type DiningAnchor = { kind: 'device' } | { kind: 'event_venue'; name: string; placeId: string } | { kind: 'named'; name: string; placeId: string };

type DiningTime = { context: NonNullable<Scene['dining']>['timeContext']; checkedAt?: Date;
  label?: string; unresolved?: string };
function diningTime(request: AskRequest, anchor: PlaceAnchor, scene?: Scene): DiningTime {
  const timezone = anchor.timezone ?? (anchor.kind === 'device' ? request.deviceTimeZone : undefined);
  const before = /\bbefore (?:the |this )?(?:show|concert|event)\b/i.test(request.question);
  const after = /\bafter (?:the |this )?(?:show|concert|event)\b/i.test(request.question);
  const time = /\b(?:at|around)\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\b/i.exec(request.question);
  const eventStart = scene?.event?.verifiedStart?.start ?? null;
  const base = timezone ? before ? { kind: 'before_event' as const, eventStart,
    requestedDiningTime: null, timezone } : after ? { kind: 'after_event' as const,
    eventEnd: null, requestedDiningTime: null, timezone } : { kind: 'now' as const, timezone } : undefined;
  if (!time) return { context: base,
    ...(/\bnow\b/i.test(request.question) && timezone ? { checkedAt: new Date(), label: 'right now' } : {}) };
  const label = time[0].replace(/^\s*(?:at|around)\s+/i, '').trim();
  if (!timezone) return { context: base, unresolved: `I cannot confirm opening at ${label} without the place's timezone.` };
  let hour = Number(time[1]); const minute = Number(time[2] ?? 0);
  if (hour < 1 || hour > 12 || minute > 59) return { context: base, unresolved: 'Please give a valid meal time.' };
  const meridiem = time[3]?.replace(/\./g, '').toLowerCase();
  const eventWall = eventStart ? wallTime(new Date(eventStart), timezone) : undefined;
  if (meridiem === 'pm') hour = hour % 12 + 12;
  else if (meridiem === 'am') hour %= 12;
  else if (/\bdinner\b/i.test(request.question) || before && eventWall && eventWall.hour >= 12 && hour < eventWall.hour)
    hour = hour % 12 + 12;
  else return { context: base, unresolved: `Do you mean ${label} AM or PM? I have not checked opening at that time.` };
  if ((before || after) && !eventWall)
    return { context: base, unresolved: `I have not confirmed the event date, so opening at ${label} remains unknown.` };
  const nowWall = wallTime(new Date(), timezone);
  const date = before || after ? eventWall : nowWall;
  if (!date) return { context: base, unresolved: `I cannot establish the date for ${label}.` };
  const targetDate = /\btomorrow\b/i.test(request.question) && !before && !after
    ? new Date(Date.UTC(date.year, date.month - 1, date.day + 1)) : undefined;
  const wallDate = targetDate ? { year: targetDate.getUTCFullYear(), month: targetDate.getUTCMonth() + 1,
    day: targetDate.getUTCDate() } : date;
  const instant = instantForWallTime(wallDate, hour, minute, timezone);
  if (!instant) return { context: base, unresolved: `I could not establish ${label} in the place's timezone.` };
  const iso = instant.toISOString();
  return { checkedAt: instant, label,
    context: before ? { kind: 'before_event', eventStart, requestedDiningTime: iso, timezone }
      : after ? { kind: 'after_event', eventEnd: null, requestedDiningTime: iso, timezone }
        : { kind: 'requested', timestamp: iso, timezone } };
}

function diningOpeningNote(selected: { candidate: PlaceRecommendation; match: MatchOutcome }[], time: DiningTime): string {
  if (time.unresolved) return ` ${time.unresolved}`;
  if (!time.checkedAt || !time.label || !time.context) return '';
  const statements = selected.map(({ candidate, match }) => {
    const status = match.status === 'confirmed'
      ? openingStatusAt(match.details.openingHours, time.checkedAt!, time.context!.timezone) : undefined;
    return status === undefined ? `${candidate.name}'s opening at ${time.label} is unconfirmed`
      : `${candidate.name} is listed as ${status ? 'open' : 'closed'} at ${time.label}`;
  });
  return ` ${statements.join('. ')}.`;
}

function firstContributor(candidate: PlaceRecommendation, request: AskRequest): string | undefined {
  return candidate.contributingInterestIds.flatMap((id) => request.profile?.entities.find((item) => item.id === id)?.name ?? [])[0];
}
function describeCandidate(candidate: PlaceRecommendation, request: AskRequest, anchor: PlaceAnchor,
  match: MatchOutcome, primary: boolean, highestRanked = true): string {
  const taste = firstContributor(candidate, request);
  const opening = primary ? highestRanked ? `${candidate.name} ranks highest for you`
    : `${candidate.name} is a Qloo match for you` : `Another option is ${candidate.name}`;
  const attribution = taste ? `, with ${taste} among the interests contributing to the recommendation` : '';
  const position = match.status === 'confirmed' && match.details.latitude !== undefined && match.details.longitude !== undefined
    ? { latitude: match.details.latitude, longitude: match.details.longitude }
    : candidate.latitude !== undefined && candidate.longitude !== undefined
      ? { latitude: candidate.latitude, longitude: candidate.longitude } : undefined;
  const distance = position ? ` It's ${spokenDistance(metersBetween(anchor, position), request.locale)}${match.status === 'unverified' ? ' based on Qloo location data' : ''}` : '';
  const address = match.status === 'confirmed' && match.details.address ? ` at ${match.details.address}` : '';
  const unavailable = primary && match.status === 'unverified' ? ' I could not confirm its address or hours.' : '';
  return `${opening}${attribution}.${distance}${address ? `${address}.` : distance ? '.' : ''}${unavailable}`;
}

/** The anchor position belongs only to active scene memory; it is never saved in preferences. */
export async function discoverDining(request: AskRequest, qloo: QlooService,
  anchor: { position: { latitude: number; longitude: number }; source: DiningAnchor; resolved?: PlaceAnchor },
  baseScene?: Scene, places?: PlacesService): Promise<Answer> {
  if (!request.profile?.entities.length) return reply('Set up at least one matched interest before finding dining places.', baseScene, 'low');
  if (!qloo.recommendDining) return reply('Nearby dining is unavailable right now.', baseScene, 'low');
  const eventSignalId = /\b(suits?|fits?) (?:the |tonight.?s )?(?:show|concert|event)\b/i.test(request.question)
    && baseScene?.event?.visual.performers.length === 1 ? baseScene.event.ranking[0]?.entityId : undefined;
  let candidates;
  try { candidates = await qloo.recommendDining(anchor.position, request.profile.entities,
    { device: anchor.source.kind === 'device', extraSignalId: eventSignalId }); }
  catch { return reply('I could not check Qloo for nearby dining places right now. Please try again.', baseScene, 'low'); }
  if (!candidates.length) return reply('I could not find a Qloo-supported nearby dining place that fits your interests.', baseScene, 'low');
  const resolvedAnchor: PlaceAnchor = anchor.resolved ?? {
    ...anchor.position, kind: anchor.source.kind === 'event_venue' ? 'venue' : anchor.source.kind,
    name: 'name' in anchor.source ? anchor.source.name : null,
    placeId: 'placeId' in anchor.source ? anchor.source.placeId : undefined,
    timezone: anchor.source.kind === 'device' ? request.deviceTimeZone ?? null : null,
    source: anchor.source.kind === 'device' ? 'foreground_location' : 'geoapify_geocode', confidence: null,
  };
  const matches: { qlooId: string; status: MatchOutcome['status']; details?: Extract<MatchOutcome, { status: 'confirmed' }>['details']; checkedAt: string }[] = [];
  const selected: { candidate: PlaceRecommendation; match: MatchOutcome }[] = [];
  for (const candidate of candidates.slice(0, 5)) {
    const previous = baseScene?.dining?.matches?.find((item) => item.qlooId === candidate.qlooId);
    let match: MatchOutcome = previous?.status === 'confirmed' && previous.details
      ? { status: 'confirmed', details: previous.details }
      : { status: previous?.status === 'ambiguous_or_contradictory' ? 'ambiguous_or_contradictory' : 'unverified' };
    if (!previous && places?.matchCandidate) {
      try { match = await places.matchCandidate({ name: candidate.name,
        ...(candidate.latitude !== undefined && candidate.longitude !== undefined
          ? { position: { latitude: candidate.latitude, longitude: candidate.longitude } } : {}),
        city: candidate.city }, ['catering']); }
      catch { match = { status: 'unverified' }; }
    }
    matches.push({ qlooId: candidate.qlooId, status: match.status,
      ...(match.status === 'confirmed' ? { details: match.details } : {}), checkedAt: new Date().toISOString() });
    if (match.status !== 'ambiguous_or_contradictory') selected.push({ candidate, match });
    if (selected.length === 2) break;
  }
  if (!selected.length) return reply('I found personalized restaurant matches in this area, but I could not verify their real-world identities confidently enough to give you a reliable place.', baseScene, 'low');
  const area = anchor.source.kind === 'device' ? 'Near you' : `Near ${anchor.source.name}`;
  const time = diningTime(request, resolvedAnchor, baseScene);
  const answer = `${area}, ${describeCandidate(selected[0].candidate, request, resolvedAnchor, selected[0].match, true,
    selected[0].candidate.qlooId === candidates[0].qlooId)}${selected[1] ? ` ${describeCandidate(selected[1].candidate, request, resolvedAnchor, selected[1].match, false)}` : ''}${candidates[0].radiusMeters === 5000 ? ' These are in a wider five-kilometre area.' : ''}${diningOpeningNote(selected, time)}${!time.checkedAt && !time.unresolved && /\bafter (?:the |this )?(?:show|concert|event)\b/i.test(request.question) && !baseScene?.event?.visual.endTimeText ? ' I cannot confirm after-show opening without a show end time.' : !time.checkedAt && !time.unresolved && /\bbefore (?:the |this )?(?:show|concert|event)\b/i.test(request.question) ? ' I have not assumed an exact meal time, so opening then is unconfirmed.' : ''}`;
  const spoken = `${answer}${eventSignalId ? ' I also factored in the performer named on this event material.' : ''}`;
  const scene: Scene = { ...(baseScene ?? { origin: 'conversation', id: crypto.randomUUID(), createdAt: new Date().toISOString(),
    confidence: 'medium' as const, culturalEvidence: { entities: [], relationships: [], themes: [], confidence: 0 } }),
    summary: baseScene?.summary ?? spoken,
    dining: { candidates, selectedIds: selected.map((item) => item.candidate.qlooId), matches,
      places: matches.flatMap((item) => item.details ? [{ qlooId: item.qlooId, details: item.details }] : []),
      discoveredAt: new Date().toISOString(), position: anchor.position,
      resolvedAnchor, timeContext: time.context,
      anchor: anchor.source.kind === 'named' ? undefined : anchor.source,
      profileSignature: request.profile.signature } };
  return reply(spoken, scene);
}

export async function fetchDiningDetails(scene: Scene, targetId: string, places?: PlacesService, refreshOpening = false): Promise<Scene | undefined> {
  const target = scene.dining?.candidates.find((candidate) => candidate.qlooId === targetId);
  if (!target || !places) return undefined;
  const previous = scene.dining?.places?.find((item) => item.qlooId === targetId)?.details;
  if (previous && (!refreshOpening || Date.now() - new Date(previous.checkedAt).getTime() <= 15 * 60_000)) return scene;
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
    if (!request.position) return reply('I need foreground location permission to find restaurants near you. Enable it and ask again.', undefined, 'low');
    return discoverDining(request, qloo, { position: request.position, source: { kind: 'device' } });
  }
  const scene = request.scene;
  if (scene?.dining?.profileSignature && scene.dining.profileSignature !== request.profile?.signature)
    return reply('Your interests changed. Ask me to find nearby dining again for your current profile.', scene, 'low');
  const candidates = scene?.dining?.candidates ?? [];
  if (!candidates.length) return reply('Ask me to find a nearby restaurant first.', scene, 'low');
  const named = candidates.filter((candidate) => request.question.toLowerCase().includes(candidate.name.toLowerCase()));
  const target = named[0] ?? (candidates.length === 1 || /\b(first|top|primary|best match)\b/i.test(request.question) ? candidates[0]
    : /\b(second|alternative|other)\b/i.test(request.question) ? candidates[1] : undefined);
  if (/\b(which|what)\b.*\b(recommend|suggest|found|options?|places?)\b/i.test(request.question))
    return reply(`I found ${candidates.map((candidate) => candidate.name).join(' and ')} through Qloo.`, scene);
  if (!target) return reply('Which dining place do you mean?', scene, 'low');
  if (/\b(why|fit|interest|relevant)\b/i.test(request.question)) {
    const interests = target.contributingInterestIds.flatMap((id) => request.profile?.entities.find((item) => item.id === id)?.name ?? []);
    return reply(interests.length
      ? `Qloo ranks ${target.name} for your profile, with ${interests.slice(0, 2).join(' and ')} among the contributing interests. That score does not explain a specific cuisine connection.`
      : `Qloo ranks ${target.name} for your profile, but I do not have a clear reason for that match.`, scene);
  }
  if (/\b(cuisine|kind of food|serves?)\b/i.test(request.question))
    return reply(target.cuisineTags.length ? `${target.name} has Qloo dining tags for ${target.cuisineTags.join(' and ')}.`
      : `I do not have reliable cuisine details for ${target.name}.`, scene, target.cuisineTags.length ? 'medium' : 'low');
  if (/\b(open|hours|address|phone|number|accessible|accessibility|take me|directions|navigate|where|how far|distance)\b/i.test(request.question)) {
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
    if (/\b(phone|number)\b/i.test(request.question)) return reply(details.phone ? `${details.name}'s listed phone number is ${details.phone}.` : `I could not verify a phone number for ${details.name}.`, nextScene, details.phone ? 'high' : 'low');
    if (/\b(open|hours)\b/i.test(request.question)) return reply(details.openNow === undefined ? `I could not verify whether ${details.name} is open now.` : `${details.name} is listed as ${details.openNow ? 'open' : 'closed'} right now.`, nextScene, details.openNow === undefined ? 'low' : 'medium');
    if (/\b(how far|distance)\b/i.test(request.question) && scene!.dining!.position && details.latitude !== undefined && details.longitude !== undefined) {
      const km = straightLineKilometers(scene!.dining!.position, { latitude: details.latitude, longitude: details.longitude });
      return reply(`${details.name} is about ${km} kilometers away in a straight line.${details.address ? ` Its address is ${details.address}.` : ''} This is not a walking route.`, nextScene);
    }
    return reply(details.address ? `${details.name} is at ${details.address}. You can enter that address in your own map; Context does not open maps.`
      : `I could not verify an address for ${details.name}.`, nextScene, details.address ? 'high' : 'low');
  }
  return reply(`${target.name} is ${target.radiusMeters === 5000 ? 'in the wider five-kilometer area' : 'within two kilometers'} and was ranked by Qloo for your interests.`, scene);
}
