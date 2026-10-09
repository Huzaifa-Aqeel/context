/** IDs verified against Qloo's /v2/tags lookup during configuration, not at request time. */
export const QLOO_PLACE_TAGS = {
  restaurant: 'urn:tag:category:place:restaurant',
  cafe: ['urn:tag:category:place:cafe'],
  bookstore: ['urn:tag:category:place:book_store'],
  record_store: ['urn:tag:category:place:record_store'],
  museum_gallery: ['urn:tag:category:place:museum', 'urn:tag:category:place:art_gallery'],
  live_music: ['urn:tag:category:place:live_music_venue', 'urn:tag:category:place:live_music_bar'],
  park: ['urn:tag:category:place:park'],
} as const;

export type CulturalPlaceBucket = Exclude<keyof typeof QLOO_PLACE_TAGS, 'restaurant'> | 'other';
export const culturalBuckets = [
  { bucket: 'live_music', priority: 100, geoapify: ['entertainment.culture.theatre', 'activity.events_venue', 'adult.nightclub', 'catering.bar', 'catering.pub'] },
  { bucket: 'museum_gallery', priority: 90, geoapify: ['entertainment.museum', 'entertainment.culture.gallery'] },
  { bucket: 'record_store', priority: 80, geoapify: ['commercial.video_and_music', 'commercial.hobby.music'] },
  { bucket: 'bookstore', priority: 70, geoapify: ['commercial.books'] },
  { bucket: 'cafe', priority: 60, geoapify: ['catering.cafe'] },
  { bucket: 'park', priority: 50, geoapify: ['leisure.park'] },
] as const;

export function classifyQlooPlace(tagIds: string[]): CulturalPlaceBucket {
  return culturalBuckets.find((item) => QLOO_PLACE_TAGS[item.bucket].some((id) => tagIds.includes(id)))?.bucket ?? 'other';
}
export function geoapifyCategories(bucket: CulturalPlaceBucket): string[] {
  return culturalBuckets.find((item) => item.bucket === bucket)?.geoapify.slice() ??
    ['catering', 'entertainment', 'commercial', 'leisure'];
}
export function classifyGeoapifyPlace(categories: string[]): CulturalPlaceBucket {
  return culturalBuckets.find((item) => item.geoapify.some((allowed) =>
    categories.some((category) => category === allowed || category.startsWith(`${allowed}.`))))?.bucket ?? 'other';
}
