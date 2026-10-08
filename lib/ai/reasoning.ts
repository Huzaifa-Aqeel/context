import { z } from 'zod';
import { ApiError } from '@/lib/api/server';
import { agentTurnSchema, type LlmService, type ReasoningInput } from '@/lib/llm/service';
import { evidenceSelectionsSchema } from '@/schemas/answer-plan';
import { reasoningTaste } from '@/lib/taste/reasoning';
import { isConfirmed } from '@/lib/qloo/confirmed';
import { providerData } from '@/lib/server/http';
import type { CompletionClient } from './client';

const finishSchema = z.object({ confidence: z.enum(['low', 'medium', 'high']), evidenceSelections: evidenceSelectionsSchema });
const tool = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []) => ({
  type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } },
});
const investigationTools = [
  tool('exploreReference', 'Get Qloo facts and related cultural references for a confirmed entity. Use only an ID in the current evidence.', { entityId: { type: 'string' } }, ['entityId']),
  tool('analyzeConnections', 'Investigate affinities between current references. Use when existing relationships are insufficient.'),
  tool('getLocationContext', 'Investigate the current locality through Qloo. Requires a locality supplied by the user. Do not repeat a completed lookup.'),
  tool('resolveEntity', 'Resolve a reference the user explicitly names or clarifies, or an uncertain reference already detected. Never invent a name. Use a category such as brand, author, artist, film, book, game, venue, or restaurant.', { name: { type: 'string' }, category: { type: 'string' } }, ['name', 'category']),
];
const tasteTool = tool('analyzeTaste', 'Get Qloo-supported connections between confirmed scene/locality references and the optional profile. Required before making a personal connection or familiar analogy if no taste evidence is available. Never repeat a completed lookup.');
const finishTool = tool('finishResponse', 'Select up to five pieces of current evidence that best answer the question. The server renders the explanation; never write free-form cultural claims. Return an empty list when evidence is insufficient.', {
  confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  evidenceSelections: { type: 'array', maxItems: 5, items: { type: 'object', properties: {
    kind: { type: 'string', enum: ['fact', 'relationship', 'taste', 'theme', 'locality', 'observation'] },
    entityId: { type: 'string', description: 'Required for fact: a current Qloo fact entity ID.' },
    source: { type: 'string', description: 'Required for relationship: existing source ID.' },
    target: { type: 'string', description: 'Required for relationship: existing target ID.' },
    relationshipKind: { type: 'string', enum: ['affinity', 'shared_tags'], description: 'Required for relationship: the supplied evidence kind.' },
    referenceId: { type: 'string', description: 'Required for taste: existing reference ID.' },
    interestId: { type: 'string', description: 'Required for taste: existing relevant interest ID.' },
    tag: { type: 'string', description: 'Required for theme: an exact current Qloo tag.' },
    label: { type: 'string', description: 'Required for observation: an exact current environmental observation label.' },
  }, required: ['kind'], additionalProperties: false } },
}, ['confidence', 'evidenceSelections']);

