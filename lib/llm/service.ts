import { z } from 'zod';
import { answerSchema } from '@/schemas/context';
import type { AskRequest, CulturalEvidence, LocationContext } from '@/types/context';

export const investigationSchema = z.discriminatedUnion('tool', [
  z.object({ tool: z.literal('exploreReference'), entityId: z.string().min(1).max(500) }),
  z.object({ tool: z.literal('analyzeConnections') }),
  z.object({ tool: z.literal('getLocationContext') }),
]);
export const agentTurnSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('answer'), result: answerSchema }),
  z.object({ kind: z.literal('investigate'), action: investigationSchema }),
]);
export type AgentTurn = z.infer<typeof agentTurnSchema>;
export type ReasoningInput = {
  instructions: string;
  request: AskRequest;
  evidence: CulturalEvidence;
  locationContext?: LocationContext;
  completedActions: string[];
  allowInvestigation: boolean;
};

export interface LlmService {
  /** Map native tool calls into validated AgentTurn values. */
  nextTurn(input: ReasoningInput): Promise<AgentTurn>;
}
