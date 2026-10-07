import { z } from 'zod';
const text = z.string().trim().min(1).max(500);
export const tasteEntitySchema = z.object({ id: text, name: text, type: text });
export const interestInputSchema = z.object({ label: text, category: text });
export const tasteCandidateSchema = z.discriminatedUnion('status', [
  z.object({ label: text, category: text, status: z.literal('matched'), entity: tasteEntitySchema }),
  z.object({ label: text, category: text, status: z.literal('clarify'), candidates: z.array(tasteEntitySchema).max(3) }),
  z.object({ label: text, category: text, status: z.literal('no_match') }),
]);
const signature = z.string().regex(/^[a-f0-9]{64}$/).optional();
export const tasteDraftSchema = z.object({ candidates: z.array(tasteCandidateSchema).max(10), signature });
export const tasteProfileSchema = z.object({ entities: z.array(tasteEntitySchema).min(1).max(10), signature });
export const tasteConnectionSchema = z.object({
  referenceId: text, interestId: text, kind: z.enum(['exact', 'affinity']),
  strength: z.number().min(0).max(1).optional(), description: z.string().max(1000), evidenceSource: z.literal('qloo'),
});
export const tasteContextSchema = z.object({
  profileSignature: z.string().regex(/^[a-f0-9]{64}$/), referenceIds: z.array(text).max(30),
  connections: z.array(tasteConnectionSchema).max(100), warnings: z.array(z.string().max(1000)).max(10), signature,
});
export const tasteResolveRequestSchema = z.object({ text: z.string().trim().min(1).max(2000) });
export const tasteClarificationSchema = z.object({ label: text, entityId: text });
export const tasteConfirmRequestSchema = z.object({ draft: tasteDraftSchema, includedIds: z.array(text).min(1).max(10), clarified: z.array(tasteClarificationSchema).max(10).optional() });
export const explorationStrategySchema = z.enum(['balanced', 'familiar', 'discover']);
