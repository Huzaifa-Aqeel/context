import type { Scene } from '@/types/context';
import type { TasteContext } from '@/types/taste';
import { isConfirmed } from '@/lib/qloo/confirmed';
export function interestConnection(entityId: string | undefined, context?: TasteContext | null) {
  return context?.connections.filter((connection) => connection.referenceId === entityId && (connection.kind === 'exact' || (connection.strength ?? 0) >= 0.6)).sort((a, b) => (b.strength ?? 1) - (a.strength ?? 1))[0];
}
/** Sort a copied view; never mutate the signed scene or change detections on a toggle. */
export function orderedReferences(scene: Scene, context?: TasteContext | null, strategy: 'balanced' | 'familiar' | 'discover' = 'balanced', question = '', necessaryIds: string[] = []) {
  const visible = scene.culturalEvidence.entities.filter((entity) => entity.source !== 'qloo');
  const importance = (id?: string) => scene.culturalEvidence.relationships.some((relationship) => (relationship.source === id || relationship.target === id) && (relationship.strength ?? 0) >= 0.75) ? 2 : 1;
  const explicit = (name: string) => question.toLowerCase().includes(name.toLowerCase()) ? 1 : 0;
  return [...visible].sort((a, b) => {
    const necessary = Number(necessaryIds.includes(b.qlooId ?? '')) - Number(necessaryIds.includes(a.qlooId ?? ''));
    const asked = explicit(b.qlooName ?? b.detectedName) - explicit(a.qlooName ?? a.detectedName);
    const confirmed = Number(isConfirmed(b)) - Number(isConfirmed(a));
    const significance = importance(b.qlooId) - importance(a.qlooId);
    const familiarA = interestConnection(a.qlooId, context); const familiarB = interestConnection(b.qlooId, context);
    const taste = strategy === 'discover' ? Number(Boolean(familiarA)) - Number(Boolean(familiarB)) : (familiarB?.strength ?? (familiarB ? 1 : 0)) - (familiarA?.strength ?? (familiarA ? 1 : 0));
    return necessary || asked || confirmed || significance || (context ? taste : 0);
  });
}
