import { z } from 'zod';
const id = z.string().min(1).max(500);
export const evidenceSelectionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fact'), entityId: id }),
  z.object({ kind: z.literal('relationship'), source: id, target: id, relationshipKind: z.enum(['affinity', 'shared_tags']) }),
  z.object({ kind: z.literal('taste'), referenceId: id, interestId: id }),
  z.object({ kind: z.literal('theme'), tag: id }),
  z.object({ kind: z.literal('locality') }),
]);
export const evidenceSelectionsSchema = z.array(evidenceSelectionSchema).max(5);
export type EvidenceSelection = z.infer<typeof evidenceSelectionSchema>;
