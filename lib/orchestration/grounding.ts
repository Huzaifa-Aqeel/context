import { ApiError } from '@/lib/api/server';
import { isConfirmed } from '@/lib/qloo/confirmed';
import type { EvidenceSelection } from '@/schemas/answer-plan';
import type { AskRequest, CulturalEvidence, LocationContext } from '@/types/context';
import type { TasteContext } from '@/types/taste';
import { asksAboutArea, asksAboutTaste, asksForConnections, asksForRecommendations, visibleReferences } from './intent';
import { visualLead, visualName } from './visual';

const sentence = (text: string) => /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
function concise(text: string, detailed: boolean) {
  const limit = detailed ? 320 : 200;
  if (text.length <= limit) return text;
  const part = text.slice(0, limit); const boundary = part.lastIndexOf(' ');
  return `${part.slice(0, boundary > limit * 0.7 ? boundary : limit).replace(/[,;:]$/, '')}…`;
}
const invalid = () => new ApiError(502, 'UNSUPPORTED_EVIDENCE', 'The explanation could not be verified against the current cultural evidence. Try asking about a reference directly.');
export function renderGroundedAnswer(request: AskRequest, evidence: CulturalEvidence, location: LocationContext | undefined, taste: TasteContext | undefined, selected?: EvidenceSelection[], anchorFacts: NonNullable<CulturalEvidence['facts']> = []) {
  const areaQuestion = request.mode === 'location' || asksAboutArea(request.question);
  const recommendations = asksForRecommendations(request.question);
  const facts = [...(evidence.facts ?? []), ...(areaQuestion ? location?.facts ?? [] : [])];
  const names = new Map([...facts.map((fact) => [fact.entityId, fact.name] as const), ...evidence.entities.filter(isConfirmed).map((entity) => [entity.qlooId!, entity.qlooName ?? entity.detectedName] as const)]);
  const current = new Set([...visibleReferences(evidence.entities).map((entity) => entity.qlooId!), ...(areaQuestion ? location?.facts ?? [] : []).map((fact) => fact.entityId), ...(recommendations ? evidence.entities.filter((entity) => entity.source === 'qloo').map((entity) => entity.qlooId!) : [])]);
  const usedTasteConnections: { referenceId: string; interestId: string }[] = [];
  let limited = false;
  const snippets: string[] = [];
  const observations = request.scene?.environmentalObservations ?? [];
  const detailed = /more|detail|deeper|in depth/i.test(request.question);
  const opening = request.scene?.origin === 'image' && request.question === 'What cultural context am I missing?';
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
    return { answer: snippets.join(' ').slice(0, 8000), usedTasteConnections, limited };
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
  const relevant = ordered.filter((selection) => {
    if (selection.kind === 'locality') return areaQuestion;
    if (selection.kind === 'fact') return current.has(selection.entityId);
    if (selection.kind === 'relationship') return current.has(selection.source) && current.has(selection.target) && (recommendations || (sceneIds.has(selection.source) && sceneIds.has(selection.target)));
    if (selection.kind === 'taste') return sceneIds.has(selection.referenceId);
    return true;
  });
  const chosen = asksAboutTaste(request.question) ? relevant.find((item) => item.kind === 'taste') ?? relevant[0] : asksForConnections(request.question) ? relevant.find((item) => item.kind === 'relationship') ?? relevant[0] : areaQuestion ? relevant.find((item) => item.kind === 'locality') ?? relevant[0] : relevant.find((item) => item.kind === 'fact' && sceneIds.has(item.entityId)) ?? relevant[0];
  for (const selection of chosen ? [chosen] : []) {
    switch (selection.kind) {
      case 'fact': {
        const fact = facts.find((item) => item.entityId === selection.entityId);
        if (!fact || !current.has(fact.entityId)) throw invalid();
        const sceneEntity = visibleReferences(evidence.entities).find((entity) => entity.qlooId === fact.entityId);
        const namedVisualSubject = Boolean(sceneEntity && request.question.toLocaleLowerCase().includes(sceneEntity.detectedName.toLocaleLowerCase()));
        if ((opening || (sceneEntity?.groundingBasis === 'related' && namedVisualSubject)) && sceneEntity) {
          snippets.push(visualLead(sceneEntity));
          if (opening && ['clothing', 'product'].includes(sceneEntity.carrier ?? '')) break;
          if (opening && sceneEntity.carrier === 'book_cover') {
            const tag = fact.tags.find((item) => /science fiction|fantasy|mystery|history|biography/i.test(item)) ?? fact.tags[0];
            if (tag) snippets.push(`Qloo associates it with ${tag}.`);
            break;
          }
        }
        const related = evidence.entities.find((entity) => entity.qlooId === fact.entityId)?.source === 'qloo';
        const local = areaQuestion && location?.facts?.some((item) => item.entityId === fact.entityId);
        const prefix = related ? `${fact.name} is a related reference, not necessarily visible. ` : local ? `Qloo lists ${fact.name} in the area records. ` : '';
        const description = fact.description ? concise(fact.description, opening ? false : detailed) : undefined;
        const nounPhrase = description && /^(?:a|an)\s/i.test(description);
        const shortDescription = nounPhrase ? description[0].toLowerCase() + description.slice(1) : description;
        const phrase = description ? sceneEntity?.groundingBasis === 'related' && nounPhrase ? `${fact.name} is ${shortDescription}`
          : opening && sceneEntity?.groundingBasis !== 'related' && nounPhrase ? `It's ${shortDescription}`
          : sceneEntity?.groundingBasis === 'related' ? `Qloo describes ${fact.name}: ${description}`
          : opening ? description : `Qloo describes ${fact.name}: ${description}`
          : `${fact.name} is listed by Qloo as ${fact.category.replace('urn:entity:', '').replaceAll('_', ' ')}${fact.tags.length ? `, with cultural tags including ${fact.tags.slice(0, 2).join(', ')}` : ''}`;
        snippets.push(`${prefix}${sentence(phrase)}`);
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
        if (connection.kind === 'exact') {
          usedTasteConnections.push({ referenceId: selection.referenceId, interestId: selection.interestId });
          snippets.push(`${names.get(selection.referenceId)} is one of the interests in your profile.`);
        }
        else {
          const weak = (connection.strength ?? 0) < 0.6; limited ||= weak;
          const reference = facts.find((fact) => fact.entityId === selection.referenceId);
          const anchor = anchorFacts.find((fact) => fact.entityId === interest.id && fact.source === 'qloo');
          const shared = connection.sharedTags?.length ? connection.sharedTags : reference && anchor ? reference.tags.filter((tag) => anchor.tags.includes(tag)) : [];
          if (shared.length && !weak) {
            usedTasteConnections.push({ referenceId: selection.referenceId, interestId: selection.interestId });
            snippets.push(`${names.get(selection.referenceId)} and your interest in ${interest.name} share ${shared.slice(0, 2).join(' and ')} in Qloo's records.`);
          }
          else snippets.push(`I do not have a specific supported connection between ${names.get(selection.referenceId)} and your interests.`);
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
    const identified = visibleReferences(evidence.entities).slice(0, 2).map(visualName);
    const unresolved = evidence.entities.filter((entity) => entity.source !== 'qloo' && !isConfirmed(entity)).slice(0, 2).map((entity) => entity.detectedName);
    snippets.push(identified.length ? `I identified ${identified.join(' and ')}, but I do not have enough supported facts to answer that question.` : unresolved.length ? `I can read ${unresolved.join(' and ')} in the image, but I could not match ${unresolved.length === 1 ? 'it' : 'them'} uniquely in the cultural records.` : !location && areaQuestion ? 'I do not have your area. You can enable location context, and scene exploration still works without it.' : 'I do not have enough confirmed cultural evidence to answer that question.');
  }
  if (request.profile && !usedTasteConnections.length && asksAboutTaste(request.question)) snippets.push('I do not have a supported connection to the interests you shared.');
  if (guided) {
    const choices = evidence.entities.filter(isConfirmed).filter((entity) => entity.source !== 'qloo').slice(0, 2).map(visualName);
    const supported = request.profile ? (taste?.connections.filter((connection) => sceneIds.has(connection.referenceId) && request.profile!.entities.some((interest) => interest.id === connection.interestId) && (connection.kind === 'exact' || ((connection.strength ?? 0) >= 0.6 && Boolean(connection.sharedTags?.length)))) ?? []).slice(0, 5) : [];
    if (supported.length) {
      const count = new Set(supported.map((connection) => connection.referenceId)).size;
      snippets.push(`${count} ${count === 1 ? 'reference has' : 'references have'} a supported connection to interests you shared. Would you like to start with something familiar or discover something new?`);
      supported.forEach(({ referenceId, interestId }) => { if (!usedTasteConnections.some((connection) => connection.referenceId === referenceId && connection.interestId === interestId)) usedTasteConnections.push({ referenceId, interestId }); });
    } else if (choices.length) snippets.push(`Would you like to explore ${choices.join(' or ')} next?`);
    else snippets.push('Would you like to name a reference or capture a closer photo?');
  }
  return { answer: [...new Set(snippets)].join(' ').slice(0, 8000), usedTasteConnections, limited };
}
