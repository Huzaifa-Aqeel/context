import type { VisionEntity } from '@/types/context';
import { displayCategories, type DisplayKind } from '@/lib/display/categories';

export type ShelfResolutionEntry = { kind: DisplayKind; title: string; author?: string; relatedName?: string; qlooId: string; qlooName: string; qlooType: string };
export type FlyerResolutionEntry = { kind: 'flyer'; title: string; qlooId: string; qlooName: string; qlooType: string };
export type ResolutionEntry = ShelfResolutionEntry | FlyerResolutionEntry;
const normalize = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const flyerResolutionKey = (type: string, name: string) => `flyer:${type}:${normalize(name)}`;
export function shelfResolutionKey(kind: DisplayKind, title: string, author?: string) {
  return `${kind}:${normalize(title)}:${displayCategories[kind].identityUsesRelatedName ? normalize(author ?? '') : ''}`;
}
export function cachedShelfMatch(kind: DisplayKind, item: VisionEntity, entries: ResolutionEntry[]) {
  const key = shelfResolutionKey(kind, item.label, displayCategories[kind].identityUsesRelatedName ? item.relatedName : undefined);
  const type = displayCategories[kind].qlooType;
  return entries.filter((entry): entry is ShelfResolutionEntry => entry.kind !== 'flyer')
    .find((entry) => entry.qlooType === type && shelfResolutionKey(entry.kind, entry.title, entry.relatedName ?? entry.author) === key);
}
