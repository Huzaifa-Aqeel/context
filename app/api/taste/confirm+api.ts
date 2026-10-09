import { jsonRoute } from '@/lib/api/server';
import { sealDocument, verifyDocument } from '@/lib/server/evidence';
import { confirmTasteProfile } from '@/lib/taste/profile';
import { interestGroups, tasteConfirmRequestSchema, tasteProfileSchema } from '@/schemas/taste';
export const POST = jsonRoute(tasteConfirmRequestSchema, tasteProfileSchema, async ({ draft, includedIds, clarified }) => {
  await verifyDocument(draft, 'taste-draft');
  const profile = confirmTasteProfile(draft, includedIds, clarified);
  const bindings = interestGroups.flatMap((category) => draft.structuredInterests?.[category].flatMap((value) => {
    const candidate = draft.candidates.find((item) => item.label.toLowerCase() === value.toLowerCase());
    const id = candidate?.status === 'matched' ? candidate.entity.id : clarified?.find((choice) => choice.label === value)?.entityId;
    const entity = profile.entities.find((item) => item.id === id);
    return entity ? [{ category, value, entityId: entity.id }] : [];
  }) ?? []);
  return sealDocument({ ...profile, bindings }, 'taste-profile');
});
