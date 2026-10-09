import type { QlooService, ShelfRanking } from '@/lib/qloo/service';
import { isConfirmed } from '@/lib/qloo/confirmed';
import { shelfContextSchema } from '@/schemas/context';
import type { ResolvedEntity, Scene, ShelfContext, VisionEntity } from '@/types/context';
import type { TasteProfile } from '@/types/taste';
import type { LlmService } from '@/lib/llm/service';
import { shelfResolutionKey, type ShelfResolutionEntry } from '@/lib/qloo/display-resolution-cache';
import { buildShelfBrief } from './display-brief';
import { displayCategories, type DisplayKind } from '@/lib/display/categories';

const normalized = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function shelfSummary(shelf: ShelfContext) {
  const category = displayCategories[shelf.kind];
  const visible = shelf.inventory;
  const confirmed = visible.filter((item) => item.resolution === 'matched');
  const exact = visible.filter((item) => item.exactInterest);
  const unfamiliar = shelf.shortlistIds.filter((id) => !visible.some((item) => item.qlooId === id && item.exactInterest)).slice(0, 4)
    .flatMap((id) => visible.find((item) => item.qlooId === id)?.title ?? []);
  const spokenMatches = unfamiliar;
  const label = visible.length === 1 ? category.itemName : category.itemPlural;
  let summary = visible.length ? `I can identify ${visible.length} ${label} here.` : `I could not confidently read any ${category.itemName} titles here.`;
  if (visible.length) {
    const names = visible.map((item) => {
      const author = shelf.kind === 'book' && item.visibleAuthor ? ` by ${item.visibleAuthor}` : '';
      const platform = shelf.kind === 'game' && item.visiblePlatform ? ` on ${item.visiblePlatform}` : '';
      const labels = [shelf.kind === 'book' ? item.category : undefined, item.genre]
        .filter((value, index, all): value is string => Boolean(value) && all.findIndex((other) => other?.toLowerCase() === value?.toLowerCase()) === index);
      return `${item.title}${author}${platform}${labels.length ? `, ${labels.join(', ')}` : ''}`;
    });
    summary += ` The titles I can read are: ${names.join('; ')}.`;
    const unknownGenres = visible.filter((item) => !item.genre).length;
    if (unknownGenres) summary += ` I could not confidently identify ${unknownGenres === visible.length ? 'their genres' : `the genre of ${unknownGenres} ${unknownGenres === 1 ? 'title' : 'titles'}`}.`;
  }
  if (exact.length) summary += ` ${exact.map((item) => item.title).join(', ')} ${exact.length === 1 ? 'is' : 'are'} already in your interests.`;
  if (spokenMatches.length) summary += ` ${shelf.rankingComplete ? '' : 'Among the titles I could match, '}${spokenMatches.join(', ')} ${spokenMatches.length === 1 ? 'stands' : 'stand'} out most for your interests.`;
  if (visible.length && !confirmed.length) summary += ' I could not match these titles for a personalized ranking.';
  else if (confirmed.length && !shelf.shortlistIds.length) summary += ' I could not get a taste ranking for the matched titles right now.';
  return summary;
}

