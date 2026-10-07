import { ApiError } from '@/lib/api/server';
import type { QlooService } from '@/lib/qloo/service';
import type { TasteDraft, TasteProfile } from '@/types/taste';

export async function resolveTasteInterests(inputs: { label: string; category: string }[], qloo: QlooService): Promise<TasteDraft> {
  const detections = inputs.slice(0, 10).map((interest) => ({ ...interest, confidence: 1, culturallyRelevant: true }));
  const resolved = [...await qloo.resolveEntities(detections.slice(0, 8)), ...(detections.length > 8 ? await qloo.resolveEntities(detections.slice(8)) : [])];
  return { candidates: resolved.map((entity) => {
    const base = { label: entity.detectedName, category: entity.detectedCategory };
    if (entity.qlooId && entity.qlooName && entity.qlooType && (entity.matchConfidence ?? 0) >= 0.75) return { ...base, status: 'matched' as const, entity: { id: entity.qlooId, name: entity.qlooName, type: entity.qlooType } };
    if (entity.candidates?.length) return { ...base, status: 'clarify' as const, candidates: entity.candidates };
    return { ...base, status: 'no_match' as const };
  }) };
}
export function confirmTasteProfile(draft: TasteDraft, includedIds: string[]): TasteProfile {
  const matched = draft.candidates.flatMap((candidate) => candidate.status === 'matched' ? [candidate.entity] : []);
  const ids = new Set(includedIds);
  if ([...ids].some((id) => !matched.some((entity) => entity.id === id))) throw new ApiError(400, 'UNRESOLVED_INTEREST', 'Only matched interests can be added. You can leave unresolved interests out and continue.');
  const entities = [...new Map(matched.filter((entity) => ids.has(entity.id)).map((entity) => [entity.id, entity])).values()];
  if (!entities.length) throw new ApiError(400, 'EMPTY_PROFILE', 'Choose a matched interest or continue without a profile.');
  return { entities };
}
