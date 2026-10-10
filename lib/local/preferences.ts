import { z } from 'zod';
import { defaultSpeechPreferences, speechStyles, speechVoices } from '@/lib/audio/options';
import { structuredInterestsSchema, tasteProfileSchema } from '@/schemas/taste';
import type { StructuredInterests, TasteProfile } from '@/types/taste';
import type { SpeechPreferences } from '@/lib/audio/options';
import { shelfResolutionCacheSchema } from '@/schemas/context';

const savedPreferencesSchema = z.object({
  version: z.literal(1),
  profile: tasteProfileSchema.nullable(),
  interests: structuredInterestsSchema.nullable(),
  locationEnabled: z.boolean(),
  speechPreferences: z.object({ voice: z.enum(speechVoices), style: z.enum(speechStyles) }),
  resolutionCache: shelfResolutionCacheSchema.optional(),
});

export type SavedPreferences = {
  version: 1;
  profile: TasteProfile | null;
  interests: StructuredInterests | null;
  locationEnabled: boolean;
  speechPreferences: SpeechPreferences;
  resolutionCache?: z.infer<typeof shelfResolutionCacheSchema>;
};

export function decodePreferences(raw: string | null): SavedPreferences | null {
  if (!raw) return null;
  try {
    const parsed = savedPreferencesSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const saved = parsed.data;
    if (saved.profile && (!saved.profile.signature || !saved.profile.entities.length)) return null;
    return saved;
  } catch { return null; }
}

export function preferencesFromState(state: {
  profile: TasteProfile | null; interests: StructuredInterests | null;
  locationEnabled: boolean; speechPreferences: SpeechPreferences;
  resolutionCache?: SavedPreferences['resolutionCache'];
}): SavedPreferences {
  return {
    version: 1,
    profile: state.profile?.signature && state.profile.entities.length ? state.profile : null,
    interests: state.interests,
    locationEnabled: state.locationEnabled,
    speechPreferences: state.speechPreferences ?? defaultSpeechPreferences,
    ...(state.resolutionCache ? { resolutionCache: state.resolutionCache } : {}),
  };
}
