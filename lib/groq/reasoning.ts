import { z } from 'zod';
import { ApiError } from '@/lib/api/server';
import { agentTurnSchema, type LlmService, type ReasoningInput } from '@/lib/llm/service';
import { evidenceSelectionsSchema } from '@/schemas/answer-plan';
import { reasoningTaste } from '@/lib/taste/reasoning';
import { providerData } from '@/lib/server/http';
import type { GroqClient } from './client';

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
  evidenceSelections: { type: 'array', maxItems: 5, items: { anyOf: [
    { type: 'object', properties: { kind: { const: 'fact' }, entityId: { type: 'string' } }, required: ['kind', 'entityId'], additionalProperties: false },
    { type: 'object', properties: { kind: { const: 'relationship' }, source: { type: 'string' }, target: { type: 'string' }, relationshipKind: { enum: ['affinity', 'shared_tags'] } }, required: ['kind', 'source', 'target', 'relationshipKind'], additionalProperties: false },
    { type: 'object', properties: { kind: { const: 'taste' }, referenceId: { type: 'string' }, interestId: { type: 'string' } }, required: ['kind', 'referenceId', 'interestId'], additionalProperties: false },
    { type: 'object', properties: { kind: { const: 'theme' }, tag: { type: 'string' } }, required: ['kind', 'tag'], additionalProperties: false },
    { type: 'object', properties: { kind: { const: 'locality' } }, required: ['kind'], additionalProperties: false },
  ] } },
}, ['confidence', 'evidenceSelections']);

export class GroqReasoning implements LlmService {
  constructor(private client: GroqClient) {}
  async nextTurn(input: ReasoningInput) {
    const taste = reasoningTaste(input);
    const tools = input.allowInvestigation ? [...investigationTools, ...(input.request.profile ? [tasteTool] : []), finishTool] : [finishTool];
    const completion = await this.client.completion({
      model: this.client.config.reasoningModel, temperature: 0.2, max_completion_tokens: 1400,
      tools, tool_choice: input.allowInvestigation ? 'required' : { type: 'function', function: { name: 'finishResponse' } },
      parallel_tool_calls: false,
      messages: [
        { role: 'system', content: `${input.instructions}\nUse exactly one tool. Finish by selecting existing facts, qualified relationships, locality or supported taste pairs. The server produces spoken sentences from these selections; do not write an explanation or infer additional facts. Select at most five items with explicit question priority, followed by cultural significance and evidence quality, then taste. Finish immediately when evidence suffices. Do not repeat completedActions. Related references are not necessarily visible in the scene. Distinguish a shared genre tag from a measured affinity. Affinity is an aggregate cultural signal, not a causal link or a person's traits. Never expose numeric scores as personal probabilities.\nThe selected mode is ${input.request.mode}.\nPersonalization is ${input.request.profile ? 'enabled' : 'disabled'}. Strategy: ${input.request.strategy ?? 'balanced'}. Preserve explicit-question and cultural-significance priority. When enabled, use ONLY supplied tasteContext connections to name cultural links to profile interests. An affinity is not proof of a structural analogy or what the user knows. If no supported connection exists, explain directly and state the limitation. Never invent a familiar analogy. Strength below 0.6 is limited evidence and must not be described as strong. If an affinity is the only supplied link, describe it as a Qloo aggregate cultural affinity; never convert it into authorship, collaboration, influence, a direct relationship, or specific stylistic similarity using your own knowledge. Such claims require an explicit statement in supplied Qloo facts. For a weak affinity, explicitly say the evidence is limited. Familiar strategy starts with exact profile matches before weaker affinities when explicit-question priority and cultural significance are equal; discover strategy explores other significant references without claiming the user does not know them. Do not recommend purchases or visits. When disabled, do not use prior taste-derived content to personalize.` },
        { role: 'user', content: JSON.stringify({
          question: input.request.question, conversation: input.request.messages,
          ...taste,
          evidence: input.evidence, locationContext: input.locationContext,
          suppliedLocality: input.request.locality, completedActions: input.completedActions,
          warnings: input.warnings ?? [],
        }) },
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
