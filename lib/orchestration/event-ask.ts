import type { PlacesService } from '@/lib/places/geoapify';
import type { QlooService } from '@/lib/qloo/service';
import type { ResearchService } from '@/lib/research/tavily';
import { researchEvent, type EventResearchKind } from '@/lib/research/event';
import type { Answer, AskRequest, Scene } from '@/types/context';
import type { TasteProfile } from '@/types/taste';
import { explicitEventZone, parseEventStart } from './event-time';
import { asksForConnections, visibleReferences } from './intent';
import { questionNamesEntity } from './visual';
import { straightLineKilometers } from '@/lib/location/distance';

const reply = (answer: string, scene: Scene, confidence: Answer['confidence'] = 'medium', action?: Answer['action']): Answer =>
  ({ answer, scene, confidence, ...(action ? { action } : {}) });
const recent = (date: string, minutes = 15) => Date.now() - new Date(date).getTime() < minutes * 60_000;
export async function refreshEventRanking(scene: Scene, profile: TasteProfile | undefined, qloo: QlooService): Promise<Scene> {
  const event = scene.event;
  if (!event || !event.profileSignature || event.profileSignature === profile?.signature) return scene;
  let ranking: typeof event.ranking = [];
  try { ranking = (await qloo.rerankEvent?.(scene.culturalEvidence.entities, profile?.entities ?? []))?.ranked ?? []; }
  catch { /* Keep visible event details but discard stale taste claims. */ }
  return { ...scene, event: { ...event, profileSignature: profile?.signature, ranking } };
}
const calendarRequest = (question: string) => /\b(add|save|create|put)\b.*\bcalendar\b|\bremind me\b/i.test(question);
const currentScheduleQuestion = (question: string) => /\b(latest|updated|changed|change|current)\b.*\b(schedule|lineup|program|start time)\b|\b(schedule|lineup|program|start time)\b.*\b(latest|updated|changed|change|current)\b/i.test(question);
const researchKind = (question: string): EventResearchKind | undefined => {
  if (/\b(cancel|cancelled|canceled|postponed|rescheduled|still happening|happening tonight|current status)\b/i.test(question)) return 'status';
  if (/\b(tickets?|sold out|on sale|availability)\b/i.test(question)) return 'tickets';
  if (/\b(review|rating|critic)\b/i.test(question)) return 'reviews';
  if (currentScheduleQuestion(question)) return 'schedule';
  if (/\b(official (?:event )?(?:page|site|website)|event page)\b/i.test(question)) return 'official_page';
  return undefined;
};
function reminderMinutes(question: string) {
  const match = question.match(/\b(\d+|one|two|three|four)\s*(hours?|minutes?)\s*(?:before|prior)/i);
  if (!match) return undefined;
  const amount = { one: 1, two: 2, three: 3, four: 4 }[match[1].toLowerCase() as 'one' | 'two' | 'three' | 'four'] ?? Number(match[1]);
  const minutes = amount * (/hour/i.test(match[2]) ? 60 : 1);
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= 10080 ? minutes : undefined;
}
function factAnswer(kind: EventResearchKind, event: NonNullable<Scene['event']>) {
  const stored = event.researchedFacts.filter((fact) => fact.kind === kind || kind === 'reviews' && fact.kind === 'review');
  const selected = stored.at(-1);
  if (!selected) return undefined;
  const source = new URL(selected.sourceUrl).hostname.replace(/^www\./, '');
  if (kind === 'tickets') return selected.value === 'ticket page found; availability unknown'
    ? `I found a ticket page on ${source}, but I could not verify availability.`
    : `The ticket page on ${source} says ${selected.value}.`;
  if (kind === 'status') return `A source on ${source} says the event is ${selected.value}. Check the organizer before making plans.`;
  if (kind === 'schedule') return `The event page on ${source} says: ${selected.value}`;
  if (kind === 'official_page') return `I found an event page on ${source}. Context does not open links.`;
  if (kind === 'reviews') return `A review on ${source} says: ${selected.value}`;
  return undefined;
}

