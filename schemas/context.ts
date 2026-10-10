import { z } from 'zod';
import { explorationStrategySchema, tasteProfileSchema, tasteContextSchema } from './taste';
import { directionPrefix, speechStyles, speechVoices } from '@/lib/audio/options';
import { MAX_SCENE_IMAGE_DATA_URI_LENGTH } from '@/lib/image-limits';
import { displayKindSchema } from '@/lib/display/categories';

export const confidenceSchema = z.enum(['low', 'medium', 'high']);
export const modeSchema = z.enum(['scene', 'reference', 'connection', 'guided', 'location']);
const scoreSchema = z.number().min(0).max(1);
const shortText = z.string().trim().min(1).max(500);

// Locality travels with scene context. Precise coordinates never enter conversation state.
export const localitySchema = z.object({
  neighborhood: shortText.optional(), city: shortText.optional(),
  region: shortText.optional(), country: shortText.optional(),
}).strip().refine((value) => Object.values(value).some(Boolean), 'Locality is required.');

export const visionEntitySchema = z.object({
  label: shortText, category: shortText, confidence: scoreSchema,
  culturallyRelevant: z.boolean(),
  role: z.enum(['primary_subject', 'headliner', 'participant', 'speaker', 'venue', 'brand', 'featured_work', 'organizer', 'other']).optional(),
  qlooPriority: z.enum(['primary', 'secondary', 'context_only']).optional(),
  carrier: z.enum(['poster', 'clothing', 'brand_mark', 'book_cover', 'artwork', 'product', 'logo', 'venue_sign', 'album_cover', 'film_reference', 'other']).optional(),
  visualDescription: shortText.optional(), visibleText: shortText.optional(),
  relatedName: shortText.optional(), relatedCategory: shortText.optional(),
  visiblePlatform: shortText.optional(), visibleEdition: shortText.optional(),
  // Used only by voluntary taste-entry resolution, where the user has not named a domain.
  allowBroadSearch: z.boolean().optional(),
  position: shortText.optional(),
  necessaryInformation: z.boolean().optional(),
});
export const resolvedEntitySchema = z.object({
  detectedName: shortText, detectedCategory: shortText,
  visionConfidence: scoreSchema, qlooId: shortText.optional(),
  role: visionEntitySchema.shape.role, qlooPriority: visionEntitySchema.shape.qlooPriority,
  qlooName: shortText.optional(), qlooType: shortText.optional(),
  matchConfidence: scoreSchema.optional(),
  source: z.enum(['vision', 'user', 'qloo']).optional(),
  groundingBasis: z.enum(['direct', 'related']).optional(),
  carrier: visionEntitySchema.shape.carrier, visualDescription: shortText.optional(), visibleText: shortText.optional(), relatedName: shortText.optional(),
  visiblePlatform: shortText.optional(), visibleEdition: shortText.optional(),
  position: shortText.optional(), resolutionPending: z.boolean().optional(),
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
  investigatedPairs: z.array(shortText).max(30).optional(),
});
export const locationContextSchema = z.object({
  signature: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  locality: localitySchema, culturalThemes: z.array(shortText).max(20),
  relatedEntities: z.array(shortText).max(30), confidence: confidenceSchema,
  resolvedName: shortText.optional(),
  facts: z.array(entityFactSchema).max(10).optional(),
  warnings: z.array(z.string().max(1000)).max(10).optional(),
});
export const shelfItemSchema = z.object({
  title: shortText, position: shortText.optional(),
  visualProvenance: z.literal('VISIBLE').default('VISIBLE'),
  visibleAuthor: shortText.optional(), visibleRelatedName: shortText.optional(), visiblePlatform: shortText.optional(), visibleEdition: shortText.optional(),
  category: z.string().trim().min(1).max(80).optional(), categoryProvenance: z.literal('MODEL').optional(),
  genre: z.string().trim().min(1).max(80).optional(), genreProvenance: z.literal('MODEL').optional(),
  qlooId: shortText.optional(), qlooName: shortText.optional(), qlooProvenance: z.literal('QLOO').optional(),
  exactInterest: z.boolean().optional(), interestProvenance: z.literal('USER').optional(),
  resolution: z.enum(['matched', 'ambiguous', 'unmatched', 'unavailable']),
  affinity: scoreSchema.optional(), contributingInterestIds: z.array(shortText).max(100).optional(),
});
export const shelfResolutionCacheSchema = z.object({
  version: z.literal(1), entries: z.array(z.union([z.object({
    kind: displayKindSchema, title: shortText, author: shortText.optional(), relatedName: shortText.optional(),
    qlooId: shortText, qlooName: shortText, qlooType: shortText,
  }), z.object({ kind: z.literal('flyer'), title: shortText,
    qlooId: shortText, qlooName: shortText, qlooType: shortText })])).max(100), signature: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
// Category adapters declare allowed fields; the shared schema only enforces safe field-key syntax.
export const shelfFactFieldSchema = z.string().regex(/^[a-z][a-z0-9_]{0,49}$/);
export const shelfFactSchema = z.object({
  field: shelfFactFieldSchema, value: shortText,
  sourceUrl: z.url().max(1000).optional(), retrievedAt: z.iso.datetime().optional(),
  supportingQuote: z.string().trim().min(1).max(600).optional(), provenance: z.enum(['MODEL', 'RESEARCHED']),
});
export const shelfBriefItemSchema = z.object({
  qlooId: shortText, facts: z.array(shelfFactSchema).max(24),
  unknownFields: z.array(shelfFactFieldSchema).max(24),
  targetedAttemptedFields: z.array(shelfFactFieldSchema).max(24).optional(),
});
export const shelfContextSchema = z.object({
  kind: displayKindSchema, inventory: z.array(shelfItemSchema),
  shortlistIds: z.array(shortText).max(4), rankingComplete: z.boolean(),
  profileSignature: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  briefItems: z.array(shelfBriefItemSchema).max(120).optional(),
  briefCreatedAt: z.iso.datetime().optional(),
  researchChecks: z.array(z.object({
    key: shortText, checkedAt: z.iso.datetime(),
    answer: z.string().trim().min(1).max(800).optional(),
    confidence: confidenceSchema.optional(),
    sources: z.array(z.object({ title: shortText, url: z.url().max(1000),
      content: z.string().trim().min(1).max(1200), retrievedAt: z.iso.datetime() })).max(4),
  })).max(8).optional(),
});
export const eventVisualSchema = z.object({
  materialType: z.enum(['flyer', 'program', 'schedule', 'handout']).optional(),
  kind: z.enum(['concert', 'festival', 'conference', 'talk', 'brand_promotion', 'venue_promotion', 'movie', 'book', 'game', 'mixed', 'unknown']).optional(),
  primarySubject: z.object({ name: shortText, entityIndex: z.number().int().min(0).max(119).nullable() }).nullable().optional(),
  title: shortText.optional(), dateText: shortText.optional(), timeText: shortText.optional(), endTimeText: shortText.optional(), timezoneText: shortText.optional(),
  venueName: shortText.optional(), locationText: shortText.optional(),
  performers: z.array(shortText).default([]), schedule: z.array(shortText).default([]),
  printedDetails: z.array(shortText).optional(),
});
export const eventFactSchema = z.object({
  kind: z.enum(['status', 'schedule', 'tickets', 'date', 'time', 'timezone', 'official_page', 'review']),
  value: shortText, sourceUrl: z.url().max(1000), retrievedAt: z.iso.datetime(), supportingQuote: z.string().trim().min(1).max(600),
});
export const placeDetailsSchema = z.object({
  name: shortText, placeId: shortText, address: shortText.optional(), phone: shortText.optional(),
  openNow: z.boolean().optional(), checkedAt: z.iso.datetime(),
  latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(),
  timezone: shortText.optional(), website: z.url().max(1000).optional(), openingHours: z.string().max(1000).optional(),
  paymentOptions: z.unknown().optional(), reservation: z.enum(['required', 'recommended', 'unknown']).optional(),
  categories: z.array(shortText).max(30).optional(), cuisine: shortText.optional(), diet: shortText.optional(),
});
export const placeAnchorSchema = z.object({
  kind: z.enum(['device', 'venue', 'named']), name: shortText.nullable(),
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  timezone: shortText.nullable(), source: z.enum(['foreground_location', 'event_scene', 'geoapify_geocode']),
  confidence: scoreSchema.nullable(), placeId: shortText.optional(),
});
export const placeCandidateSchema = z.object({
  qlooId: shortText, name: shortText, radiusMeters: z.number().int().min(0).max(5000),
  affinity: scoreSchema.optional(), contributingInterestIds: z.array(shortText).max(100),
  cuisineTags: z.array(shortText).max(5), tagIds: z.array(shortText).max(50).optional(),
  distanceMeters: z.number().min(0).optional(), address: shortText.optional(),
  businessRating: z.number().min(0).max(5).optional(), restaurantCategory: shortText.optional(), phone: shortText.optional(),
  latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(),
  city: shortText.optional(), bucket: z.enum(['cafe', 'bookstore', 'record_store', 'museum_gallery', 'live_music', 'park', 'other']).optional(),
});
const placeMatchSchema = z.object({ qlooId: shortText,
  status: z.enum(['confirmed', 'unverified', 'ambiguous_or_contradictory']),
  details: placeDetailsSchema.optional(), checkedAt: z.iso.datetime() });
export const eventContextSchema = z.object({
  visual: eventVisualSchema,
  profileSignature: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  ranking: z.array(z.object({ entityId: shortText, name: shortText, affinity: scoreSchema.optional(),
    exactInterest: z.boolean(), contributingInterestIds: z.array(shortText).max(100), sharedTag: shortText.optional() })).max(30),
  researchedFacts: z.array(eventFactSchema).max(30).default([]),
  researchChecks: z.array(z.object({ kind: z.enum(['status', 'schedule', 'tickets', 'official_page', 'calendar', 'reviews']), checkedAt: z.iso.datetime() })).max(20).optional(),
  answerCache: z.array(z.object({ question: z.string().trim().min(1).max(800), answer: z.string().trim().min(1).max(800),
    confidence: confidenceSchema, evidence: z.array(z.object({ id: shortText, value: z.string().trim().min(1).max(600) })).min(1).max(8),
    createdAt: z.iso.datetime() })).max(8).optional(),
  verifiedTicketUrl: z.url().max(1000).optional(),
  verifiedStart: z.object({ start: z.iso.datetime({ offset: true }), timeZone: shortText, sourceUrl: z.url().max(1000), checkedAt: z.iso.datetime() }).optional(),
  pendingCalendar: z.object({ title: shortText, start: z.iso.datetime({ offset: true }), timeZone: shortText,
    location: shortText.optional(), reminderMinutes: z.number().int().min(1).max(10080).optional() }).optional(),
  pendingCalendarDetails: z.object({ title: shortText, reminderMinutes: z.number().int().min(1).max(10080).optional() }).optional(),
  place: placeDetailsSchema.optional(),
});
export const diningContextSchema = z.object({
  profileSignature: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  anchor: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('device') }),
  ]).optional(),
  resolvedAnchor: placeAnchorSchema.optional(),
  candidates: z.array(placeCandidateSchema).max(8), selectedIds: z.array(shortText).max(6).optional(),
  matches: z.array(placeMatchSchema).max(8).optional(),
  walk10Geometry: z.unknown().optional(),
  discoveredAt: z.iso.datetime(),
  position: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).optional(),
  places: z.array(z.object({ qlooId: shortText, details: placeDetailsSchema })).max(8).optional(),
});
export const areaContextSchema = z.object({
  anchor: placeAnchorSchema, profileSignature: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  qlooUnionResults: z.array(placeCandidateSchema).max(30),
  qlooTopUpResults: z.record(z.string(), z.array(placeCandidateSchema).max(5)).default({}),
  presentedIds: z.array(shortText).max(30), matches: z.array(placeMatchSchema).max(30).default([]),
  orientation: z.object({ street: shortText.nullable(), neighborhood: shortText.nullable(), city: shortText.nullable() }).nullable(),
  walk10Geometry: z.unknown().optional(), createdAt: z.iso.datetime(),
});
export const sceneSchema = z.object({
  origin: z.enum(['image', 'conversation']).optional(),
  signature: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  id: shortText, createdAt: z.iso.datetime(), summary: z.string().min(1),
  culturalEvidence: evidenceSchema, locationContext: locationContextSchema.optional(),
  shelf: shelfContextSchema.optional(), event: eventContextSchema.optional(), dining: diningContextSchema.optional(),
  area: areaContextSchema.optional(),
  resolutionCache: shelfResolutionCacheSchema.optional(),
  confidence: confidenceSchema,
  warnings: z.array(z.string().max(1000)).max(10).optional(),
  environmentalObservations: z.array(z.object({ label: shortText, confidence: scoreSchema, position: shortText.optional(), necessaryInformation: z.boolean().optional() })).max(5).optional(),
});
export const messageSchema = z.object({
  role: z.enum(['user', 'assistant']), content: z.string().min(1).max(8000),
});
export const analyzeRequestSchema = z.object({
  image: z.string().max(MAX_SCENE_IMAGE_DATA_URI_LENGTH).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/, 'Provide a supported base64 image.'),
  locality: localitySchema.optional(), mode: modeSchema.default('scene'),
  question: z.string().trim().min(1).max(2000).optional(),
  profile: tasteProfileSchema.optional(),
  resolutionCache: shelfResolutionCacheSchema.optional(),
});
export const askRequestSchema = z.object({
  useLocality: z.boolean().optional(),
  locationEnabled: z.boolean().optional(),
  locale: z.string().trim().min(2).max(30).optional(), deviceTimeZone: shortText.optional(),
  question: z.string().trim().min(1).max(2000), scene: sceneSchema.optional(),
  locality: localitySchema.optional(), messages: z.array(messageSchema).max(20).default([]),
  mode: modeSchema.default('scene'),
  profile: tasteProfileSchema.optional(), tasteContext: tasteContextSchema.optional(),
  strategy: explorationStrategySchema.optional(),
  locationContext: locationContextSchema.optional(),
  position: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).optional(),
});
export const referenceRequestSchema = z.object({
  profile: tasteProfileSchema.optional(), tasteContext: tasteContextSchema.optional(),
  strategy: explorationStrategySchema.optional(),
  entityId: shortText, scene: sceneSchema, question: z.string().trim().min(1).max(2000),
});
export const locationRequestSchema = z.object({
  locationContext: locationContextSchema.optional(), messages: z.array(messageSchema).max(20).default([]),
  profile: tasteProfileSchema.optional(), tasteContext: tasteContextSchema.optional(),
  strategy: explorationStrategySchema.optional(),
  locality: localitySchema, question: z.string().trim().min(1).max(2000), scene: sceneSchema.optional(),
});
export const usedTasteConnectionSchema = z.object({ referenceId: shortText, interestId: shortText });
export const answerSchema = z.object({
  usedTasteConnections: z.array(usedTasteConnectionSchema).max(10).optional(),
  tasteContext: tasteContextSchema.optional(),
  answer: z.string().min(1), confidence: confidenceSchema,
  scene: sceneSchema.optional(),
  locationContext: locationContextSchema.optional(),
  warnings: z.array(z.string().max(1000)).max(10).optional(),
  action: z.object({ kind: z.literal('calendar'), title: shortText, start: z.iso.datetime({ offset: true }), end: z.iso.datetime({ offset: true }),
    endIsPlaceholder: z.boolean(), timeZone: shortText, location: shortText.optional(), reminderMinutes: z.number().int().min(1).max(10080).optional() }).optional(),
});
export const transcriptionSchema = z.object({ text: z.string().trim().min(1).max(2000) });
export const apiErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

// Orpheus accepts up to 200 characters per request; the client sequences longer answers.
export const speechRequestSchema = z.object({
  text: z.string().trim().min(1).max(200), voice: z.enum(speechVoices).optional(),
  style: z.enum(speechStyles).default('natural'),
}).refine((input) => directionPrefix(input.style).length + input.text.length <= 200, 'Shorten the text to leave room for vocal direction.');

export const tasteContextRequestSchema = z.object({ useLocality: z.boolean().optional(), profile: tasteProfileSchema, scene: sceneSchema.optional(), locality: localitySchema.optional(), locationContext: locationContextSchema.optional() }).refine((value) => value.scene || value.locationContext, "Explore a scene or locality first.");
