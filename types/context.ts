import type { z } from 'zod';
import type { answerSchema, askRequestSchema, evidenceSchema, localitySchema, locationContextSchema, messageSchema, resolvedEntitySchema, sceneSchema, visionEntitySchema, shelfContextSchema, placeDetailsSchema } from '@/schemas/context';

export type Scene = z.infer<typeof sceneSchema>;
export type Locality = z.infer<typeof localitySchema>;
export type LocationContext = z.infer<typeof locationContextSchema>;
export type ResolvedEntity = z.infer<typeof resolvedEntitySchema>;
export type CulturalEvidence = z.infer<typeof evidenceSchema>;
export type ConversationMessage = z.infer<typeof messageSchema>;
export type VisionEntity = z.infer<typeof visionEntitySchema>;
export type ShelfContext = z.infer<typeof shelfContextSchema>;
export type PlaceDetails = z.infer<typeof placeDetailsSchema>;
export type Answer = z.infer<typeof answerSchema>;
export type AskRequest = z.infer<typeof askRequestSchema>;