/** Event follow-ups only fetch missing facts. No map or external-link action exists. */
export async function exploreEvent(request: AskRequest, qloo: QlooService, research?: ResearchService, places?: PlacesService): Promise<Answer> {
  let scene = await refreshEventRanking(request.scene!, request.profile, qloo);
  let event = scene.event!;
  const question = request.question;
  const visual = event.visual;
  if (event.pendingCalendarDetails) {
    if (/\b(cancel|never mind|forget it)\b/i.test(question)) return reply('I did not add the event to Calendar.', { ...scene, event: { ...event, pendingCalendarDetails: undefined } });
    const zone = visual.timezoneText ?? explicitEventZone(question);
    const start = parseEventStart(visual.dateText, visual.timeText, zone)
      ?? parseEventStart(question, question, zone)
      ?? parseEventStart(question, visual.timeText, zone)
      ?? parseEventStart(visual.dateText, question, zone);
    if (!start) return reply('Please give the event’s full date including year, start time, and timezone. For example: October 10, 2026, 8 PM Eastern Time. You can also say “cancel.”', scene, 'low');
    const pending = { title: event.pendingCalendarDetails.title, ...start,
      ...(visual.venueName ? { location: [visual.venueName, visual.locationText].filter(Boolean).join(', ') } : {}),
      ...(event.pendingCalendarDetails.reminderMinutes ? { reminderMinutes: event.pendingCalendarDetails.reminderMinutes } : {}) };
    return reply(`I have the start time for ${pending.title}. What end time should I use? If you do not know, say “use one hour.” I will save it after you answer.`,
      { ...scene, event: { ...event, pendingCalendarDetails: undefined, pendingCalendar: pending } });
  }
  if (event.pendingCalendar) {
    const pending = event.pendingCalendar;
    if (/\b(cancel|never mind|forget it)\b/i.test(question)) return reply('I did not add the event to Calendar.', { ...scene, event: { ...event, pendingCalendar: undefined } });
    const defaultEnd = /\b((?:use )?(?:one|1) hour|one.hour default|i don.t know|don.t know|default)\b/i.test(question);
    const endText = /\b20\d{2}\b/.test(question) ? question : pending.start.slice(0, 10);
    const spokenEnd = defaultEnd ? undefined : parseEventStart(endText, question, pending.timeZone);
    const end = defaultEnd ? new Date(new Date(pending.start).getTime() + 60 * 60_000).toISOString().replace('Z', '+00:00') : spokenEnd?.start;
    if (!end || new Date(end).getTime() <= new Date(pending.start).getTime())
      return reply('What end time should I use? Say a time, include the date if it ends after midnight, or say “use one hour.” You can also say “cancel.”', scene, 'low');
    const nextScene = { ...scene, event: { ...event, pendingCalendar: undefined } };
    return reply(`Adding ${pending.title} to Calendar${defaultEnd ? ' with a one-hour end-time placeholder' : ''}.`, nextScene, 'high',
      { kind: 'calendar', title: pending.title, start: pending.start, end, endIsPlaceholder: defaultEnd,
        timeZone: pending.timeZone, ...(pending.location ? { location: pending.location } : {}),
        ...(pending.reminderMinutes ? { reminderMinutes: pending.reminderMinutes } : {}) });
  }
  if (/\b(who|which)\b.*\b(perform(?:ing|ers?)?|artists?|speakers?|playing|lineup)\b|\b(lineup|performers?)\b/i.test(question) && !currentScheduleQuestion(question))
    return reply(visual.performers.length ? `The material names ${visual.performers.join(', ')}.` : 'I could not read a performer list from the material.', scene);
  if (/\b(schedule|program|set times?)\b/i.test(question) && !currentScheduleQuestion(question))
    return reply(visual.schedule.length ? `The printed schedule lists ${visual.schedule.join('; ')}.`
      : 'I could not read a detailed schedule from the material.', scene, visual.schedule.length ? 'medium' : 'low');
  if (/\b(what time|when|start time)\b/i.test(question) && !currentScheduleQuestion(question) && !/\b(tonight|still happening)\b/i.test(question) && !calendarRequest(question))
    return reply(visual.dateText || visual.timeText
      ? `The material lists ${[visual.dateText, visual.timeText, visual.timezoneText].filter(Boolean).join(' at ')}.`
      : 'I could not read a start date or time from the material.', scene);
  if (/\b(what|which)\s+venue\b/i.test(question))
    return reply(visual.venueName ? `The material names ${visual.venueName}${visual.locationText ? ` in ${visual.locationText}` : ''}.` : 'I could not read a venue from the material.', scene);
  if (asksForConnections(question)) {
    const visible = visibleReferences(scene.culturalEvidence.entities);
    const named = visible.filter((item) => questionNamesEntity(item, question));
    const pair = named.length === 2 ? named : /\b(these|they|them)\b/i.test(question) && visible.length === 2 ? visible : [];
    if (pair.length !== 2) return reply(visible.length < 2 ? 'I have fewer than two confirmed named references on this material to compare.' : 'Which two named references do you want me to compare?', scene, 'low');
    const pairKey = pair.map((entity) => entity.qlooId).sort().join(':');
    const related = (item: { source: string; target: string }) => [item.source, item.target].sort().join(':') === pairKey;
    let relationships = scene.culturalEvidence.relationships.filter(related);
    let nextScene = scene;
    if (!relationships.length && !scene.culturalEvidence.investigatedPairs?.includes(pairKey)) {
      try {
        const evidence = await qloo.analyzeConnections(pair, { includeAffinity: true });
        relationships = evidence.relationships.filter(related);
        nextScene = { ...scene, culturalEvidence: { ...scene.culturalEvidence,
          relationships: [...scene.culturalEvidence.relationships, ...relationships].slice(0, 100),
          investigatedPairs: [...(scene.culturalEvidence.investigatedPairs ?? []), pairKey].slice(-30) } };
      } catch { return reply('I could not check that cultural connection right now.', scene, 'low'); }
    }
    const shared = relationships.find((item) => item.kind === 'shared_tags');
    return reply(shared ? `Qloo lists ${shared.description} as a shared cultural tag.`
      : relationships.length ? `Qloo reports an aggregate affinity between ${pair[0].detectedName} and ${pair[1].detectedName}; it does not establish a direct relationship.`
        : `I could not verify a cultural connection between ${pair[0].detectedName} and ${pair[1].detectedName}.`, nextScene, relationships.length ? 'medium' : 'low');
  }
  if (/\b(why|which|what)\b.*\b(interest|relevant|fit|match|rank)\b/i.test(question)) {
    const first = event.ranking[0];
    if (!first) return reply('I could not match a named event reference to your interests through Qloo.', scene, 'low');
    if (first.exactInterest) return reply(`${first.name} is already in your interests.`, scene);
    const contributors = first.contributingInterestIds.flatMap((id) => request.profile?.entities.find((item) => item.id === id)?.name ?? []);
    return reply(contributors.length ? `Qloo ranks ${first.name} highest among the named references, with ${contributors.slice(0, 2).join(' and ')} contributing to the profile match. That does not establish a specific shared theme.`
      : `Qloo ranks ${first.name} highest among the named references, but I do not have a clear explanation for the match.`, scene);
  }
  const practical = /\b(address|where|phone|number|open|hours|accessible|accessibility|near|distance|how far)\b/i.test(question);
  if (practical && !calendarRequest(question)) {
    if (!visual.venueName) return reply('I could not read a specific venue from the material.', scene, 'low');
    if (!places) return reply(`The venue appears to be ${visual.venueName}${visual.locationText ? ` in ${visual.locationText}` : ''}. I cannot verify its address or current details yet.`, scene, 'low');
    let place = event.place;
    if (!place || (/\b(open|hours)\b/i.test(question) && !recent(place.checkedAt))) {
      try { place = await places.findExact(visual.venueName, { locality: visual.locationText }); }
      catch { return reply(`I could not verify practical details for ${visual.venueName} right now.`, scene, 'low'); }
    }
    if (!place) return reply(`I could not uniquely verify ${visual.venueName}'s location. The material${visual.locationText ? ` says ${visual.locationText}` : ' does not give enough detail'}.`, scene, 'low');
    const nextScene = { ...scene, event: { ...event, place } };
    if (/\b(near|distance|how far)\b/i.test(question)) {
      if (!request.locationEnabled || !request.position) return reply(`I can give the venue address, but I need foreground Location enabled to estimate straight-line distance. ${place.address ? `${place.name} is at ${place.address}.` : ''}`.trim(), nextScene, 'low');
      if (place.latitude !== undefined && place.longitude !== undefined) {
        const kilometers = straightLineKilometers(request.position, { latitude: place.latitude, longitude: place.longitude });
        return reply(`${place.name} is about ${kilometers} kilometers away in a straight line.${place.address ? ` Its address is ${place.address}.` : ''} This is not a walking route.`, nextScene);
      }
    }
    if (/\b(address|where|near|distance|how far)\b/i.test(question)) return reply(place.address ? `${place.name} is at ${place.address}. You can use that address in your own map.` : `I could not verify an address for ${place.name}.`, nextScene, place.address ? 'high' : 'low');
    if (/\b(phone|number)\b/i.test(question)) return reply(place.phone ? `${place.name}'s listed phone number is ${place.phone}.` : `I could not verify a phone number for ${place.name}.`, nextScene, place.phone ? 'high' : 'low');
    if (/\b(accessible|accessibility)\b/i.test(question)) return reply(`I do not have verified accessibility information for ${place.name}.`, nextScene, 'low');
    return reply(place.openNow === undefined ? `I could not verify whether ${place.name} is open now.` : `${place.name} is listed as ${place.openNow ? 'open' : 'closed'} right now.`, nextScene, place.openNow === undefined ? 'low' : 'medium');
  }
  if (calendarRequest(question)) {
    if (!visual.title) return reply('I need the event name before adding it to Calendar.', scene, 'low');
    const reminder = /\bremind me\b/i.test(question) ? reminderMinutes(question) : undefined;
    if (/\bremind me\b/i.test(question) && !reminder) return reply('How long before the event should I remind you?', scene, 'low');
    let start = parseEventStart(visual.dateText, visual.timeText, visual.timezoneText) ?? event.verifiedStart;
    let next = event;
    if (!start && research && !event.researchChecks?.some((check) => check.kind === 'calendar' && recent(check.checkedAt, 60))) {
      try {
        const found = await researchEvent(event, 'calendar', research);
        next = { ...event, researchedFacts: [...event.researchedFacts, ...found.facts].slice(-30), verifiedStart: found.verifiedStart,
          researchChecks: [...(event.researchChecks ?? []), { kind: 'calendar' as const, checkedAt: new Date().toISOString() }].slice(-20) };
        start = found.verifiedStart;
      } catch { /* An unverified time must never become a Calendar action. */ }
    }
    const nextScene = { ...scene, event: next };
    if (!start) return reply('I need the full date with year, start time, and timezone before adding this event. Please say those details, or say “cancel.”',
      { ...nextScene, event: { ...next, pendingCalendarDetails: { title: visual.title, ...(reminder ? { reminderMinutes: reminder } : {}) } } }, 'low');
    const printedEnd = parseEventStart(visual.dateText, visual.endTimeText, start.timeZone);
    const pending = { title: visual.title, start: start.start, timeZone: start.timeZone,
      ...(visual.venueName ? { location: [visual.venueName, visual.locationText].filter(Boolean).join(', ') } : {}),
      ...(reminder ? { reminderMinutes: reminder } : {}) };
    if (!printedEnd || new Date(printedEnd.start).getTime() <= new Date(start.start).getTime())
      return reply(`I have the start time for ${visual.title}. What end time should I use? If you do not know, say “use one hour.” I will save it after you answer.`,
        { ...nextScene, event: { ...next, pendingCalendar: pending } }, 'medium');
    return reply(`Adding ${visual.title} to Calendar${reminder ? ` with a reminder ${reminder} minutes before` : ''}.`, nextScene, 'high',
      { kind: 'calendar', ...pending, end: printedEnd.start, endIsPlaceholder: false });
  }
  const kind = researchKind(question);
  if (kind) {
    let next = event;
    if (!event.researchChecks?.some((check) => check.kind === kind && recent(check.checkedAt))) {
      if (!research) return reply('I cannot check current event information right now.', scene, 'low');
      try {
        const found = await researchEvent(event, kind, research);
        next = { ...event, researchedFacts: [...event.researchedFacts, ...found.facts].slice(-30),
          verifiedTicketUrl: found.verifiedTicketUrl ?? event.verifiedTicketUrl,
          researchChecks: [...(event.researchChecks ?? []), { kind, checkedAt: new Date().toISOString() }].slice(-20) };
      } catch { return reply('I could not verify current event information right now.', scene, 'low'); }
    }
    const nextScene = { ...scene, event: next };
    const grounded = factAnswer(kind, next);
    const openingLink = /\b(open|launch|visit)\b.*\b(tickets?|(?:event )?(?:page|site))\b/i.test(question);
    return reply(`${openingLink ? 'Context does not open links. ' : ''}${grounded ?? (kind === 'tickets' ? 'I could not verify current ticket availability.'
      : kind === 'status' ? 'I could not verify the event’s current status.'
      : kind === 'schedule' ? 'I could not verify an updated schedule.'
      : kind === 'reviews' ? 'I could not verify a useful review of this event.'
      : 'I could not verify an official event page.')}`, nextScene, next.researchedFacts.length ? 'medium' : 'low');
  }
  return reply('Ask me about the printed time, performers, relevance to your interests, venue details, current status, tickets, or adding the event to Calendar.', scene, 'low');
}
