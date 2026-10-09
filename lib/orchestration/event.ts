import type { QlooService } from '@/lib/qloo/service';
import type { Scene, VisionEntity } from '@/types/context';
import type { TasteProfile } from '@/types/taste';
import type { z } from 'zod';
import { eventVisualSchema } from '@/schemas/context';

type EventVisual = z.infer<typeof eventVisualSchema>;
const normalized = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const spokenList = (names: string[]) => names.length === 2 ? `${names[0]} and ${names[1]}` : names[0];
const printedNames = (names: string[]) => names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
const printedWhen = (event: EventVisual) => event.dateText && event.timeText ? `on ${event.dateText} at ${event.timeText}`
  : event.dateText ? `on ${event.dateText}` : event.timeText ? `at ${event.timeText}` : undefined;
function eventOpening(event: EventVisual): string {
  const material = event.materialType ? `the ${event.materialType}` : 'event material';
  const title = event.title ? ` for ${event.title}` : '';
  const venue = event.venueName ? ` at ${event.venueName}` : '';
  const locality = event.locationText ? `, ${event.locationText}` : '';
  const date = event.dateText ? ` on ${event.dateText}` : '';
  const time = event.timeText ? `, starting at ${event.timeText}${event.timezoneText ? ` ${event.timezoneText}` : ''}` : '';
  const end = event.endTimeText ? `, ending at ${event.endTimeText}` : '';
  return `This is ${material}${title}${venue}${locality}${date}${time}${end}.`;
}

export async function analyzeEvent(visual: EventVisual | undefined, detected: VisionEntity[], profile: TasteProfile | undefined, qloo: QlooService): Promise<Scene> {
  const event = eventVisualSchema.parse(visual ?? {});
  const eligible = [...new Map(detected.filter((item) => item.culturallyRelevant && item.confidence >= 0.7)
    .map((item) => [`${normalized(item.label)}:${normalized(item.category)}`, item])).values()].slice(0, 30);
  let ranking: Awaited<ReturnType<NonNullable<QlooService['rankEvent']>>> | undefined;
  if (eligible.length && profile?.entities.length && qloo.rankEvent) {
    try { ranking = await qloo.rankEvent(eligible, profile.entities); }
    catch { /* Printed event information remains useful if cultural matching fails. */ }
  }
  const resolved = eligible.map((item, index) => ranking?.resolved[index] ?? ({
    detectedName: item.label, detectedCategory: item.category, visionConfidence: item.confidence,
    source: 'vision' as const, resolutionPending: true, carrier: item.carrier, visibleText: item.visibleText,
  }));
  const ranked = (ranking?.ranked ?? []).filter((item) => resolved.some((reference) => reference.qlooId === item.entityId)).slice(0, 30);
  const when = printedWhen(event);
  if (!event.title && !when && !event.venueName && !event.locationText && !event.performers.length && !event.schedule.length && !event.printedDetails?.length && !eligible.length)
    return { origin: 'image', id: crypto.randomUUID(), createdAt: new Date().toISOString(),
      summary: 'I could not confidently read event details in this image. Try a closer photo of the flyer or program.',
      confidence: 'low', culturalEvidence: { entities: [], relationships: [], themes: [], confidence: 0 },
      event: { visual: event, profileSignature: profile?.signature, ranking: ranked, researchedFacts: [] } };
  const parts = [eventOpening(event)];
  if (event.performers.length) parts.push(`Performers: ${printedNames(event.performers)}.`);
  if (event.schedule.length) parts.push(`The printed schedule says: ${event.schedule.join('; ')}.`);
  if (event.printedDetails?.length) parts.push(`Other printed details: ${event.printedDetails.join('; ')}.`);
  const printedPerformers = new Set(event.performers.map(normalized));
  const performerRanking = ranked.filter((item) => printedPerformers.has(normalized(item.name)) && resolved.some((reference) =>
    reference.qlooId === item.entityId && printedPerformers.has(normalized(reference.detectedName))));
  const top = performerRanking[0];
  if (top) {
    const single = event.performers.length === 1;
    const contributors = top.contributingInterestIds.flatMap((id) => {
      const interest = profile?.entities.find((item) => item.id === id);
      return interest ? [{ id, name: interest.name }] : [];
    }).filter((item, index, all) => all.findIndex((other) => normalized(other.name) === normalized(item.name)) === index).slice(0, 2);
    const contributorNames = contributors.map((item) => item.name);
    if (top.exactInterest) parts.push(`${top.name} is already one of your interests.`);
    else if (contributorNames.length) {
      parts.push(single ? `${top.name} has a taste match for you, with ${spokenList(contributorNames)} among the interests contributing to the recommendation.`
        : `${top.name} ranks highest for you, with ${spokenList(contributorNames)} among the interests contributing to the recommendation.`);
      if (qloo.sharedEventTag) {
        try {
          const tag = await qloo.sharedEventTag(top.entityId, contributors.map((item) => item.id));
          if (tag) {
            top.sharedTag = tag;
            parts.push(`Both are associated with ${tag}.`);
          }
        } catch { /* A missing tag does not remove printed details or the Qloo rank. */ }
      }
    }
  }
  return { origin: 'image', id: crypto.randomUUID(), createdAt: new Date().toISOString(), summary: parts.join(' '),
    confidence: event.title || when ? 'medium' : 'low',
    culturalEvidence: { entities: resolved, relationships: [], themes: [], confidence: 0 },
    event: { visual: event, profileSignature: profile?.signature, ranking: ranked, researchedFacts: [] } };
}
