import { jsonRoute } from '@/lib/api/server';
import { extractStructuredTasteInterests, extractTasteInterests } from '@/lib/providers';
import { QlooClient } from '@/lib/qloo/client';
import { qlooConfig } from '@/lib/server/config';
import { sealDocument } from '@/lib/server/evidence';
import { resolveTasteInterests } from '@/lib/taste/profile';
import { tasteDraftSchema, tasteResolveRequestSchema } from '@/schemas/taste';
export const POST = jsonRoute(tasteResolveRequestSchema, tasteDraftSchema, async ({ text, format }) => {
  if (format === 'categorized') {
    const structuredInterests = await extractStructuredTasteInterests(text);
    const categories = { movies_tv: 'unknown', music_artists: 'artist', books_podcasts: 'book_or_podcast', dining_food: 'unknown', places_travel: 'unknown', brands: 'brand', video_games: 'game', other: 'unknown' } as const;
    const candidates = [...new Map(Object.entries(structuredInterests).flatMap(([group, names]) => names.map((label) => [label.toLowerCase(), { label, category: categories[group as keyof typeof categories] }] as const))).values()];
    let draft;
    try { draft = await resolveTasteInterests(candidates, new QlooClient(qlooConfig()), true); }
    catch { draft = { candidates: candidates.map((interest) => ({ ...interest, status: 'no_match' as const })), warnings: ['Some interest connections are unavailable right now.'] }; }
    return sealDocument({ ...draft, structuredInterests }, 'taste-draft');
  }
  const candidates = await extractTasteInterests(text);
  const draft = await resolveTasteInterests(candidates, new QlooClient(qlooConfig()));
  return sealDocument(draft, 'taste-draft');
});
