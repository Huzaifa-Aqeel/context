import { z } from 'zod';
import { ApiError } from '@/lib/api/server';
import { agentTurnSchema, type LlmService, type ReasoningInput } from '@/lib/llm/service';
import { usedTasteConnectionSchema } from '@/schemas/context';
import { providerData } from '@/lib/server/http';
import type { GroqClient } from './client';

const finishSchema = z.object({ answer: z.string().min(1).max(8000), confidence: z.enum(['low', 'medium', 'high']), usedTasteConnections: z.array(usedTasteConnectionSchema).max(10).default([]) });
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
const finishTool = tool('finishResponse', 'Answer the user using current evidence. This ends exploration. Mention uncertainty when evidence is limited.', {
  answer: { type: 'string', description: 'Concise spoken explanation, usually 2–5 sentences. No markdown. Ground cultural claims in the supplied Qloo evidence.' },
  confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  usedTasteConnections: { type: 'array', description: 'If explaining through or naming a profile interest, cite the exact referenceId/interestId pairs from supplied tasteContext connections. Otherwise return an empty list. Never cite an invented pair.', items: { type: 'object', properties: { referenceId: { type: 'string' }, interestId: { type: 'string' } }, required: ['referenceId', 'interestId'], additionalProperties: false } },
}, ['answer', 'confidence', 'usedTasteConnections']);

export class GroqReasoning implements LlmService {
  constructor(private client: GroqClient) {}
  async nextTurn(input: ReasoningInput) {
    const tools = input.allowInvestigation ? [...investigationTools, ...(input.request.profile ? [tasteTool] : []), finishTool] : [finishTool];
    const completion = await this.client.completion({
      model: this.client.config.reasoningModel, temperature: 0.2, max_completion_tokens: 1400,
      tools, tool_choice: input.allowInvestigation ? 'required' : { type: 'function', function: { name: 'finishResponse' } },
      parallel_tool_calls: false,
      messages: [
        { role: 'system', content: `${input.instructions}\nUse exactly one tool. Finish immediately when evidence suffices. Do not repeat completedActions. Related references are not necessarily visible in the scene. Distinguish a shared genre tag from a measured affinity. Affinity is an aggregate cultural signal, not a causal link or a person's traits. Never expose numeric scores as personal probabilities.\nThe selected mode is ${input.request.mode}.\nPersonalization is ${input.request.profile ? 'enabled' : 'disabled'}. Strategy: ${input.request.strategy ?? 'balanced'}. Preserve explicit-question and cultural-significance priority. When enabled, use ONLY supplied tasteContext connections to name cultural links to profile interests. An affinity is not proof of a structural analogy or what the user knows. If no supported connection exists, explain directly and state the limitation. Never invent a familiar analogy. Strength below 0.6 is limited evidence and must not be described as strong. Familiar strategy starts with supported interests; discover strategy explores other significant references without claiming the user does not know them. Do not recommend purchases or visits. When disabled, do not use prior taste-derived content to personalize.` },
        { role: 'user', content: JSON.stringify({
          question: input.request.question, conversation: input.request.messages,
          profile: input.request.profile, tasteContext: input.tasteContext,
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
    if (call.name === 'finishResponse') return providerData(agentTurnSchema, { kind: 'answer', result: providerData(finishSchema, args) });
    return providerData(agentTurnSchema, { kind: 'investigate', action: { ...(typeof args === 'object' && args ? args : {}), tool: call.name } });
  }
}