export async function analyzeShelf(kind: DisplayKind, detected: VisionEntity[], profile: TasteProfile | undefined, qloo: QlooService, llm?: LlmService, cache: ShelfResolutionEntry[] = []): Promise<Scene> {
  const category = displayCategories[kind];
  const candidates = detected.filter((item) => item.culturallyRelevant && item.confidence >= 0.7 && (category.acceptedVisualCategories as readonly string[]).includes(normalized(item.category).replace(/ /g, '_')));
  const visible = [...new Map(candidates.map((item) => [category.identityUsesRelatedName && item.relatedName
    ? `${normalized(item.label)}|${normalized(item.relatedName)}` : normalized(item.label), item])).values()];
  let ranking: ShelfRanking | undefined;
  if (visible.length && profile?.entities.length && qloo.rankShelf) {
    try { ranking = await qloo.rankShelf(kind, visible, profile.entities, cache); }
    catch { /* Visible inventory survives an unavailable cultural service. */ }
  }
  const resolved: ResolvedEntity[] = visible.map((item, index) => ranking?.resolved[index] ?? {
    detectedName: item.label, detectedCategory: item.category, visionConfidence: item.confidence,
    source: 'vision', resolutionPending: true, carrier: item.carrier, position: item.position,
    visibleText: item.visibleText, visualDescription: item.visualDescription, relatedName: item.relatedName,
    visiblePlatform: item.visiblePlatform, visibleEdition: item.visibleEdition,
  });
  const confirmedIds = new Set(resolved.filter(isConfirmed).map((item) => item.qlooId!));
  const ranked = (ranking?.ranked ?? []).filter((item) => confirmedIds.has(item.entityId));
  const complete = Boolean(ranking?.complete && ranked.length === confirmedIds.size);
  const shortlistIds = [...new Set(ranked.map((item) => item.entityId))].slice(0, 4);
  const byId = new Map(ranked.map((item) => [item.entityId, item]));
  const shelf = await buildShelfBrief(shelfContextSchema.parse({
    kind,
    inventory: resolved.map((item) => ({
      title: item.detectedName, position: item.position,
      visualProvenance: 'VISIBLE',
      visibleAuthor: kind === 'book' ? item.relatedName : undefined,
      visibleRelatedName: item.relatedName,
      visiblePlatform: item.visiblePlatform, visibleEdition: item.visibleEdition,
      qlooId: isConfirmed(item) ? item.qlooId : undefined,
      qlooName: isConfirmed(item) ? item.qlooName : undefined,
      qlooProvenance: isConfirmed(item) ? 'QLOO' : undefined,
      exactInterest: isConfirmed(item) && Boolean(profile?.entities.some((interest) => interest.id === item.qlooId)),
      interestProvenance: isConfirmed(item) && profile?.entities.some((interest) => interest.id === item.qlooId) ? 'USER' : undefined,
      resolution: item.resolutionPending ? 'unavailable' : isConfirmed(item) ? 'matched' : item.candidates?.length ? 'ambiguous' : 'unmatched',
      affinity: isConfirmed(item) ? byId.get(item.qlooId!)?.affinity : undefined,
      contributingInterestIds: isConfirmed(item) ? byId.get(item.qlooId!)?.contributingInterestIds : undefined,
    })),
    shortlistIds, rankingComplete: complete,
    profileSignature: profile?.signature,
  }), profile, llm);
  const evidenceEntities = [...new Map([...resolved.filter((item) => shortlistIds.includes(item.qlooId ?? '')), ...resolved].map((item) => [category.identityUsesRelatedName && item.relatedName
    ? `${normalized(item.detectedName)}|${normalized(item.relatedName)}` : normalized(item.detectedName), item])).values()].slice(0, 30);
  const newEntries: ShelfResolutionEntry[] = resolved.flatMap((item) => isConfirmed(item) && item.qlooName && item.qlooType ? [{
    kind, title: item.detectedName, ...(item.relatedName ? { relatedName: item.relatedName } : {}),
    ...(kind === 'book' && item.relatedName ? { author: item.relatedName } : {}),
    qlooId: item.qlooId!, qlooName: item.qlooName, qlooType: item.qlooType,
  }] : []);
  const resolutionCache = { version: 1 as const, entries: [...new Map([...cache, ...newEntries].map((entry) =>
    [shelfResolutionKey(entry.kind, entry.title, entry.relatedName ?? entry.author), entry])).values()].slice(-100) };
  return {
    origin: 'image', id: crypto.randomUUID(), createdAt: new Date().toISOString(), summary: shelfSummary(shelf),
    confidence: visible.length ? (shortlistIds.length ? 'medium' : 'low') : 'low', shelf, resolutionCache,
    culturalEvidence: { entities: evidenceEntities, relationships: [], themes: [], confidence: 0 },
  };
}
