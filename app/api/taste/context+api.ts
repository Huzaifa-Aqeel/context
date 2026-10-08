import { jsonRoute } from '@/lib/api/server';
import { QlooClient } from '@/lib/qloo/client';
import { qlooConfig } from '@/lib/server/config';
import { sealDocument, verifyEvidence } from '@/lib/server/evidence';
import { investigateTaste, tasteReferences } from '@/lib/taste/context';
import { tasteContextRequestSchema } from '@/schemas/context';
import { tasteContextSchema } from '@/schemas/taste';
export const POST = jsonRoute(tasteContextRequestSchema, tasteContextSchema, async (input) => {
  await verifyEvidence(input);
  const scene = input.useLocality === false && input.scene ? { ...input.scene, locationContext: undefined } : input.scene;
  return sealDocument(await investigateTaste(input.profile, tasteReferences(scene, input.useLocality === false ? undefined : input.locationContext, input.useLocality === false ? undefined : input.locality), new QlooClient(qlooConfig())), 'taste-context');
});
