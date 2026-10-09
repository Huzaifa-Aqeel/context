import type { Scene } from '@/types/context';
import type { TasteContext, TasteProfile } from '@/types/taste';
import { isConfirmed } from '@/lib/qloo/confirmed';
import { questionNamesEntity, visualName } from '@/lib/orchestration/visual';
export function interestConnection(entityId: string | undefined, context?: TasteContext | null) {
  return context?.connections.filter((connection) => connection.referenceId === entityId && (connection.kind === 'exact' || ((connection.strength ?? 0) >= 0.6 && Boolean(connection.sharedTags?.length)))).sort((a, b) => Number(b.kind === 'exact') - Number(a.kind === 'exact') || (b.sharedTags?.length ?? 0) - (a.sharedTags?.length ?? 0) || (b.strength ?? 0) - (a.strength ?? 0))[0];
}

/** A separate spoken view: the signed summary and detected references stay unchanged. */
export function scenePresentation(scene: Scene, profile: TasteProfile | null, context: TasteContext | null, enabled: boolean, strategy: 'balanced' | 'familiar' | 'discover', question: string) {
  if (scene.shelf) return scene.summary;
  if (!enabled || !profile || !context) return scene.summary;
  const ranked = orderedReferences(scene, context, strategy, question);
  const asked = ranked.filter((entity) => questionNamesEntity(entity, question));
  const meaningful = (asked.length ? asked : ranked).filter((entity) => isConfirmed(entity) && interestConnection(entity.qlooId, context));
  const sentences = [scene.summary];
  const necessary = scene.environmentalObservations?.filter((item) => item.necessaryInformation && item.confidence >= 0.7) ?? [];
  if (necessary.length && !necessary.some((item) => scene.summary.includes(item.label))) sentences.unshift(`The image appears to contain ${necessary.map((item) => item.label).join(', ')}.`);
  const focus = meaningful[0];
  const connection = focus ? interestConnection(focus.qlooId, context) : undefined;
  const anchor = profile.entities.find((interest) => interest.id === connection?.interestId);
  if (focus && connection && anchor) sentences.push(connection.kind === 'exact' ? `${focus.qlooName ?? focus.detectedName} is one of your interests.` : `${focus.qlooName ?? focus.detectedName} and your interest in ${anchor.name} share ${connection.sharedTags!.slice(0, 2).join(' and ')} in Qloo's records.`);
  if (strategy === 'discover') {
    const fresh = ranked.find((entity) => isConfirmed(entity) && !interestConnection(entity.qlooId, context));
    if (fresh) sentences.push(`You could explore ${visualName(fresh)} next.`);
  }
  return sentences.join(' ');
}
/** Sort a copied view; never mutate the signed scene or change detections on a toggle. */
export function orderedReferences(scene: Scene, context?: TasteContext | null, strategy: 'balanced' | 'familiar' | 'discover' = 'balanced', question = '', necessaryIds: string[] = []) {
  const visible = scene.culturalEvidence.entities.filter((entity) => entity.source !== 'qloo');
  const importance = (id?: string) => Math.floor(Math.max(0, ...scene.culturalEvidence.relationships.filter((relationship) => relationship.source === id || relationship.target === id).map((relationship) => relationship.strength ?? 0.4)) * 4);
  const categories = new Map<string, number>(); visible.forEach((entity) => categories.set(entity.detectedCategory, (categories.get(entity.detectedCategory) ?? 0) + 1));
  return [...visible].sort((a, b) => {
    const necessary = Number(necessaryIds.includes(b.qlooId ?? '')) - Number(necessaryIds.includes(a.qlooId ?? ''));
    const asked = Number(questionNamesEntity(b, question)) - Number(questionNamesEntity(a, question));
    const confirmed = Number(isConfirmed(b)) - Number(isConfirmed(a));
    const confidence = Math.floor(Math.min(b.visionConfidence, b.matchConfidence ?? b.visionConfidence) * 10) - Math.floor(Math.min(a.visionConfidence, a.matchConfidence ?? a.visionConfidence) * 10);
    const significance = importance(b.qlooId) - importance(a.qlooId);
    const distinctiveness = (categories.get(a.detectedCategory) ?? 1) - (categories.get(b.detectedCategory) ?? 1);
    const familiarA = interestConnection(a.qlooId, context); const familiarB = interestConnection(b.qlooId, context);
    const taste = strategy === 'discover' ? Number(Boolean(familiarA)) - Number(Boolean(familiarB)) : (familiarB?.strength ?? (familiarB ? 1 : 0)) - (familiarA?.strength ?? (familiarA ? 1 : 0));
    return necessary || asked || confirmed || confidence || significance || distinctiveness || (context ? taste : 0);
  });
}