export class ChatReasoning implements LlmService {
  constructor(private client: CompletionClient, private model = client.model) {}
  async nextTurn(input: ReasoningInput) {
    const taste = reasoningTaste(input);
    const completed = input.completedActions.flatMap((value) => { try { return [JSON.parse(value) as { tool?: string; entityId?: string; name?: string; category?: string }]; } catch { return []; } });
    const confirmedIds = [...new Set(input.evidence.entities.filter(isConfirmed).map((entity) => entity.qlooId!))];
    const remainingIds = confirmedIds.filter((id) => !completed.some((action) => action.tool === 'exploreReference' && action.entityId === id));
    const available = investigationTools.flatMap((entry) => {
      const name = entry.function.name;
      if (name === 'exploreReference') return remainingIds.length ? [{ ...entry, function: { ...entry.function, parameters: { ...entry.function.parameters, properties: { entityId: { type: 'string', enum: remainingIds } } } } }] : [];
      if (name === 'analyzeConnections' && !confirmedIds.length) return [];
      if (name === 'getLocationContext' && !(input.request.locality || input.locationContext?.locality)) return [];
      if (name !== 'resolveEntity' && completed.some((action) => action.tool === name)) return [];
      return [entry];
    });
    const tools = input.allowInvestigation ? [...available, ...(input.request.profile && !completed.some((action) => action.tool === 'analyzeTaste') ? [tasteTool] : []), finishTool] : [finishTool];
    // Native tool-result messages tell compatible models that investigation actually ran.
    // Textual completedActions alone can be mistaken for a new request to run it again.
    const toolHistory = completed.flatMap((action, index) => {
      if (!action.tool) return [];
      const { tool: name, ...args } = action;
      const id = `context_action_${index}`;
      const result = name === 'analyzeTaste' ? taste : name === 'getLocationContext' ? input.locationContext : name === 'exploreReference' ? {
        entityId: action.entityId, facts: input.evidence.facts?.filter((fact) => fact.entityId === action.entityId),
        relatedReferences: input.evidence.entities.filter((entity) => entity.source === 'qloo'),
        relationships: input.evidence.relationships.filter((relationship) => relationship.source === action.entityId || relationship.target === action.entityId),
      } : input.evidence;
      return [
        { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
        { role: 'tool', tool_call_id: id, content: JSON.stringify({ status: 'completed', currentEvidence: result }) },
      ];
    });
    const completion = await this.client.completion({
      model: this.model, temperature: 0.2, max_completion_tokens: 1400,
      tools, tool_choice: input.allowInvestigation ? 'required' : { type: 'function', function: { name: 'finishResponse' } },
      parallel_tool_calls: false,
      messages: [
        { role: 'system', content: `${input.instructions}\nUse exactly one tool. Finish by selecting existing facts, qualified relationships, locality or supported taste pairs. The server produces spoken sentences from these selections; do not write an explanation or infer additional facts. Select at most five items with explicit question priority, followed by cultural significance and evidence quality, then taste. Finish immediately when evidence suffices. Do not repeat completedActions. Related references are not necessarily visible in the scene. Distinguish a shared genre tag from a measured affinity. Affinity is an aggregate cultural signal, not a causal link or a person's traits. Never expose numeric scores as personal probabilities.\nThe internal request intent hint is ${input.request.mode}; it is not a user-selected exploration mode.\nPersonalization is ${input.request.profile ? 'enabled' : 'disabled'}. Strategy: ${input.request.strategy ?? 'balanced'}. Preserve explicit-question and cultural-significance priority. When enabled, use ONLY supplied tasteContext connections to name cultural links to profile interests. An affinity is not proof of a structural analogy or what the user knows. If no supported connection exists, explain directly and state the limitation. Never invent a familiar analogy. Strength below 0.6 is limited evidence and must not be described as strong. If an affinity is the only supplied link, describe it as a Qloo aggregate cultural affinity; never convert it into authorship, collaboration, influence, a direct relationship, or specific stylistic similarity using your own knowledge. Such claims require an explicit statement in supplied Qloo facts. For a weak affinity, explicitly say the evidence is limited. Familiar strategy starts with exact profile matches before weaker affinities when explicit-question priority and cultural significance are equal; discover strategy explores other significant references without claiming the user does not know them. Do not recommend purchases or visits. When disabled, do not use prior taste-derived content to personalize.` },
        { role: 'user', content: JSON.stringify({
          question: input.request.question, conversation: input.request.messages,
          ...taste,
          evidence: input.evidence, locationContext: input.locationContext,
          environmentalObservations: input.request.scene?.environmentalObservations,
          suppliedLocality: input.request.locality, completedActions: input.completedActions,
          warnings: input.warnings ?? [],
        }) },
        ...toolHistory,
      ],
    });
    const calls = completion.message.tool_calls;
    if (!calls || calls.length !== 1 || completion.finish_reason === 'length') throw new ApiError(502, 'REASONING_INCOMPLETE', 'The explanation could not be completed. Try a more specific question.');
    const call = calls[0].function;
    let args: unknown;
    try { args = JSON.parse(call.arguments); }
    catch { throw new ApiError(502, 'INVALID_TOOL_ARGUMENTS', 'The requested investigation could not be understood. Please try again.'); }
    if (call.name === 'finishResponse') return providerData(agentTurnSchema, { kind: 'answer', result: { ...providerData(finishSchema, args), answer: 'Evidence selection.' } });
    return providerData(agentTurnSchema, { kind: 'investigate', action: { ...(typeof args === 'object' && args ? args : {}), tool: call.name } });
  }
}
