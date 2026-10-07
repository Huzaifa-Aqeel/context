import type { ReasoningInput } from '@/lib/llm/service';
/** Only supported anchors for current question targets reach the explanation provider. */
export function reasoningTaste(input: ReasoningInput) {
  const explicit = input.evidence.entities.filter((entity) => input.request.question.toLowerCase().includes((entity.qlooName ?? entity.detectedName).toLowerCase())).map((entity) => entity.qlooId);
  const connections = input.tasteContext?.connections.filter((connection) => !explicit.length || explicit.includes(connection.referenceId)).slice().sort((a, b) => (b.strength ?? 1) - (a.strength ?? 1)).slice(0, 3) ?? [];
  const ids = new Set(connections.map((connection) => connection.interestId));
  const entities = input.request.profile?.entities.filter((entity) => ids.has(entity.id)) ?? [];
  return { profile: entities.length ? { entities } : undefined, tasteContext: input.tasteContext ? { connections, warnings: input.tasteContext.warnings } : undefined };
}
