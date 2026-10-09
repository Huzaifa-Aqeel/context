import type { ResolvedEntity } from '@/types/context';
import { isConfirmed } from '@/lib/qloo/confirmed';

export const asksAboutArea = (question: string) => /\b(area|neighbou?rhood|local|nearby|around here|where am i|this place)\b/i.test(question);
export const asksAboutTaste = (question: string) => /\b(interests?|my taste|familiar|things i know|something i know|relevant to me)\b/i.test(question);
export const asksForConnections = (question: string) => /\b(connect|connection|relat(?:e|ion)|similar|compare|in common)\b/i.test(question);
export const asksForRecommendations = (question: string) => /\b(related references?|other (?:films|books|artists|brands|things)|recommendations?|suggestions?)\b/i.test(question);
export const asksForDiningDiscovery = (question: string) =>
  /\b(restaurant|restaurants|dining|dinner|lunch|breakfast|brunch|cafe|cafes|food|eat)\b/i.test(question)
  && /\b(nearby|near me|around here|where|find|recommend|suggest|good|should i|want to|looking for)\b/i.test(question);
export const asksForAreaDiscovery = (question: string) =>
  /\b(what(?:'s| is)?|anything|places?|somewhere|something)\b/i.test(question)
  && /\b(around here|nearby|near me|near the venue|near my hotel|worth (?:checking out|seeing|my attention)|interesting near|inside (?:this|the|a) mall)\b/i.test(question)
  && !asksForDiningDiscovery(question);
export const asksForPracticalLookup = (question: string) =>
  /\b(restroom|toilet|bathroom|atm|pharmacy)\b/i.test(question)
  && /\b(where|find|near|nearby|around)\b/i.test(question);
export const explicitlyNearDevice = (question: string) =>
  /\b(near me|around me|where i am|my current location|my location|from my location|from me|close to me|nearby to me|how far am i)\b/i.test(question);
export const implicitlyNearDevice = (question: string) =>
  /\b(nearby|around here|what's around here|what is around here)\b/i.test(question)
  && !/\b(near (?:the|this) (?:venue|show|concert|event)|near my (?:hotel|office)|inside (?:this|the|a) mall)\b/i.test(question);
export const needsDevicePosition = (question: string, hasActivePlaceScene: boolean) =>
  explicitlyNearDevice(question) || (!hasActivePlaceScene
    && (((asksForDiningDiscovery(question) || asksForAreaDiscovery(question)) && implicitlyNearDevice(question))
      || asksForPracticalLookup(question)));
export const visibleReferences = (entities: ResolvedEntity[]) => entities.filter((entity) => entity.source !== 'qloo' && isConfirmed(entity));
export const namedInQuestion = (name: string, question: string) => question.toLocaleLowerCase().includes(name.toLocaleLowerCase());
