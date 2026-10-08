import { ApiError } from '@/lib/api/server';
import { isConfirmed } from '@/lib/qloo/confirmed';
import type { EvidenceSelection } from '@/schemas/answer-plan';
import type { AskRequest, CulturalEvidence, LocationContext } from '@/types/context';
import type { TasteContext } from '@/types/taste';

const sentence = (text: string) => /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
function concise(text: string, detailed: boolean) {
  if (detailed || text.length <= 350) return text;
  const part = text.slice(0, 350); const boundary = part.lastIndexOf(' ');
  return `${part.slice(0, boundary > 250 ? boundary : 350)}…`;
}
const invalid = () => new ApiError(502, 'UNSUPPORTED_EVIDENCE', 'The explanation could not be verified against the current cultural evidence. Try asking about a reference directly.');
export function renderGroundedAnswer(request: AskRequest, evidence: CulturalEvidence, location: LocationContext | undefined, taste: TasteContext | undefined, selected?: EvidenceSelection[]) {
  const facts = [...(evidence.facts ?? []), ...(location?.facts ?? [])];
  const names = new Map([...facts.map((fact) => [fact.entityId, fact.name] as const), ...evidence.entities.filter(isConfirmed).map((entity) => [entity.qlooId!, entity.qlooName ?? entity.detectedName] as const)]);
  const current = new Set([...evidence.entities.filter(isConfirmed).map((entity) => entity.qlooId!), ...(location?.facts ?? []).map((fact) => fact.entityId)]);
  const usedTasteConnections: { referenceId: string; interestId: string }[] = [];
  let limited = false;
  const snippets: string[] = [];
  const observations = request.scene?.environmentalObservations ?? [];
  const detailed = /more|detail|deeper|in depth/i.test(request.question);
  const observationText = (item: (typeof observations)[number]) => `${item.confidence < 0.7 ? 'The visual identification is uncertain, but the model may be seeing' : 'The image appears to contain'} ${item.label}${item.position ? ` (${item.position})` : ''}.`;
  observations.filter((item) => item.necessaryInformation && item.confidence >= 0.7).forEach((item) => snippets.push(observationText(item)));
  const guided = request.mode === 'guided' || /guide me|walk me through/i.test(request.question);
  const sceneIds = new Set(evidence.entities.filter(isConfirmed).filter((entity) => entity.source !== 'qloo').map((entity) => entity.qlooId!));
  const sceneFacts = (evidence.facts ?? []).filter((fact) => sceneIds.has(fact.entityId));
  if (guided) {
    const themes = new Map<string, Set<string>>();
    sceneFacts.forEach((fact) => new Set(fact.tags).forEach((tag) => themes.set(tag, new Set([...(themes.get(tag) ?? []), fact.name]))));
    const strongest = [...themes].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))[0];
    snippets.push(strongest ? strongest[1].size > 1
      ? `The strongest shared cultural signal in the confirmed references is ${strongest[0]}. Qloo assigns that tag to ${[...strongest[1]].slice(0, 3).join(', ')}. This describes those records, not the whole environment.`
      : `The clearest available cultural signal is ${strongest[0]} in Qloo's record for ${[...strongest[1]][0]}. There is too little evidence to call this a shared scene theme.`
      : 'There is not enough supported evidence for a dominant cultural theme yet. We can explore individual references.');
  }
  if (location && /relate.*(?:area|neighborhood|neighbourhood)|(?:area|neighborhood|neighbourhood).*relat/i.test(request.question)) {
    const overlaps = sceneFacts.flatMap((fact) => (location.facts ?? []).filter((local) => local.entityId !== fact.entityId).map((local) => ({ fact, local, shared: fact.tags.filter((tag) => local.tags.includes(tag)) }))).filter((item) => item.shared.length).sort((a, b) => b.shared.length - a.shared.length);
    const strongest = overlaps[0];
    snippets.push(strongest
      ? `Qloo's records for ${strongest.fact.name} and the sampled area place ${strongest.local.name} share cultural tags: ${strongest.shared.slice(0, 3).join(', ')}. This is a limited connection between those records, not evidence about the neighborhood as a whole.`
      : 'I do not have supported evidence connecting the scene references to the sampled area records.');
  }
  const selections = selected?.length ? selected : [
    ...(request.mode === 'location' && location ? [{ kind: 'locality' as const }] : []),
    ...facts.slice(0, 2).map((fact) => ({ kind: 'fact' as const, entityId: fact.entityId })),
  ];
  const ordered = [...selections].sort((a, b) => {
    const mentioned = (selection: EvidenceSelection) => {
      const ids = selection.kind === 'fact' ? [selection.entityId] : selection.kind === 'taste' ? [selection.referenceId] : selection.kind === 'relationship' ? [selection.source, selection.target] : [];
      return Number(ids.some((id) => names.has(id) && request.question.toLowerCase().includes(names.get(id)!.toLowerCase())));
    };
    return mentioned(b) - mentioned(a);
  });
  for (const selection of ordered.slice(0, detailed ? 5 : 3)) {
    switch (selection.kind) {
      case 'fact': {
        const fact = facts.find((item) => item.entityId === selection.entityId);
        if (!fact || !current.has(fact.entityId)) throw invalid();
        const related = evidence.entities.find((entity) => entity.qlooId === fact.entityId)?.source === 'qloo';
        const local = location?.facts?.some((item) => item.entityId === fact.entityId);
        const prefix = related ? `${fact.name} is a related reference, not necessarily visible. ` : local ? `Qloo lists ${fact.name} in the area records. ` : '';
        snippets.push(`${prefix}${fact.description ? sentence(`Qloo describes ${fact.name}: ${concise(fact.description, detailed)}`) : sentence(`${fact.name} is listed by Qloo as ${fact.category.replace('urn:entity:', '').replaceAll('_', ' ')}${fact.tags.length ? `, with cultural tags including ${fact.tags.slice(0, 3).join(', ')}` : ''}`)}`);
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
      case 'observation': {
        const item = observations.find((item) => item.label === selection.label);
        if (!item) throw invalid();
        limited ||= item.confidence < 0.7; snippets.push(observationText(item)); break;
      }
    }
  }
  if (!snippets.length) {
    observations.filter((item) => item.confidence >= 0.7).slice(0, 2).forEach((item) => snippets.push(observationText(item)));
    const identified = evidence.entities.filter(isConfirmed).filter((entity) => entity.source !== 'qloo').slice(0, 3).map((entity) => entity.qlooName ?? entity.detectedName);
    snippets.push(identified.length ? `The identified references include ${identified.join(', ')}, but I do not have enough Qloo facts to explain their cultural significance yet.` : !location && /area|neighborhood|neighbourhood|where am I/i.test(request.question) ? 'I do not have your area. You can enable location context, and scene exploration still works without it.' : 'I do not have enough confirmed cultural evidence to explain this environment. You can name a reference or try a closer image.');
  }
  if (request.profile && !usedTasteConnections.length && /interest|familiar|things I know|something I.*know/i.test(request.question)) snippets.push('I do not have a supported personal connection to explain here. That does not mean this culture is unfamiliar to you.');
  if (guided) {
    const choices = evidence.entities.filter(isConfirmed).filter((entity) => entity.source !== 'qloo').slice(0, 2).map((entity) => entity.qlooName ?? entity.detectedName);
    const supported = request.profile ? (taste?.connections.filter((connection) => sceneIds.has(connection.referenceId) && request.profile!.entities.some((interest) => interest.id === connection.interestId) && (connection.kind === 'exact' || (connection.strength ?? 0) >= 0.6)) ?? []).slice(0, 5) : [];
    if (supported.length) {
      const count = new Set(supported.map((connection) => connection.referenceId)).size;
      snippets.push(`${count} ${count === 1 ? 'reference has' : 'references have'} a supported connection to interests you shared. Would you like to start with something familiar or discover something new?`);
      supported.forEach(({ referenceId, interestId }) => { if (!usedTasteConnections.some((connection) => connection.referenceId === referenceId && connection.interestId === interestId)) usedTasteConnections.push({ referenceId, interestId }); });
    } else if (choices.length) snippets.push(`Would you like to explore ${choices.join(' or ')} next?`);
    else snippets.push('Would you like to name a reference or capture a closer photo?');
  }
  return { answer: [...new Set(snippets)].join(' ').slice(0, 8000), usedTasteConnections, limited };
}
