import { ApiError } from '@/lib/api/server';
import type { QlooService } from '@/lib/qloo/service';
import type { TasteDraft, TasteProfile } from '@/types/taste';

export async function resolveTasteInterests(inputs: { label: string; category: string }[], qloo: QlooService, allowUnavailable = false): Promise<TasteDraft> {
  const detections = inputs.slice(0, 100).map((interest) => ({ ...interest, confidence: 1, culturallyRelevant: true }));
  const resolved: Awaited<ReturnType<QlooService['resolveEntities']>> = [];
  let unavailable = false;
  for (let offset = 0; offset < detections.length; offset += 8) {
    const batch = detections.slice(offset, offset + 8);
    try { resolved.push(...await qloo.resolveEntities(batch)); }
    catch (error) {
      if (!allowUnavailable) throw error;
      unavailable = true;
      // Preserve every stated interest, and stop repeating calls during an outage.
      resolved.push(...detections.slice(offset).map((item) => ({ detectedName: item.label, detectedCategory: item.category, visionConfidence: 1 })));
      break;
    }
  }
  return { candidates: resolved.map((entity) => {
    const base = { label: entity.detectedName, category: entity.detectedCategory };
    if (entity.qlooId && entity.qlooName && entity.qlooType && (entity.matchConfidence ?? 0) >= 0.75) return { ...base, status: 'matched' as const, entity: { id: entity.qlooId, name: entity.qlooName, type: entity.qlooType } };
    if (entity.candidates?.length) return { ...base, status: 'clarify' as const, candidates: entity.candidates };
    return { ...base, status: 'no_match' as const };
  }), ...(unavailable ? { warnings: ['Some interest connections are unavailable right now.'] } : {}) };
}
export function confirmTasteProfile(draft: TasteDraft, includedIds: string[], clarified: { label: string; entityId: string }[] = []): TasteProfile {
  const selected = clarified.map((choice) => {
    const candidate = draft.candidates.find((item) => item.label === choice.label && item.status === 'clarify');
    const entity = candidate?.status === 'clarify' ? candidate.candidates.find((item) => item.id === choice.entityId) : undefined;
    if (!entity) throw new ApiError(400, 'INVALID_CLARIFICATION', 'Choose one of the Qloo matches shown for this interest, or leave it out.');
    return entity;
  });
  const matched = [...draft.candidates.flatMap((candidate) => candidate.status === 'matched' ? [candidate.entity] : []), ...selected];
  const ids = new Set(includedIds);
  if ([...ids].some((id) => !matched.some((entity) => entity.id === id))) throw new ApiError(400, 'UNRESOLVED_INTEREST', 'Only matched interests can be added. You can leave unresolved interests out and continue.');
  const entities = [...new Map(matched.filter((entity) => ids.has(entity.id)).map((entity) => [entity.id, entity])).values()];
  if (!entities.length) throw new ApiError(400, 'EMPTY_PROFILE', 'Choose a matched interest or continue without a profile.');
  return { entities };
}
