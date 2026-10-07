import type { z } from 'zod';
import type { answerSchema, askRequestSchema, evidenceSchema, localitySchema, locationContextSchema, messageSchema, resolvedEntitySchema, sceneSchema, visionEntitySchema } from '@/schemas/context';

export type Scene = z.infer<typeof sceneSchema>;
export type Locality = z.infer<typeof localitySchema>;
export type LocationContext = z.infer<typeof locationContextSchema>;
export type ResolvedEntity = z.infer<typeof resolvedEntitySchema>;
export type CulturalEvidence = z.infer<typeof evidenceSchema>;
export type ConversationMessage = z.infer<typeof messageSchema>;
export type VisionEntity = z.infer<typeof visionEntitySchema>;
export type Answer = z.infer<typeof answerSchema>;
export type AskRequest = z.infer<typeof askRequestSchema>;
