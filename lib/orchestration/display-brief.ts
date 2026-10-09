import type { LlmService } from '@/lib/llm/service';
import type { TasteProfile } from '@/types/taste';
import type { ShelfContext } from '@/types/context';
import { shelfBriefItemSchema, shelfFactFieldSchema } from '@/schemas/context';
import type { z } from 'zod';
import { displayCategories } from '@/lib/display/categories';

type Field = z.infer<typeof shelfFactFieldSchema>;

/** One model call labels the visible inventory and prepares deeper facts for the shortlist. */
export async function buildShelfBrief(shelf: ShelfContext, profile: TasteProfile | undefined, llm?: LlmService): Promise<ShelfContext> {
  const fields: readonly Field[] = displayCategories[shelf.kind].briefFields;
  const items = shelf.shortlistIds.flatMap((id, index) => {
    const item = shelf.inventory.find((entry) => entry.qlooId === id && entry.resolution === 'matched');
    return item ? [{ qlooId: id, title: item.title, visibleAuthor: item.visibleAuthor, visibleRelatedName: item.visibleRelatedName,
      visiblePlatform: item.visiblePlatform, visibleEdition: item.visibleEdition, rank: index + 1,
      exactInterest: Boolean(item.exactInterest), contributors: item.contributingInterestIds?.flatMap((interestId) =>
        profile?.entities.find((interest) => interest.id === interestId)?.name ?? []) ?? [] }] : [];
  });
  if (!shelf.inventory.length || !llm?.createShelfBrief) return shelf;
  let result: Awaited<ReturnType<NonNullable<LlmService['createShelfBrief']>>> = { labels: [], items: [] };
  try { result = await llm.createShelfBrief({ kind: shelf.kind, interests: profile?.entities ?? [],
    inventory: shelf.inventory.map((item) => ({ title: item.title, visibleAuthor: item.visibleAuthor, visibleRelatedName: item.visibleRelatedName,
      visiblePlatform: item.visiblePlatform, visibleEdition: item.visibleEdition, resolved: item.resolution === 'matched' })), items }); }
  catch { /* Capture still returns the visible inventory and available Qloo ranking. */ }
  const labels = new Map<number, { category?: string; genre?: string }>();
  for (const entry of result.labels) {
    if (!Number.isInteger(entry.index) || entry.index < 0 || entry.index >= shelf.inventory.length || labels.has(entry.index)) continue;
    const category = shelf.kind === 'book' && entry.category?.trim() && entry.category.trim().length <= 80 ? entry.category.trim() : undefined;
    const genre = entry.genre?.trim() && entry.genre.trim().length <= 80 ? entry.genre.trim() : undefined;
    if (category || genre) labels.set(entry.index, { category, genre });
  }
  // A shortlist fact can still supply a missing label without another model call.
  for (const item of items) {
    const index = shelf.inventory.findIndex((entry) => entry.qlooId === item.qlooId);
    const fact = result.items.find((entry) => entry.qlooId === item.qlooId)?.facts.find((entry) => entry.field === 'genre');
    if (index >= 0 && !labels.get(index)?.genre && fact?.value.trim() && fact.value.trim().length <= 80)
      labels.set(index, { ...labels.get(index), genre: fact.value.trim() });
  }
  const inventory = shelf.inventory.map((item, index) => {
    const label = labels.get(index);
    return label ? { ...item,
      ...(label.category ? { category: label.category, categoryProvenance: 'MODEL' as const } : {}),
      ...(label.genre ? { genre: label.genre, genreProvenance: 'MODEL' as const } : {}),
    } : item;
  });
  const allowed = new Set(fields);
  const briefItems = items.map((item) => {
    const seen = new Set<Field>();
    const facts = (result.items.find((entry) => entry.qlooId === item.qlooId)?.facts ?? []).flatMap((fact) => {
      if (!allowed.has(fact.field) || seen.has(fact.field) || !fact.value.trim()) return [];
      seen.add(fact.field);
      return [{ field: fact.field, value: fact.value.trim(), provenance: 'MODEL' as const }];
    });
    const index = inventory.findIndex((entry) => entry.qlooId === item.qlooId);
    if (!seen.has('genre') && index >= 0 && inventory[index].genre && allowed.has('genre')) {
      facts.push({ field: 'genre', value: inventory[index].genre, provenance: 'MODEL' });
      seen.add('genre');
    }
    return shelfBriefItemSchema.parse({ qlooId: item.qlooId, facts, unknownFields: fields.filter((field) => !seen.has(field)) });
  });
  return { ...shelf, inventory, briefItems, briefCreatedAt: new Date().toISOString() };
}
