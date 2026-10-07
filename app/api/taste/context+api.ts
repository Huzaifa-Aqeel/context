import { jsonRoute } from '@/lib/api/server';
import { QlooClient } from '@/lib/qloo/client';
import { qlooConfig } from '@/lib/server/config';
import { sealDocument, verifyEvidence } from '@/lib/server/evidence';
import { investigateTaste, tasteReferences } from '@/lib/taste/context';
import { tasteContextRequestSchema } from '@/schemas/context';
import { tasteContextSchema } from '@/schemas/taste';
export const POST = jsonRoute(tasteContextRequestSchema, tasteContextSchema, async (input) => {
  await verifyEvidence(input);
  return sealDocument(await investigateTaste(input.profile, tasteReferences(input.scene, input.locationContext, input.locality), new QlooClient(qlooConfig())), 'taste-context');
});
