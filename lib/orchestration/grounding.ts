import { ApiError } from '@/lib/api/server';
import { isConfirmed } from '@/lib/qloo/confirmed';
import type { EvidenceSelection } from '@/schemas/answer-plan';
import type { AskRequest, CulturalEvidence, LocationContext } from '@/types/context';
import type { TasteContext } from '@/types/taste';

const sentence = (text: string) => /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
const invalid = () => new ApiError(502, 'UNSUPPORTED_EVIDENCE', 'The explanation could not be verified against the current cultural evidence. Try asking about a reference directly.');
export function renderGroundedAnswer(request: AskRequest, evidence: CulturalEvidence, location: LocationContext | undefined, taste: TasteContext | undefined, selected?: EvidenceSelection[]) {
  const facts = [...(evidence.facts ?? []), ...(location?.facts ?? [])];
  const names = new Map([...facts.map((fact) => [fact.entityId, fact.name] as const), ...evidence.entities.filter(isConfirmed).map((entity) => [entity.qlooId!, entity.qlooName ?? entity.detectedName] as const)]);
  const current = new Set([...evidence.entities.filter(isConfirmed).map((entity) => entity.qlooId!), ...(location?.facts ?? []).map((fact) => fact.entityId)]);
  const usedTasteConnections: { referenceId: string; interestId: string }[] = [];
  let limited = false;
  const snippets: string[] = [];
  const selections = selected?.length ? selected : [
    ...(request.mode === 'location' && location ? [{ kind: 'locality' as const }] : []),
    ...facts.slice(0, 2).map((fact) => ({ kind: 'fact' as const, entityId: fact.entityId })),
  ];
  for (const selection of selections) {
    switch (selection.kind) {
      case 'fact': {
        const fact = facts.find((item) => item.entityId === selection.entityId);
        if (!fact || !current.has(fact.entityId)) throw invalid();
        const related = evidence.entities.find((entity) => entity.qlooId === fact.entityId)?.source === 'qloo';
        const local = location?.facts?.some((item) => item.entityId === fact.entityId);
        const prefix = related ? `${fact.name} is a related reference, not necessarily visible. ` : local ? `Qloo lists ${fact.name} in the area records. ` : '';
        snippets.push(`${prefix}${fact.description ? sentence(`${fact.name}: ${fact.description}`) : sentence(`${fact.name} is listed by Qloo as ${fact.category.replace('urn:entity:', '').replaceAll('_', ' ')}${fact.tags.length ? `, with cultural tags including ${fact.tags.slice(0, 3).join(', ')}` : ''}`)}`);
        break;
      }
      case 'relationship': {
        const relationship = evidence.relationships.find((item) => item.source === selection.source && item.target === selection.target && (item.kind ?? 'affinity') === selection.relationshipKind);
        if (!relationship || !current.has(selection.source) || !current.has(selection.target) || !names.has(selection.source) || !names.has(selection.target)) throw invalid();
        if (selection.relationshipKind === 'shared_tags') {
          const a = facts.find((fact) => fact.entityId === selection.source); const b = facts.find((fact) => fact.entityId === selection.target);
          const shared = a?.tags.filter((tag) => b?.tags.includes(tag)) ?? [];
          if (!shared.length) throw invalid();
          snippets.push(sentence(`Qloo assigns ${names.get(selection.source)} and ${names.get(selection.target)} shared cultural tags: ${shared.slice(0, 3).join(', ')}`));
        } else {
          const weak = (relationship.strength ?? 0) < 0.6; limited ||= weak;
          snippets.push(`Qloo returned ${weak ? 'a limited' : 'an aggregate'} cultural affinity between ${names.get(selection.source)} and ${names.get(selection.target)}. ${weak ? 'This is weak evidence of overlap.' : 'This suggests cultural overlap, not a direct or causal relationship.'}`);
        }
        break;
      }
      case 'taste': {
        const connection = taste?.connections.find((item) => item.referenceId === selection.referenceId && item.interestId === selection.interestId);
        const interest = request.profile?.entities.find((item) => item.id === selection.interestId);
        if (!connection || !interest || !current.has(selection.referenceId) || !names.has(selection.referenceId)) throw invalid();
        usedTasteConnections.push({ referenceId: selection.referenceId, interestId: selection.interestId });
        if (connection.kind === 'exact') snippets.push(`${names.get(selection.referenceId)} matches the same Qloo reference as ${interest.name}, an interest you shared.`);
        else {
          const weak = (connection.strength ?? 0) < 0.6; limited ||= weak;
          snippets.push(`Qloo returned ${weak ? 'a limited' : 'an aggregate'} cultural affinity between ${names.get(selection.referenceId)} and your interest in ${interest.name}. ${weak ? 'The connection is weak' : 'This can provide a familiar cultural anchor'}, but it does not establish a specific similarity or what you already know.`);
        }
        break;
      }
      case 'theme': {
        if (!facts.some((fact) => fact.tags.includes(selection.tag))) throw invalid();
        snippets.push(sentence(`The supplied Qloo records include the cultural tag ${selection.tag}`)); break;
      }
      case 'locality':
        if (!location) throw invalid();
        snippets.push(`The area supplied is ${location.resolvedName ?? Object.values(location.locality).filter(Boolean).join(', ')}. ${location.facts?.length ? 'Local cultural context comes from a small sample of Qloo place records.' : 'Qloo did not return reliable place records for this area.'}`);
        break;
    }
  }
  if (!snippets.length) {
    const identified = evidence.entities.filter(isConfirmed).filter((entity) => entity.source !== 'qloo').slice(0, 3).map((entity) => entity.qlooName ?? entity.detectedName);
    snippets.push(identified.length ? `The identified references include ${identified.join(', ')}, but I do not have enough Qloo facts to explain their cultural significance yet.` : 'I do not have enough confirmed cultural evidence to explain this environment. You can name a reference or try a closer image.');
  }
  if (request.profile && !usedTasteConnections.length && /interest|familiar|things I know|something I.*know/i.test(request.question)) snippets.push('I do not have a supported personal connection to explain here. That does not mean this culture is unfamiliar to you.');
  return { answer: [...new Set(snippets)].join(' ').slice(0, 8000), usedTasteConnections, limited };
}
