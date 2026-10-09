import type { TasteProfile } from '@/types/taste';

export function hasRequiredTasteProfile(profile: TasteProfile | null): boolean {
  return Boolean(profile?.signature && profile.entities.length > 0);
}
