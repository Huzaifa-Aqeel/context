import { jsonRoute } from '@/lib/api/server';
import { sealDocument, verifyDocument } from '@/lib/server/evidence';
import { confirmTasteProfile } from '@/lib/taste/profile';
import { tasteConfirmRequestSchema, tasteProfileSchema } from '@/schemas/taste';
export const POST = jsonRoute(tasteConfirmRequestSchema, tasteProfileSchema, async ({ draft, includedIds, clarified }) => {
  await verifyDocument(draft, 'taste-draft');
  return sealDocument(confirmTasteProfile(draft, includedIds, clarified), 'taste-profile');
});
