import { interestGroups, structuredInterestsSchema, tasteEditOperationSchema } from '@/schemas/taste';
import type { StructuredInterests } from '@/types/taste';
import type { z } from 'zod';

type Operation = z.infer<typeof tasteEditOperationSchema>;
export type InterestItem = { category: (typeof interestGroups)[number]; value: string };
const normalize = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const groupNames: Record<InterestItem['category'], string> = {
  movies_tv: 'movies and TV', music_artists: 'music', books_podcasts: 'books and podcasts', dining_food: 'food and dining',
  places_travel: 'places and travel', brands: 'brands', video_games: 'video games', other: 'other interests',
};
const clearWords: Record<InterestItem['category'], RegExp> = {
  movies_tv: /mov(?:ie|ies)|films?|tv|shows?/i, music_artists: /music|artists?|songs?|bands?/i,
  books_podcasts: /books?|podcasts?/i, dining_food: /food|dining|restaurants?/i,
  places_travel: /places?|travel|cities|countries/i, brands: /brands?/i,
  video_games: /games?|gaming/i, other: /other|everything else/i,
};
function distance(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row++) {
    const next = [row];
    for (let col = 1; col <= b.length; col++) next[col] = Math.min(next[col - 1] + 1, previous[col] + 1, previous[col - 1] + Number(a[row - 1] !== b[col - 1]));
    previous = next;
  }
  return previous[b.length];
}
function mentioned(text: string, value: string) {
  const spoken = normalize(text); const target = normalize(value);
  if (!target) return false;
  if (` ${spoken} `.includes(` ${target} `)) return true;
  const words = spoken.split(' '); const count = target.split(' ').length;
  return words.some((_, index) => index + count <= words.length && target.length >= 5 && distance(words.slice(index, index + count).join(' '), target) <= 2);
}
function matchExisting(values: string[], value: string) {
  const target = normalize(value);
  const exact = values.filter((item) => normalize(item) === target);
  if (exact.length === 1) return exact[0];
  const near = values.filter((item) => target.length >= 5 && distance(normalize(item), target) <= 2);
  return near.length === 1 ? near[0] : undefined;
}

export function applyInterestEdits(current: StructuredInterests, transcript: string, operations: Operation[], modelClarification?: string):
  { interests?: StructuredInterests; added?: InterestItem[]; removed?: InterestItem[]; clarification?: string } {
  if (modelClarification?.trim()) return { clarification: modelClarification.trim() };
  if (!operations.length) return { clarification: 'Tell me what you would like to add or remove from your interests.' };
  const next = Object.fromEntries(interestGroups.map((group) => [group, [...current[group]]])) as StructuredInterests;
  for (const operation of operations) {
    if (operation.action === 'clear') {
      if (!/\b(all|every|everything|entire)\b/i.test(transcript) || !clearWords[operation.category].test(transcript))
        return { clarification: `Do you want to remove all your ${groupNames[operation.category]} interests?` };
      next[operation.category] = []; continue;
    }
    if (!mentioned(transcript, operation.value)) return { clarification: `Please say which ${groupNames[operation.category]} interest you want to ${operation.action}.` };
    if (operation.action === 'add') {
      if (!next[operation.category].some((item) => normalize(item) === normalize(operation.value))) next[operation.category].push(operation.value);
    } else {
      const existing = matchExisting(next[operation.category], operation.value);
      if (!existing) return { clarification: `I couldn't find ${operation.value} in your ${groupNames[operation.category]} interests. What would you like to change?` };
      next[operation.category] = next[operation.category].filter((item) => item !== existing);
    }
  }
  const count = Object.values(next).flat().length;
  if (count > 100) return { clarification: 'Your interests are full. Please remove some before adding more.' };
  const interests = structuredInterestsSchema.parse(next);
  const added = interestGroups.flatMap((category) => interests[category].filter((value) => !current[category].some((item) => normalize(item) === normalize(value))).map((value) => ({ category, value })));
  const removed = interestGroups.flatMap((category) => current[category].filter((value) => !interests[category].some((item) => normalize(item) === normalize(value))).map((value) => ({ category, value })));
  return { interests, added, removed };
}
