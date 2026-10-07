import { jsonRoute } from '@/lib/api/server';
import { GroqClient } from '@/lib/groq/client';
import { extractInterests } from '@/lib/groq/interests';
import { QlooClient } from '@/lib/qloo/client';
import { groqConfig, qlooConfig } from '@/lib/server/config';
import { sealDocument } from '@/lib/server/evidence';
import { resolveTasteInterests } from '@/lib/taste/profile';
import { tasteDraftSchema, tasteResolveRequestSchema } from '@/schemas/taste';
export const POST = jsonRoute(tasteResolveRequestSchema, tasteDraftSchema, async ({ text }) => {
  const candidates = await extractInterests(new GroqClient(groqConfig()), text);
  const draft = await resolveTasteInterests(candidates, new QlooClient(qlooConfig()));
  return sealDocument(draft, 'taste-draft');
});
