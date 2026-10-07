import { isConfirmed } from '@/lib/qloo/confirmed';
import type { QlooService } from '@/lib/qloo/service';
import type { LocationContext, Scene } from '@/types/context';
import type { TasteContext, TasteEntity, TasteProfile } from '@/types/taste';
export function tasteReferences(scene?: Scene, location?: LocationContext): TasteEntity[] {
  const visible = scene?.culturalEvidence.entities.filter((entity) => entity.source !== 'qloo' && isConfirmed(entity)).map((entity) => ({ id: entity.qlooId!, name: entity.qlooName ?? entity.detectedName, type: entity.qlooType ?? 'urn:entity:unknown' })) ?? [];
  const local = (location ?? scene?.locationContext)?.facts?.map((fact) => ({ id: fact.entityId, name: fact.name, type: fact.category })) ?? [];
  return [...new Map([...visible, ...local].map((entity) => [entity.id, entity])).values()].slice(0, 30);
}
export async function investigateTaste(profile: TasteProfile, references: TasteEntity[], qloo: QlooService): Promise<TasteContext> {
  try {
    const result = await qloo.analyzeTaste(profile.entities, references);
    return { ...result, profileSignature: profile.signature!, referenceIds: references.map((entity) => entity.id).sort() };
  } catch {
    return { profileSignature: profile.signature!, referenceIds: references.map((entity) => entity.id).sort(), connections: [], warnings: ['Interest connections are unavailable right now. Environmental cultural context is still available.'] };
  }
}
