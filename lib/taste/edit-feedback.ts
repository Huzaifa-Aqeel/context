import { interestGroups } from '@/schemas/taste';
import type { StructuredInterests, TasteProfile } from '@/types/taste';

export const interestGroupLabels: Record<(typeof interestGroups)[number], string> = {
  movies_tv: 'movies and TV', music_artists: 'music', books_podcasts: 'books and podcasts',
  dining_food: 'food and dining', places_travel: 'places and travel', brands: 'brands',
  video_games: 'video games', other: 'other interests',
};

const normalized = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();

export function displayedInterests(interests: StructuredInterests | null, profile: TasteProfile | null): StructuredInterests {
  if (interests) return interests;
  const groups: StructuredInterests = {
    movies_tv: [], music_artists: [], books_podcasts: [], dining_food: [],
    places_travel: [], brands: [], video_games: [], other: [],
  };
  const bound = new Set<string>();
  for (const binding of profile?.bindings ?? []) {
    groups[binding.category].push(binding.value);
    bound.add(binding.entityId);
  }
  for (const entity of profile?.entities ?? []) {
    if (bound.has(entity.id)) continue;
    const group = entity.type.includes('movie') || entity.type.includes('tv_show') ? 'movies_tv'
      : entity.type.includes('artist') ? 'music_artists'
      : entity.type.includes('book') || entity.type.includes('podcast') ? 'books_podcasts'
      : entity.type.includes('videogame') ? 'video_games'
      : entity.type.includes('brand') ? 'brands'
      : entity.type.includes('place') || entity.type.includes('destination') ? 'places_travel' : 'other';
    groups[group].push(entity.name);
  }
  return groups;
}

export function describeInterestChanges(before: StructuredInterests, after: StructuredInterests): string {
  const added: string[] = [];
  const removed: string[] = [];
  for (const group of interestGroups) {
    for (const value of after[group]) {
      if (!before[group].some((previous) => normalized(previous) === normalized(value))) added.push(`${value} to ${interestGroupLabels[group]}`);
    }
    for (const value of before[group]) {
      if (!after[group].some((next) => normalized(next) === normalized(value))) removed.push(`${value} from ${interestGroupLabels[group]}`);
    }
  }
  if (!added.length && !removed.length) return 'No interests changed.';
  if (added.length + removed.length > 4) {
    return `${removed.length ? `Removed ${removed.length} ${removed.length === 1 ? 'interest' : 'interests'}. ` : ''}${added.length ? `Added ${added.length} ${added.length === 1 ? 'interest' : 'interests'}. ` : ''}Your updated interests are listed above.`;
  }
  return [...removed.map((item) => `Removed ${item}.`), ...added.map((item) => `Added ${item}.`)].join(' ');
}
