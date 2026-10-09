import { z } from 'zod';
const text = z.string().trim().min(1).max(500);
export const interestGroups = ['movies_tv', 'music_artists', 'books_podcasts', 'dining_food', 'places_travel', 'brands', 'video_games', 'other'] as const;
export const structuredInterestsSchema = z.object({
  movies_tv: z.array(text).max(100), music_artists: z.array(text).max(100),
  books_podcasts: z.array(text).max(100), dining_food: z.array(text).max(100),
  places_travel: z.array(text).max(100), brands: z.array(text).max(100),
  video_games: z.array(text).max(100), other: z.array(text).max(100),
}).refine((groups) => Object.values(groups).flat().length <= 100, 'Try a shorter response.');
export const tasteEntitySchema = z.object({ id: text, name: text, type: text });
export const interestInputSchema = z.object({ label: text, category: text });
export const tasteCandidateSchema = z.discriminatedUnion('status', [
  z.object({ label: text, category: text, status: z.literal('matched'), entity: tasteEntitySchema }),
  z.object({ label: text, category: text, status: z.literal('clarify'), candidates: z.array(tasteEntitySchema).max(3) }),
  z.object({ label: text, category: text, status: z.literal('no_match') }),
]);
const signature = z.string().regex(/^[a-f0-9]{64}$/).optional();
export const tasteDraftSchema = z.object({ candidates: z.array(tasteCandidateSchema).max(100), structuredInterests: structuredInterestsSchema.optional(), warnings: z.array(text).max(5).optional(), signature });
export const tasteProfileSchema = z.object({ entities: z.array(tasteEntitySchema).min(1).max(100),
  bindings: z.array(z.object({ category: z.enum(interestGroups), value: text, entityId: text })).max(100).optional(), signature });
export const tasteConnectionSchema = z.object({
  referenceId: text, interestId: text, kind: z.enum(['exact', 'affinity']),
  strength: z.number().min(0).max(1).optional(), sharedTags: z.array(text).max(3).optional(), description: z.string().max(1000), evidenceSource: z.literal('qloo'),
});
export const tasteContextSchema = z.object({
  profileSignature: z.string().regex(/^[a-f0-9]{64}$/), referenceIds: z.array(text).max(30),
  connections: z.array(tasteConnectionSchema).max(100), warnings: z.array(z.string().max(1000)).max(10), signature,
});
export const tasteResolveRequestSchema = z.object({ text: z.string().trim().min(1).max(2000), format: z.enum(['legacy', 'categorized']).default('legacy') });
export const tasteClarificationSchema = z.object({ label: text, entityId: text });
export const tasteConfirmRequestSchema = z.object({ draft: tasteDraftSchema, includedIds: z.array(text).min(1).max(100), clarified: z.array(tasteClarificationSchema).max(100).optional() });
export const explorationStrategySchema = z.enum(['balanced', 'familiar', 'discover']);
export const tasteEditOperationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), category: z.enum(interestGroups), value: text }),
  z.object({ action: z.literal('remove'), category: z.enum(interestGroups), value: text }),
  z.object({ action: z.literal('clear'), category: z.enum(interestGroups) }),
]);
export const tasteEditExtractionSchema = z.object({ operations: z.array(tasteEditOperationSchema).max(30), clarification: z.string().trim().max(300).optional() });
export const tasteEditRequestSchema = z.object({ text: z.string().trim().min(1).max(2000), interests: structuredInterestsSchema, profile: tasteProfileSchema.nullable() });
export const tasteEditResultSchema = z.object({ interests: structuredInterestsSchema, profile: tasteProfileSchema.nullable(), applied: z.boolean(), clarification: z.string().optional() });
