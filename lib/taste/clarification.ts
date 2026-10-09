import type { TasteDraft } from '@/types/taste';

type Candidate = Extract<TasteDraft['candidates'][number], { status: 'clarify' }>;
const normalize = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const authorOf = (name: string) => name.split(' — ')[1]?.replace(/^\d{4},\s*/, '').trim();

export function bookClarification(draft: TasteDraft): Candidate | undefined {
  return draft.candidates.find((item): item is Candidate => item.status === 'clarify'
    && ['book', 'book_or_podcast'].includes(item.category)
    && item.candidates.some((candidate) => candidate.type === 'urn:entity:book'));
}
export function bookClarificationPrompt(item: Candidate) {
  const authors = [...new Set(item.candidates.flatMap((candidate) => candidate.type === 'urn:entity:book' ? authorOf(candidate.name) ?? [] : []))];
  return authors.length
    ? `I found more than one book called ${item.label}. Which author do you mean? I found ${authors.join(' and ')}. Say the author, or say skip.`
    : `I found more than one match for ${item.label}. Say which one you mean, or say skip.`;
}
export function selectBookClarification(item: Candidate, response: string) {
  if (/\b(skip|leave it out|none|don't know|do not know)\b/i.test(response)) return { skip: true as const };
  const spoken = normalize(response);
  const matches = item.candidates.filter((candidate) => {
    const author = authorOf(candidate.name);
    if (!author) return false;
    const full = normalize(author);
    return spoken.includes(full) || full.split(' ').some((part) => part.length >= 5 && spoken.split(' ').includes(part));
  });
  return matches.length === 1 ? { skip: false as const, entityId: matches[0].id } : undefined;
}
