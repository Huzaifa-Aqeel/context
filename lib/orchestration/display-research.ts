import type { LlmService } from '@/lib/llm/service';
import type { ResearchService, ResearchSource } from '@/lib/research/tavily';
import type { AskRequest, ShelfContext } from '@/types/context';
import { displayCategories } from '@/lib/display/categories';

type Item = ShelfContext['inventory'][number];
type ResearchCheck = NonNullable<ShelfContext['researchChecks']>[number];
const normalize = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const fresh = (value: string, question: string) => Date.now() - new Date(value).getTime() <
  (/\b(now|today|current|stock|available|price|latest|review)\b/i.test(question) ? 5 : 60) * 60_000;
const unknown = 'I could not verify that detail for the visible title right now.';

function relevant(source: ResearchSource, item: Item, question: string) {
  const content = ` ${normalize(`${source.title} ${source.content}`)} `;
  const title = normalize(item.title);
  if (!title || !content.includes(` ${title} `)) return false;
  const related = item.visibleRelatedName ?? item.visibleAuthor;
  if (related && !content.includes(` ${normalize(related)} `)) return false;
  if (item.visiblePlatform && /\b(co.op|multiplayer|platform|system|console|this copy|this case)\b/i.test(question)
    && !content.includes(` ${normalize(item.visiblePlatform)} `)) return false;
  return true;
}

/** Research only a missing answer about photographed titles. Retain bounded evidence in the active scene. */
export async function researchDisplayQuestion(request: AskRequest, shelf: ShelfContext, focus: Item | undefined,
  llm: LlmService, research?: ResearchService): Promise<{ shelf: ShelfContext; answer: string; confidence: 'low' | 'medium' | 'high' }> {
  const targets = focus ? [focus] : shelf.shortlistIds.flatMap((id) => shelf.inventory.find((item) => item.qlooId === id) ?? []).slice(0, 4);
  if (!targets.length && shelf.inventory.length === 1) targets.push(shelf.inventory[0]);
  if (!targets.length) return { shelf, answer: 'Which visible title do you want me to check?', confidence: 'low' };
  const key = `${request.profile?.signature ?? 'none'}|${normalize(request.question)}|${targets.map((item) =>
    `${normalize(item.title)}:${normalize(item.visibleRelatedName ?? item.visibleAuthor ?? '')}:${normalize(item.visiblePlatform ?? '')}`).join('|')}`.slice(0, 500);
  const cached = shelf.researchChecks?.find((check) => check.key === key && fresh(check.checkedAt, request.question));
  if (cached) return { shelf, answer: cached.answer ?? unknown, confidence: cached.confidence ?? 'low' };
  if (!research || !llm.answerDisplayResearchQuestion) return { shelf, answer: 'I cannot check that detail right now.', confidence: 'low' };

  const sources: ResearchCheck['sources'] = [];
  for (const item of targets) {
    const related = item.visibleRelatedName ?? item.visibleAuthor;
    const query = [`"${item.title}"`, related ? `"${related}"` : '',
      item.visiblePlatform ? `"${item.visiblePlatform}"` : '', item.visibleEdition ? `"${item.visibleEdition}"` : '',
      displayCategories[shelf.kind].itemName, request.question].filter(Boolean).join(' ').slice(0, 500);
    try {
      const results = await research.search(query);
      for (const source of results.filter((entry) => relevant(entry, item, request.question)).slice(0, targets.length === 1 ? 2 : 1)) {
        if (!sources.some((entry) => entry.url === source.url)) sources.push({
          title: (source.title.trim() || new URL(source.url).hostname).slice(0, 500), url: source.url,
          content: source.content.trim().slice(0, 1200), retrievedAt: source.retrievedAt,
        });
      }
    } catch { /* Preserve partial research from other visible titles. */ }
    if (sources.length >= 4) break;
  }
  let answer = unknown;
  let confidence: 'low' | 'medium' | 'high' = 'low';
  if (sources.length) {
    try {
      const result = await llm.answerDisplayResearchQuestion({ question: request.question,
        messages: request.messages.slice(-6), shelf, interests: request.profile?.entities ?? [], sources });
      const supplied = new Set(sources.map((source) => source.url));
      if (result.usedSourceUrls.length && result.usedSourceUrls.every((url) => supplied.has(url))) {
        answer = result.answer;
        confidence = result.confidence;
      }
    } catch { /* Unsupported or unreadable research never becomes a factual answer. */ }
  }
  const check: ResearchCheck = { key, checkedAt: new Date().toISOString(), answer, confidence, sources };
  return { shelf: { ...shelf, researchChecks: [...(shelf.researchChecks ?? []).filter((entry) => entry.key !== key), check].slice(-8) },
    answer, confidence };
}
