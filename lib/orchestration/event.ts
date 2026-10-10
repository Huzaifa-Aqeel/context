import type { QlooService } from '@/lib/qloo/service';
import type { Locality, Scene, VisionEntity } from '@/types/context';
import type { TasteProfile } from '@/types/taste';
import type { z } from 'zod';
import { eventVisualSchema } from '@/schemas/context';
import { isConfirmed } from '@/lib/qloo/confirmed';
import { flyerResolutionKey, shelfResolutionKey, type ResolutionEntry } from '@/lib/qloo/display-resolution-cache';
import { flyerCandidates, flyerName, flyerTasteFocus } from './flyer-selection';

type EventVisual = z.infer<typeof eventVisualSchema>;
const spokenList = (names: string[]) => names.length === 2 ? `${names[0]} and ${names[1]}` : names[0];
const printedNames = (names: string[]) => names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
function printedParticipants(event: EventVisual, detected: VisionEntity[]) {
  const groups = new Map<string, string[]>();
  for (const name of event.performers) {
    const item = detected.find((candidate) => flyerName(candidate.label) === flyerName(name));
    const heading = item?.role === 'headliner' ? 'Headliners' : item?.role === 'speaker' ? 'Speakers'
      : item?.category === 'artist' || ['concert', 'festival'].includes(event.kind ?? '') ? 'Performers' : 'Named participants';
    groups.set(heading, [...(groups.get(heading) ?? []), name]);
  }
  return [...groups].map(([heading, names]) => `${heading}: ${printedNames(names)}.`);
}
const printedWhen = (event: EventVisual) => event.dateText && event.timeText ? `on ${event.dateText} at ${event.timeText}`
  : event.dateText ? `on ${event.dateText}` : event.timeText ? `at ${event.timeText}` : undefined;
