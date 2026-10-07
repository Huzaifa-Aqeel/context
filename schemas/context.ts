import { z } from 'zod';

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
});
export const relationshipSchema = z.object({
  source: shortText, target: shortText, description: z.string().max(2000),
  strength: scoreSchema.optional(), evidenceSource: z.literal('qloo'),
});
export const evidenceSchema = z.object({
  entities: z.array(resolvedEntitySchema).max(30),
  relationships: z.array(relationshipSchema).max(100),
  themes: z.array(shortText).max(20), confidence: scoreSchema,
});
export const locationContextSchema = z.object({
  locality: localitySchema, culturalThemes: z.array(shortText).max(20),
  relatedEntities: z.array(shortText).max(30), confidence: confidenceSchema,
});
export const sceneSchema = z.object({
  id: shortText, createdAt: z.iso.datetime(), summary: z.string().min(1).max(8000),
  culturalEvidence: evidenceSchema, locationContext: locationContextSchema.optional(),
  confidence: confidenceSchema,
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
}).refine((value) => value.scene || value.locality, 'Capture a scene or provide an area first.');
export const referenceRequestSchema = z.object({
  entityId: shortText, scene: sceneSchema, question: z.string().trim().min(1).max(2000),
});
export const locationRequestSchema = z.object({
  locality: localitySchema, question: z.string().trim().min(1).max(2000), scene: sceneSchema.optional(),
});
export const answerSchema = z.object({
  answer: z.string().min(1).max(8000), confidence: confidenceSchema,
  scene: sceneSchema.optional(),
});
export const transcriptionSchema = z.object({ text: z.string().trim().min(1).max(2000) });
export const apiErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
