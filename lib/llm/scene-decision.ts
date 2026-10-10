import { z } from 'zod';
import type { AskRequest, Scene } from '@/types/context';

export const sceneDecisionSchema = z.object({
  scope: z.enum(['event', 'dining', 'area', 'general']),
  next: z.enum(['answer', 'clarify', 'event_research', 'venue_details', 'dining_discovery', 'dining_details',
    'area_discovery', 'area_more', 'area_details', 'mall_discovery', 'practical_lookup', 'qloo_connection', 'calendar']),
  answer: z.string().trim().min(1).max(800).optional(),
  evidenceIds: z.array(z.string().trim().min(1).max(100)).max(8).default([]),
  researchKind: z.enum(['status', 'schedule', 'tickets', 'official_page', 'calendar', 'reviews']).optional(),
  detail: z.enum(['address', 'phone', 'opening', 'distance', 'walking', 'accessibility']).optional(),
  anchor: z.enum(['event_venue', 'device', 'named']).optional(),
  anchorName: z.string().trim().min(1).max(300).optional(),
  anchorLocality: z.string().trim().min(1).max(300).optional(),
  practicalCategory: z.enum(['restroom', 'atm', 'pharmacy']).optional(),
  targetId: z.string().trim().min(1).max(500).optional(),
  pairIds: z.tuple([z.string().trim().min(1).max(500), z.string().trim().min(1).max(500)]).optional(),
});

export const sceneDecisionAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(800),
  evidenceIds: z.array(z.string().trim().min(1).max(100)).max(8).default([]),
});

export type SceneDecision = z.infer<typeof sceneDecisionSchema>;
export type SceneDecisionAnswer = z.infer<typeof sceneDecisionAnswerSchema>;
export type SceneReasoningInput = {
  question: string;
  messages: AskRequest['messages'];
  scene?: Scene;
  interests: { id: string; name: string }[];
  available: { research: boolean; places: boolean; qloo: boolean; calendar: boolean; devicePosition: boolean };
  completed?: Pick<SceneDecision, 'scope' | 'next' | 'targetId' | 'researchKind' | 'detail'>;
};

export interface SceneReasoningService {
  plan(input: SceneReasoningInput): Promise<SceneDecision>;
  answer(input: SceneReasoningInput): Promise<SceneDecisionAnswer>;
}
