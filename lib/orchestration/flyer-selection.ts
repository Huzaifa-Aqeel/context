import type { z } from 'zod';
import type { eventVisualSchema } from '@/schemas/context';
import type { ResolvedEntity, VisionEntity } from '@/types/context';
import type { EventRanking } from '@/lib/qloo/service';

type FlyerVisual = z.infer<typeof eventVisualSchema>;
type Ranked = EventRanking['ranked'][number];
export const flyerName = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const key = (name: string, type: string) => `${flyerName(name)}:${flyerName(type)}`;
const flyerQlooTypes = new Set(['movie', 'place', 'person', 'artist']);

export function flyerRole(event: FlyerVisual, item: VisionEntity, index: number): NonNullable<VisionEntity['role']> {
  const primary = event.primarySubject;
  const printedVenue = Boolean(event.venueName && flyerName(event.venueName) === flyerName(item.label));
  const venueNamedAsSubject = Boolean(primary && flyerName(primary.name) === flyerName(item.label)
    || event.title && flyerName(event.title) === flyerName(item.label));
  if (printedVenue && venueNamedAsSubject && (event.kind === 'venue_promotion' || !event.performers.length)) return 'primary_subject';
  if (printedVenue) return 'venue';
  if (primary && flyerName(primary.name) === flyerName(item.label)
    && (primary.entityIndex === null || primary.entityIndex === index)) return 'primary_subject';
  if (item.role === 'primary_subject' && primary && flyerName(primary.name) !== flyerName(item.label)) return 'other';
  if (item.role) return item.role;
  if (event.venueName && flyerName(event.venueName) === flyerName(item.label)) return 'venue';
  if (event.performers.some((name) => flyerName(name) === flyerName(item.label)))
    return item.category === 'artist' ? 'participant' : 'speaker';
  return 'other';
}

/** Printed context remains visible; only subjects and featured participants need capture-time cultural evaluation. */
export function flyerCandidates(event: FlyerVisual, detected: VisionEntity[]) {
  const unique = [...new Map(detected.flatMap((item, index) => item.culturallyRelevant && item.confidence >= 0.7
    ? [[key(item.label, item.category), { item, index }] as const] : [])).values()];
  const annotated = unique.map(({ item, index }) => ({ ...item, role: flyerRole(event, item, index) }));
  const evaluate = annotated.filter((item) => {
    if (!flyerQlooTypes.has(item.category)) return false;
    const printedVenue = Boolean(event.venueName && flyerName(event.venueName) === flyerName(item.label));
    if (printedVenue && item.role === 'venue') return false;
    if (item.role === 'primary_subject' || item.role === 'headliner' || item.role === 'featured_work') return true;
    if (item.role === 'venue' || item.role === 'organizer') return false;
    if (item.role === 'speaker' || item.role === 'participant')
      return event.performers.some((name) => flyerName(name) === flyerName(item.label));
    return false;
  });
  const priority = (item: VisionEntity) => item.role === 'primary_subject' ? 0 : item.role === 'headliner' ? 1
    : item.role === 'featured_work' ? 2 : item.role === 'speaker' || item.role === 'participant' ? 3 : 4;
  return { all: annotated, evaluate: [...evaluate].sort((a, b) => priority(a) - priority(b)) };
}

/** Never compare Qloo affinity numbers returned by separate filter.type requests. */
export function flyerTasteFocus(event: FlyerVisual, visible: ResolvedEntity[], ranked: Ranked[]) {
  const meaningful = ranked.filter((item) => item.exactInterest || item.contributingInterestIds.length);
  const candidates = visible.filter((item) => item.qlooId && meaningful.some((rank) => rank.entityId === item.qlooId));
  const priority = (item: ResolvedEntity) => item.role === 'primary_subject' ? 0 : item.role === 'headliner' ? 1
    : item.role === 'featured_work' ? 2 : item.role === 'speaker' || item.role === 'participant' ? 3 : 4;
  candidates.sort((a, b) => priority(a) - priority(b));
  const first = candidates[0];
  if (!first) return undefined;
  const firstPriority = priority(first);
  const sameTier = candidates.filter((item) => priority(item) === firstPriority && item.qlooType === first.qlooType);
  const chosen = sameTier.map((item) => meaningful.find((rank) => rank.entityId === item.qlooId)!)
    .sort((a, b) => Number(b.exactInterest) - Number(a.exactInterest) || (b.affinity ?? -1) - (a.affinity ?? -1))[0];
  const subject = visible.find((item) => item.qlooId === chosen.entityId)!;
  return { ranked: chosen, subject, comparableCount: sameTier.length, printedCount: event.performers.length };
}
