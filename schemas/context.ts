import { z } from 'zod';
import { explorationStrategySchema, tasteProfileSchema, tasteContextSchema } from './taste';
import { directionPrefix, speechStyles, speechVoices } from '@/lib/audio/options';

export const confidenceSchema = z.enum(['low', 'medium', 'high']);
export const modeSchema = z.enum(['scene', 'reference', 'connection', 'guided', 'location']);
const scoreSchema = z.number().min(0).max(1);
const shortText = z.string().trim().min(1).max(500);

// Locality travels with scene context. Precise coordinates never enter conversation state.
export const localitySchema = z.object({
  neighborhood: shortText.optional(), city: shortText.optional(),
  region: shortText.optional(), country: shortText.optional(),
}).strip().refine((value) => Object.values(value).some(Boolean), 'Provide an area name or locality.');

export const visionEntitySchema = z.object({
  label: shortText, category: shortText, confidence: scoreSchema,
  culturallyRelevant: z.boolean(),
});
export const resolvedEntitySchema = z.object({
  detectedName: shortText, detectedCategory: shortText,
  visionConfidence: scoreSchema, qlooId: shortText.optional(),
  qlooName: shortText.optional(), qlooType: shortText.optional(),
  matchConfidence: scoreSchema.optional(),
  source: z.enum(['vision', 'user', 'qloo']).optional(),
  candidates: z.array(z.object({ id: shortText, name: shortText, type: shortText })).max(3).optional(),
});
export const entityFactSchema = z.object({
  entityId: shortText, name: shortText, category: shortText,
  description: z.string().max(1200).optional(),
  tags: z.array(shortText).max(12), source: z.literal('qloo'),
});
export const relationshipSchema = z.object({
  source: shortText, target: shortText, description: z.string().max(2000),
  strength: scoreSchema.optional(), evidenceSource: z.literal('qloo'),
  kind: z.enum(['affinity', 'shared_tags']).optional(),
});
export const evidenceSchema = z.object({
  entities: z.array(resolvedEntitySchema).max(30),
  relationships: z.array(relationshipSchema).max(100),
  themes: z.array(shortText).max(20), confidence: scoreSchema,
  facts: z.array(entityFactSchema).max(30).optional(),
});
export const locationContextSchema = z.object({
  signature: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  locality: localitySchema, culturalThemes: z.array(shortText).max(20),
  relatedEntities: z.array(shortText).max(30), confidence: confidenceSchema,
  resolvedName: shortText.optional(),
  facts: z.array(entityFactSchema).max(10).optional(),
  warnings: z.array(z.string().max(1000)).max(10).optional(),
});
export const sceneSchema = z.object({
  signature: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  id: shortText, createdAt: z.iso.datetime(), summary: z.string().min(1).max(8000),
  culturalEvidence: evidenceSchema, locationContext: locationContextSchema.optional(),
  confidence: confidenceSchema,
  warnings: z.array(z.string().max(1000)).max(10).optional(),
});
export const messageSchema = z.object({
  role: z.enum(['user', 'assistant']), content: z.string().min(1).max(8000),
});
export const analyzeRequestSchema = z.object({
  image: z.string().max(8_000_000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/, 'Provide a supported base64 image.'),
  locality: localitySchema.optional(), mode: modeSchema.default('scene'),
});
export const askRequestSchema = z.object({
  question: z.string().trim().min(1).max(2000), scene: sceneSchema.optional(),
  locality: localitySchema.optional(), messages: z.array(messageSchema).max(20).default([]),
  mode: modeSchema.default('scene'),
  profile: tasteProfileSchema.optional(), tasteContext: tasteContextSchema.optional(),
  strategy: explorationStrategySchema.optional(),
  locationContext: locationContextSchema.optional(),
}).refine((value) => value.scene || value.locality, 'Capture a scene or provide an area first.');
export const referenceRequestSchema = z.object({
  profile: tasteProfileSchema.optional(), tasteContext: tasteContextSchema.optional(),
  strategy: explorationStrategySchema.optional(),
  entityId: shortText, scene: sceneSchema, question: z.string().trim().min(1).max(2000),
});
export const locationRequestSchema = z.object({
  profile: tasteProfileSchema.optional(), tasteContext: tasteContextSchema.optional(),
  strategy: explorationStrategySchema.optional(),
  locality: localitySchema, question: z.string().trim().min(1).max(2000), scene: sceneSchema.optional(),
});
export const usedTasteConnectionSchema = z.object({ referenceId: shortText, interestId: shortText });
export const answerSchema = z.object({
  usedTasteConnections: z.array(usedTasteConnectionSchema).max(10).optional(),
  tasteContext: tasteContextSchema.optional(),
  answer: z.string().min(1).max(8000), confidence: confidenceSchema,
  scene: sceneSchema.optional(),
  locationContext: locationContextSchema.optional(),
  warnings: z.array(z.string().max(1000)).max(10).optional(),
});
export const transcriptionSchema = z.object({ text: z.string().trim().min(1).max(2000) });
export const apiErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

// Orpheus accepts up to 200 characters per request; the client sequences longer answers.
export const speechRequestSchema = z.object({
  text: z.string().trim().min(1).max(200), voice: z.enum(speechVoices).optional(),
  style: z.enum(speechStyles).default('natural'),
}).refine((input) => directionPrefix(input.style).length + input.text.length <= 200, 'Shorten the text to leave room for vocal direction.');

export const tasteContextRequestSchema = z.object({ profile: tasteProfileSchema, scene: sceneSchema.optional(), locationContext: locationContextSchema.optional() }).refine((value) => value.scene || value.locationContext, "Explore a scene or locality first.");
