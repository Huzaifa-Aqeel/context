import type { LlmService } from '@/lib/llm/service';
import type { Answer, AskRequest, ShelfContext } from '@/types/context';
import type { ResearchService } from '@/lib/research/tavily';
import { displayCategories } from '@/lib/display/categories';
import { researchDisplayQuestion } from './display-research';

type Item = ShelfContext['inventory'][number];
const normalized = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function namedItems(shelf: ShelfContext, text: string) {
  const question = ` ${normalized(text)} `;
  return shelf.inventory.filter((item) => normalized(item.title).length >= 3 && question.includes(` ${normalized(item.title)} `));
}
function field(shelf: ShelfContext, item: Item, name: string) {
  return shelf.briefItems?.find((entry) => entry.qlooId === item.qlooId)?.facts.find((fact) => fact.field === name)?.value;
}
function positive(value: string) {
  return !/\b(no|not|without|unavailable|unsupported|doesn.t|does not|unknown|unclear|uncertain|maybe|unverified)\b/i.test(value)
    && /\b(yes|supports|offers|includes|available|playable|has|can play)\b/i.test(value);
}

/** Shelf conversations never enter the general locality, Places, or web-tool router. */
export async function exploreShelf(request: AskRequest, llm: LlmService, research?: ResearchService): Promise<Answer> {
  const scene = request.scene!;
  let shelf = scene.shelf!;
  const answer = (text: string, confidence: Answer['confidence'] = 'medium'): Answer => ({ answer: text, confidence, scene: { ...scene, shelf } });

  const question = request.question;
  const named = namedItems(shelf, question);
  const focus = named[0] ?? [...request.messages].reverse().filter((message) => message.role === 'user').flatMap((message) => namedItems(shelf, message.content))[0]
    ?? (shelf.inventory.length === 1 ? shelf.inventory[0] : undefined);
  const checkMissing = async () => {
    const result = await researchDisplayQuestion(request, shelf, focus, llm, research);
    shelf = result.shelf;
    return answer(result.answer, result.confidence);
  };
  if (/\b(which|what|list|name)\b.*\b(books?|games?|titles?)\b.*\b(here|visible|identify|see|on this shelf)\b|\bwhat did you (identify|see)\b/i.test(question)) {
    const titles = shelf.inventory.map((item) => item.title);
    return answer(titles.length ? `I identified ${shelf.inventory.length} ${displayCategories[shelf.kind].itemName} titles: ${titles.join(', ')}.` : 'I could not read a title on this shelf.', titles.length ? 'high' : 'low');
  }
  if (/\b(this|that|it|this one|that one)\b/i.test(question) && !named.length && !focus && shelf.inventory.length > 1)
    return answer('Which visible title do you mean?', 'low');

  if (/\b(one of my interests|in my interests|already in my (profile|interests))\b/i.test(question) && named.length === 1) {
    const item = named[0];
    if (item.resolution !== 'matched' || !item.qlooId) return answer(`I can read ${item.title}, but I could not match it uniquely to check your interests.`, 'low');
    return answer(request.profile?.entities.some((interest) => interest.id === item.qlooId)
      ? `Yes. ${item.title} is one of your saved interests.` : `No. ${item.title} is not one of your saved interests.`, 'high');
  }
  if (/\b(which|what)\b.*\b(rank(ed)?|fits? (me|my interests)|top (pick|match))\b|\bwhich one fits me best\b/i.test(question)
    && !/\b(co.op|multiplayer|accessible|accessibility|shorter|longer|genre|platform)\b/i.test(question)) {
    const top = shelf.shortlistIds.flatMap((id) => shelf.inventory.find((item) => item.qlooId === id) ?? [])[0];
    return top ? answer(`${top.title} ranks highest among the visible titles I could match to your interests.`)
      : answer('I could not get a taste ranking for the visible titles right now.', 'low');
  }
  if (focus && /\b(platform|system|console)\b/i.test(question) && /\b(this copy|case|box|shown|visible|on the shelf|in the image)\b/i.test(question) && focus.visiblePlatform)
    return answer(`${focus.title} shows ${focus.visiblePlatform} on this copy.`, 'high');

  const localCoop = /\b(local|couch|split.screen)\s+co.op\b/i.test(question);
  const onlineCoop = /\bonline\s+co.op\b/i.test(question);
  const coOpField = localCoop ? 'local_coop' : onlineCoop ? 'online_coop' : undefined;
  if (shelf.kind === 'game' && coOpField && /\b(which|best|recommend|pick)\b/i.test(question)) {
    const matched = shelf.shortlistIds.flatMap((id) => shelf.inventory.find((item) => item.qlooId === id) ?? [])
      .find((item) => { const value = field(shelf, item, coOpField); return value && positive(value); });
    return matched ? answer(`${matched.title} is the highest-ranked visible game I know supports ${localCoop ? 'local' : 'online'} co-op.`)
      : (!shelf.shortlistIds.length && shelf.inventory.length > 0 || shelf.shortlistIds.some((id) => {
        const item = shelf.inventory.find((entry) => entry.qlooId === id);
        return item && !field(shelf, item, coOpField);
      }))
        ? checkMissing() : answer(`I don't know which ranked game here supports ${localCoop ? 'local' : 'online'} co-op.`, 'low');
  }
  if (shelf.kind === 'game' && coOpField && focus && named.length <= 1) {
    const value = field(shelf, focus, coOpField);
    return value ? answer(`${focus.title}: ${value.replace(/[.!?]+$/, '')}.`)
      : checkMissing();
  }
  if (shelf.kind === 'game' && /\b(accessibility|accessible features?)\b/i.test(question) && focus && !field(shelf, focus, 'accessibility_features'))
    return checkMissing();
  if (focus?.resolution !== 'matched' && focus && /\b(why|fit|interest|rank)\b/i.test(question))
    return answer(`I can read ${focus.title}, but I could not match it uniquely in Qloo, so I cannot assess its taste ranking.`, 'low');
  if (/\b(open|buy|save|navigate|directions|tickets?)\b/i.test(question))
    return answer('I can help compare these titles, but I cannot complete that action from this shelf yet.', 'low');
  if (/\b(current price|cost now|in stock|available now|latest review|critic score)\b/i.test(question))
    return checkMissing();
  const requestedField = displayCategories[shelf.kind].questionFields.find((entry) => entry.pattern.test(question))?.field;
  if (focus && requestedField && !field(shelf, focus, requestedField)) return checkMissing();
  if (!llm.answerShelfQuestion) return answer('I do not have enough information to answer that shelf question.', 'low');
  let result;
  try { result = await llm.answerShelfQuestion({ question, messages: request.messages.slice(-6), shelf, interests: request.profile?.entities ?? [] }); }
  catch { return answer('I could not answer that right now. Try asking about one visible title.', 'low'); }
  if (result.needsResearch) return checkMissing();
  return answer(result.answer, result.confidence);
}
