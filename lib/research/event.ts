import type { ResearchService, ResearchSource } from './tavily';
import type { Scene } from '@/types/context';
import { parseEventStart, parseIsoEventStart } from '@/lib/orchestration/event-time';

type EventContext = NonNullable<Scene['event']>;
type Fact = EventContext['researchedFacts'][number];
export type EventResearchKind = 'status' | 'schedule' | 'tickets' | 'official_page' | 'calendar' | 'reviews';
const normalize = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const compact = (text: string) => normalize(text).replace(/ /g, '');
const ticketHosts = new Set(['ticketmaster.com', 'eventbrite.com', 'axs.com', 'dice.fm']);

function sourceForEvent(source: ResearchSource, event: EventContext) {
  const title = event.visual.title;
  return Boolean(title && normalize(title).length >= 5 && normalize(`${source.title} ${source.content}`).includes(normalize(title)));
}
function officialSource(source: ResearchSource, event: EventContext) {
  if (!sourceForEvent(source, event)) return false;
  const host = new URL(source.url).hostname.replace(/^www\./, '').toLowerCase();
  const hostText = compact(host.split('.').slice(0, -1).join(' '));
  const names = [event.visual.title, event.visual.venueName].filter((value): value is string => Boolean(value));
  if (names.some((name) => {
    const full = compact(name);
    const withoutVenueSuffix = compact(name.replace(/\s+(club|theatre|theater|hall|venue)$/i, ''));
    return full.length >= 8 && (hostText === full || hostText === withoutVenueSuffix);
  })) return true;
  return [...ticketHosts].some((domain) => host === domain || host.endsWith(`.${domain}`));
}
function excerpt(source: ResearchSource, pattern: RegExp) {
  const match = pattern.exec(source.content);
  if (!match) return undefined;
  const start = Math.max(0, source.content.lastIndexOf('.', match.index - 1) + 1);
  const endIndex = source.content.indexOf('.', match.index + match[0].length);
  const end = endIndex >= 0 && endIndex - start <= 550 ? endIndex + 1 : Math.min(source.content.length, start + 550);
  return source.content.slice(start, end).trim().slice(0, 600);
}
function fact(kind: Fact['kind'], value: string, source: ResearchSource, quote: string): Fact {
  return { kind, value: value.slice(0, 500), sourceUrl: source.url, retrievedAt: source.retrievedAt, supportingQuote: quote };
}

export async function researchEvent(event: EventContext, kind: EventResearchKind, research: ResearchService) {
  const title = event.visual.title;
  if (!title) return { facts: [] as Fact[] };
  const query = [title, event.visual.venueName, event.visual.dateText,
    kind === 'calendar' ? 'official date start time timezone' : kind === 'tickets' ? 'official tickets availability' : kind === 'status' ? 'official cancelled postponed status' : kind === 'reviews' ? 'reviews' : kind === 'schedule' ? 'official updated schedule' : 'official event page']
    .filter(Boolean).join(' ').slice(0, 500);
  const sources = (await research.search(query)).filter((source) => sourceForEvent(source, event));
  const ordered = [...sources].sort((a, b) => Number(officialSource(b, event)) - Number(officialSource(a, event)));
  const facts: Fact[] = [];
  let verifiedTicketUrl: string | undefined;
  let verifiedStart: EventContext['verifiedStart'];
  for (const source of ordered) {
    const official = officialSource(source, event);
    if (kind === 'calendar' && official && !verifiedStart) {
      const titleIndex = source.content.toLowerCase().indexOf(title.toLowerCase());
      const relevant = titleIndex >= 0 ? source.content.slice(titleIndex, titleIndex + 600) : '';
      const iso = parseIsoEventStart(relevant);
      const date = relevant.match(/\b(?:20\d{2}-\d{2}-\d{2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+20\d{2})\b/i)?.[0];
      const time = relevant.match(/\b\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b/i)?.[0];
      const zone = relevant.match(/\b(?:UTC\s*[+-]\d{1,2}(?::?\d{2})?|America\/[A-Za-z_]+|(?:EDT|EST|CDT|CST|MDT|MST|PDT|PST|ET|CT|MT|PT))\b/i)?.[0];
      const parsed = iso ?? parseEventStart(date, time, zone);
      if (parsed) {
        const quote = excerpt(source, /\b(?:20\d{2}-\d{2}-\d{2}|January|February|March|April|May|June|July|August|September|October|November|December)\b/i);
        if (quote) {
          verifiedStart = { ...parsed, sourceUrl: source.url, checkedAt: source.retrievedAt };
          facts.push(fact('date', date ?? parsed.start.slice(0, 10), source, quote));
        }
      }
    }
    if (kind === 'tickets' && official) {
      const quote = excerpt(source, /\b(tickets?|sold out|available|on sale)\b/i);
      if (quote && /\b(ticket|sale|sold out)\b/i.test(`${source.title} ${quote}`)) {
        verifiedTicketUrl ??= source.url;
        const status = /\bsold out\b/i.test(quote) ? 'sold out' : /\b(?:tickets? available|on sale)\b/i.test(quote) ? 'on sale' : 'ticket page found; availability unknown';
        facts.push(fact('tickets', status, source, quote));
      }
    }
    if (kind === 'status' && official) {
      const quote = excerpt(source, /\b(cancelled|canceled|postponed|rescheduled|still scheduled)\b/i);
      if (quote) facts.push(fact('status', /\b(cancelled|canceled)\b/i.test(quote) ? 'cancelled' : /\bpostponed\b/i.test(quote) ? 'postponed' : /\brescheduled\b/i.test(quote) ? 'rescheduled' : 'scheduled', source, quote));
    }
    if (kind === 'schedule' && official) {
      const quote = excerpt(source, /\b(schedule|lineup|set times?|doors open)\b/i);
      if (quote) facts.push(fact('schedule', quote.slice(0, 200), source, quote));
    }
    if (kind === 'official_page' && official) facts.push(fact('official_page', source.title || 'Official event page', source, source.content.slice(0, 500).trim()));
    if (kind === 'reviews') {
      const quote = excerpt(source, /\b(review|rating|critics?|audience)\b/i);
      if (quote) facts.push(fact('review', quote.slice(0, 180), source, quote));
    }
    if (facts.length >= 3) break;
  }
  return { facts: facts.slice(0, 3), verifiedTicketUrl, verifiedStart };
}