function printedLocality(event: EventVisual): Locality | undefined {
  const printed = event.locationText?.trim();
  // Only a short printed place name is suitable for disambiguation; an address is not a city.
  if (!printed || printed.length > 100 || /\d/.test(printed) || !/^[\p{L}\s,.'-]+$/u.test(printed)) return undefined;
  const parts = printed.split(',').map((part) => part.trim()).filter(Boolean);
  if (!parts.length || parts.length > 3) return undefined;
  return { city: parts[0], ...(parts[1] ? { region: parts[1] } : {}), ...(parts[2] ? { country: parts[2] } : {}) };
}
function eventOpening(event: EventVisual): string {
  const material = event.materialType ? `the ${event.materialType}` : 'event material';
  const title = event.title || event.primarySubject?.name ? ` for ${event.title ?? event.primarySubject?.name}` : '';
  const venue = event.venueName ? ` at ${event.venueName}` : '';
  const locality = event.locationText ? `, ${event.locationText}` : '';
  const date = event.dateText ? ` on ${event.dateText}` : '';
  const time = event.timeText ? `, starting at ${event.timeText}${event.timezoneText ? ` ${event.timezoneText}` : ''}` : '';
  const end = event.endTimeText ? `, ending at ${event.endTimeText}` : '';
  return `This is ${material}${title}${venue}${locality}${date}${time}${end}.`;
}

export async function analyzeEvent(visual: EventVisual | undefined, detected: VisionEntity[], profile: TasteProfile | undefined, qloo: QlooService, cache: ResolutionEntry[] = []): Promise<Scene> {
  const event = eventVisualSchema.parse(visual ?? {});
  const { all, evaluate } = flyerCandidates(event, detected);
  const eligible = all.slice(0, 30);
  const targets = evaluate.filter((item) => eligible.includes(item));
  let ranking: Awaited<ReturnType<NonNullable<QlooService['rankEvent']>>> | undefined;
  if (targets.length && profile?.entities.length && qloo.rankEvent) {
    try { ranking = await qloo.rankEvent(targets, profile.entities, cache, printedLocality(event)); }
    catch { /* Printed event information remains useful if cultural matching fails. */ }
  }
  const selected = new Map(targets.map((item, index) => [`${flyerName(item.label)}:${flyerName(item.category)}`, ranking?.resolved[index]]));
  const resolved = eligible.map((item) => selected.get(`${flyerName(item.label)}:${flyerName(item.category)}`) ?? ({
    detectedName: item.label, detectedCategory: item.category, visionConfidence: item.confidence, role: item.role,
    qlooPriority: item.qlooPriority, source: 'vision' as const, resolutionPending: targets.includes(item), carrier: item.carrier, visibleText: item.visibleText,
  }));
  const ranked = (ranking?.ranked ?? []).filter((item) => resolved.some((reference) => reference.qlooId === item.entityId)).slice(0, 30);
  const entries: ResolutionEntry[] = resolved.flatMap((item) => isConfirmed(item) && item.qlooName && item.qlooType && item.qlooType !== 'urn:entity:place'
    ? [{ kind: 'flyer' as const, title: item.detectedName, qlooId: item.qlooId!, qlooName: item.qlooName, qlooType: item.qlooType }] : []);
  const entryKey = (entry: ResolutionEntry) => entry.kind === 'flyer' ? flyerResolutionKey(entry.qlooType, entry.title)
    : shelfResolutionKey(entry.kind, entry.title, entry.relatedName ?? entry.author);
  const resolutionCache = entries.length || cache.length ? { version: 1 as const,
    entries: [...new Map([...cache, ...entries].map((entry) => [entryKey(entry), entry])).values()].slice(-100) } : undefined;
  const when = printedWhen(event);
  if (!event.title && !event.primarySubject && !when && !event.venueName && !event.locationText && !event.performers.length && !event.schedule.length && !event.printedDetails?.length && !eligible.length)
    return { origin: 'image', id: crypto.randomUUID(), createdAt: new Date().toISOString(),
      summary: 'I could not confidently read event details in this image. Try a closer photo of the flyer or program.',
      confidence: 'low', culturalEvidence: { entities: [], relationships: [], themes: [], confidence: 0 },
      event: { visual: event, profileSignature: profile?.signature, ranking: ranked, researchedFacts: [] }, resolutionCache };
  const parts = [eventOpening(event)];
  parts.push(...printedParticipants(event, eligible));
  if (event.schedule.length) parts.push(`The printed schedule says: ${event.schedule.join('; ')}.`);
  if (event.printedDetails?.length) parts.push(`Other printed details: ${event.printedDetails.join('; ')}.`);
  const focus = flyerTasteFocus(event, resolved, ranked);
  if (focus) {
    const top = focus.ranked;
    const contributors = top.contributingInterestIds.flatMap((id) => {
      const interest = profile?.entities.find((item) => item.id === id);
      return interest ? [{ id, name: interest.name }] : [];
    }).filter((item, index, all) => all.findIndex((other) => flyerName(other.name) === flyerName(item.name)) === index).slice(0, 2);
    const contributorNames = contributors.map((item) => item.name);
    if (top.exactInterest) parts.push(`${top.name} is already one of your interests.`);
    else if (contributorNames.length) parts.push(focus.comparableCount > 1
      ? `${top.name} stands out among the ${focus.subject.qlooType === 'urn:entity:artist' ? 'artists' : focus.subject.qlooType === 'urn:entity:person' ? 'speakers' : 'references'} I could match, with ${spokenList(contributorNames)} among the interests contributing to the recommendation.`
      : `${top.name} has a taste match for you, with ${spokenList(contributorNames)} among the interests contributing to the recommendation.`);
  }
  return { origin: 'image', id: crypto.randomUUID(), createdAt: new Date().toISOString(), summary: parts.join(' '),
    confidence: event.title || when ? 'medium' : 'low',
    culturalEvidence: { entities: resolved, relationships: [], themes: [], confidence: 0 },
    event: { visual: event, profileSignature: profile?.signature, ranking: ranked, researchedFacts: [] }, resolutionCache };
}
