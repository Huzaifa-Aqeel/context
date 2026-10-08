import type { z } from 'zod';
import type { tasteCandidateSchema, tasteDraftSchema, tasteProfileSchema, tasteContextSchema, tasteEntitySchema, structuredInterestsSchema } from '@/schemas/taste';
export type TasteEntity = z.infer<typeof tasteEntitySchema>;
export type TasteCandidate = z.infer<typeof tasteCandidateSchema>;
export type TasteDraft = z.infer<typeof tasteDraftSchema>;
export type TasteProfile = z.infer<typeof tasteProfileSchema>;
export type TasteContext = z.infer<typeof tasteContextSchema>;
export type StructuredInterests = z.infer<typeof structuredInterestsSchema>;
