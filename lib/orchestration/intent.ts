import type { ResolvedEntity } from '@/types/context';
import { isConfirmed } from '@/lib/qloo/confirmed';

export const asksAboutArea = (question: string) => /\b(area|neighbou?rhood|local|nearby|around here|where am i|this place)\b/i.test(question);
export const asksAboutTaste = (question: string) => /\b(interests?|my taste|familiar|things i know|something i know|relevant to me)\b/i.test(question);
export const asksForConnections = (question: string) => /\b(connect|connection|relat(?:e|ion)|similar|compare|in common)\b/i.test(question);
export const asksForRecommendations = (question: string) => /\b(related references?|other (?:films|books|artists|brands|things)|recommendations?|suggestions?)\b/i.test(question);
export const asksForDiningDiscovery = (question: string) => {
  const spoken = question.trim().replace(/[’]/g, "'").replace(/[.!?]+$/, '').trim();
  if (/\b(?:after|before) (?:the |this )?(?:show|concert|event)\b|\b(?:at|around)\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i.test(spoken)) return false;
  return /^find somewhere nearby (?:i'd|i would) enjoy eating$/i.test(spoken)
    || /^find somewhere (?:i'd|i would) enjoy eating near (?:the )?.+$/i.test(spoken)
      && explicitlyNamedPlace(spoken)
    || /\b(?:restaurant|restaurants|bar|bars|dining place|dining places)\b/i.test(spoken)
      && (/\b(?:find|recommend|looking for|closest|are there|show me)\b/i.test(spoken)
        || /^(?:any\s+)?(?:restaurants?|bars?|dining places?)\b.*\b(?:near|nearby|around)\b/i.test(spoken))
      && !/\b(?:near|around) (?:the |this )?(?:venue|show|concert|event)\b/i.test(spoken);
};
export const asksForDiningPlaceDetails = (question: string) =>
  /\b(open|opening|hours|address|phone|number|website|reservation|payment|accessible|accessibility|how far|distance|walking|walk|cuisine|category|kind of place|kind of food|what food|rating|stars?)\b/i.test(question)
  || /\bwhere (?:is|are)\b/i.test(question);
export const isDiningComparisonRequest = (question: string) =>
  /\b(compare|comparison|differ(?:ence|ent)?|side by side|between the two|versus)\b/i.test(question)
  || /\bwhich\b.{0,80}\b(?:closer|nearer|farther|better|best|higher|highest|lower|lowest|cheaper|cheapest|pick|choose|recommend)\b/i.test(question)
  || /\b(?:closer|nearer|farther|better|higher|lower|cheaper)\b.{0,80}\bthan\b/i.test(question);
export const asksForAreaDiscovery = (question: string) =>
  /\b(what(?:'s| is)?|anything|places?|somewhere|something)\b/i.test(question)
  && (/\b(around here|nearby|near me|near the venue|near my hotel|worth (?:checking out|seeing|my attention)|interesting near)\b/i.test(question)
    || /\bnear\s+(?!(?:me|here|my|this|the venue|the show|the event)\b).{2,80}/i.test(question))
  && !asksForDiningDiscovery(question);
export type PracticalCategory = 'bookstore' | 'record_store' | 'game_shop' | 'pharmacy' | 'atm' | 'restroom';
export const practicalCategoryFromQuestion = (question: string): PracticalCategory | undefined => {
  if (/\b(?:bookstores?|book shops?)\b/i.test(question)) return 'bookstore';
  if (/\b(?:record stores?|music stores?)\b/i.test(question)) return 'record_store';
  if (/\b(?:game shops?|game stores?|video game shops?|video game stores?)\b/i.test(question)) return 'game_shop';
  if (/\b(?:pharmac(?:y|ies)|drugstores?)\b/i.test(question)) return 'pharmacy';
  if (/\b(?:atms?|cash machines?)\b/i.test(question)) return 'atm';
  if (/\b(?:restrooms?|toilets?|bathrooms?)\b/i.test(question)) return 'restroom';
  return undefined;
};
export const explicitlyNamedPlace = (question: string) =>
  (/\b(?:near|around|in|inside)\s+(?!(?:me|here|my|this|the venue|the show|the event|the area|the neighborhood)\b)(?:the\s+)?[\p{L}][\p{L}\p{N}\s,'’-]{2,100}/iu.test(question)
    || /\bmy\s+hotel\s*,\s*[\p{L}][\p{L}\p{N}\s,'’-]{2,100}/iu.test(question));
export const asksForPracticalLookup = (question: string) =>
  practicalCategoryFromQuestion(question) !== undefined
  && /\b(where|find|near|nearby|around|closest|looking for)\b/i.test(question);
export const explicitlyNearDevice = (question: string) =>
  /\b(near me|around me|around here|nearby|where i am|my current location|my location|from my location|from me|close to me|how far am i)\b/i.test(question);
export const needsDevicePosition = (question: string, _hasActivePlaceScene: boolean) =>
  (explicitlyNearDevice(question) && (!asksForAreaDiscovery(question)
    || asksForDiningDiscovery(question) || asksForPracticalLookup(question)))
  || ((asksForDiningDiscovery(question) || asksForPracticalLookup(question))
    && !explicitlyNamedPlace(question));
export const visibleReferences = (entities: ResolvedEntity[]) => entities.filter((entity) => entity.source !== 'qloo' && isConfirmed(entity));
export const namedInQuestion = (name: string, question: string) => question.toLocaleLowerCase().includes(name.toLocaleLowerCase());
