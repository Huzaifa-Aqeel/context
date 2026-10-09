import type { TasteContext } from '@/types/taste';
import { z } from 'zod';
import { answerSchema } from '@/schemas/context';
import { evidenceSelectionsSchema } from '@/schemas/answer-plan';
import type { AskRequest, CulturalEvidence, LocationContext } from '@/types/context';
import type { ShelfContext } from '@/types/context';
import type { shelfFactFieldSchema } from '@/schemas/context';
import type { TasteEntity } from '@/types/taste';

export type ShelfFactProposal = { field: z.infer<typeof shelfFactFieldSchema>; value: string };
export type ShelfBriefResult = {
  labels: { index: number; category?: string; genre?: string }[];
  items: { qlooId: string; facts: ShelfFactProposal[] }[];
};
export type ShelfBriefInput = { kind: ShelfContext['kind']; interests: TasteEntity[]; inventory: {
  title: string; visibleAuthor?: string; visibleRelatedName?: string; visiblePlatform?: string; visibleEdition?: string; resolved: boolean;
}[]; items: {
  qlooId: string; title: string; visibleAuthor?: string; visibleRelatedName?: string; visiblePlatform?: string; visibleEdition?: string;
  rank: number; exactInterest: boolean; contributors: string[];
}[] };
export type ShelfAnswerInput = { question: string; messages: AskRequest['messages']; shelf: ShelfContext; interests: TasteEntity[] };
export type DisplayResearchSource = { title: string; url: string; content: string; retrievedAt: string };

export const investigationSchema = z.discriminatedUnion('tool', [
  z.object({ tool: z.literal('exploreReference'), entityId: z.string().min(1).max(500) }),
  z.object({ tool: z.literal('analyzeConnections') }),
  z.object({ tool: z.literal('analyzeTaste') }),
  z.object({ tool: z.literal('getLocationContext') }),
  z.object({ tool: z.literal('resolveEntity'), name: z.string().trim().min(1).max(500), category: z.string().trim().min(1).max(100) }),
]);
export const agentTurnSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('answer'), result: answerSchema.extend({ evidenceSelections: evidenceSelectionsSchema.optional() }) }),
  z.object({ kind: z.literal('investigate'), action: investigationSchema }),
]);
export type AgentTurn = z.infer<typeof agentTurnSchema>;
export type ReasoningInput = {
  instructions: string;
  request: AskRequest;
  evidence: CulturalEvidence;
  locationContext?: LocationContext;
  tasteContext?: TasteContext;
  completedActions: string[];
  allowInvestigation: boolean;
  warnings?: string[];
};

export interface LlmService {
  /** Map native tool calls into validated AgentTurn values. */
  nextTurn(input: ReasoningInput): Promise<AgentTurn>;
  createShelfBrief?(input: ShelfBriefInput): Promise<ShelfBriefResult>;
  answerShelfQuestion?(input: ShelfAnswerInput): Promise<{ answer: string; confidence: 'low' | 'medium' | 'high'; needsResearch?: boolean }>;
  answerDisplayResearchQuestion?(input: ShelfAnswerInput & { sources: DisplayResearchSource[] }): Promise<{ answer: string; confidence: 'low' | 'medium' | 'high'; usedSourceUrls: string[] }>;
}
