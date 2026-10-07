import type { Scene } from '@/types/context';
import type { TasteContext, TasteProfile } from '@/types/taste';
import { isConfirmed } from '@/lib/qloo/confirmed';
export function interestConnection(entityId: string | undefined, context?: TasteContext | null) {
  return context?.connections.filter((connection) => connection.referenceId === entityId && (connection.kind === 'exact' || (connection.strength ?? 0) >= 0.6)).sort((a, b) => (b.strength ?? 1) - (a.strength ?? 1))[0];
}

/** A separate spoken view: the signed summary and detected references stay unchanged. */
export function scenePresentation(scene: Scene, profile: TasteProfile | null, context: TasteContext | null, enabled: boolean, strategy: 'balanced' | 'familiar' | 'discover', question: string) {
  if (!enabled || !profile || !context) return scene.summary;
  const ranked = orderedReferences(scene, context, strategy, question);
  const asked = ranked.filter((entity) => question.toLowerCase().includes((entity.qlooName ?? entity.detectedName).toLowerCase()));
  const meaningful = (asked.length ? asked : ranked).filter((entity) => isConfirmed(entity) && interestConnection(entity.qlooId, context));
  const sentences = [scene.summary];
  const focus = meaningful[0];
  const connection = focus ? interestConnection(focus.qlooId, context) : undefined;
  const anchor = profile.entities.find((interest) => interest.id === connection?.interestId);
  if (focus && connection && anchor) {
    sentences.push(connection.kind === 'exact' ? `${focus.qlooName ?? focus.detectedName} is the same Qloo reference as ${anchor.name}, an interest you shared.` : `Qloo returned a cultural affinity between ${focus.qlooName ?? focus.detectedName} and your interest in ${anchor.name}. This suggests cultural overlap, not a specific similarity or a prediction about you.`);
    sentences.push(`${meaningful.length} ${meaningful.length === 1 ? 'reference connects' : 'references connect'} to your interests. You can start with something familiar or discover something new; all other references remain available.`);
  } else sentences.push(`No strong supported interest connection was returned${asked.length ? ' for the requested reference' : ''}. This does not mean the references are unfamiliar to you; all references remain available.`);
  if (strategy === 'discover') {
    const fresh = ranked.find((entity) => isConfirmed(entity) && !interestConnection(entity.qlooId, context));
    if (fresh) sentences.push(`You could explore ${fresh.qlooName ?? fresh.detectedName} next. It has no strong returned interest connection; that is not a claim that you do not know it.`);
  }
  return sentences.join(' ');
}
/** Sort a copied view; never mutate the signed scene or change detections on a toggle. */
export function orderedReferences(scene: Scene, context?: TasteContext | null, strategy: 'balanced' | 'familiar' | 'discover' = 'balanced', question = '', necessaryIds: string[] = []) {
  const visible = scene.culturalEvidence.entities.filter((entity) => entity.source !== 'qloo');
  const importance = (id?: string) => Math.floor(Math.max(0, ...scene.culturalEvidence.relationships.filter((relationship) => relationship.source === id || relationship.target === id).map((relationship) => relationship.strength ?? 0.4)) * 4);
  const categories = new Map<string, number>(); visible.forEach((entity) => categories.set(entity.detectedCategory, (categories.get(entity.detectedCategory) ?? 0) + 1));
  const explicit = (name: string) => question.toLowerCase().includes(name.toLowerCase()) ? 1 : 0;
  return [...visible].sort((a, b) => {
    const necessary = Number(necessaryIds.includes(b.qlooId ?? '')) - Number(necessaryIds.includes(a.qlooId ?? ''));
    const asked = explicit(b.qlooName ?? b.detectedName) - explicit(a.qlooName ?? a.detectedName);
    const confirmed = Number(isConfirmed(b)) - Number(isConfirmed(a));
    const confidence = Math.floor(Math.min(b.visionConfidence, b.matchConfidence ?? b.visionConfidence) * 10) - Math.floor(Math.min(a.visionConfidence, a.matchConfidence ?? a.visionConfidence) * 10);
    const significance = importance(b.qlooId) - importance(a.qlooId);
    const distinctiveness = (categories.get(a.detectedCategory) ?? 1) - (categories.get(b.detectedCategory) ?? 1);
    const familiarA = interestConnection(a.qlooId, context); const familiarB = interestConnection(b.qlooId, context);
    const taste = strategy === 'discover' ? Number(Boolean(familiarA)) - Number(Boolean(familiarB)) : (familiarB?.strength ?? (familiarB ? 1 : 0)) - (familiarA?.strength ?? (familiarA ? 1 : 0));
    return necessary || asked || confirmed || confidence || significance || distinctiveness || (context ? taste : 0);
  });
}
