import { jsonRoute } from '@/lib/api/server';
import { extractTasteEdits } from '@/lib/providers';
import { QlooClient } from '@/lib/qloo/client';
import { qlooConfig } from '@/lib/server/config';
import { sealDocument, verifyDocument } from '@/lib/server/evidence';
import { applyInterestEdits } from '@/lib/taste/edit';
import { resolveTasteInterests } from '@/lib/taste/profile';
import { bookClarification, bookClarificationPrompt } from '@/lib/taste/clarification';
import { tasteEditRequestSchema, tasteEditResultSchema, tasteProfileSchema } from '@/schemas/taste';

const normalize = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const categories = { movies_tv: 'unknown', music_artists: 'artist', books_podcasts: 'book_or_podcast', dining_food: 'unknown', places_travel: 'unknown', brands: 'brand', video_games: 'game', other: 'unknown' } as const;

export const POST = jsonRoute(tasteEditRequestSchema, tasteEditResultSchema, async ({ text, interests, profile }) => {
  if (profile) await verifyDocument(profile, 'taste-profile');
  const extracted = await extractTasteEdits(text, interests);
  const change = applyInterestEdits(interests, text, extracted.operations, extracted.clarification);
  if (!change.interests || !change.added || !change.removed) return { interests, profile, applied: false, clarification: change.clarification ?? 'Please say what you want to change.' };
  if (!change.added.length && !change.removed.length) return { interests, profile, applied: false, clarification: 'Nothing changed. Tell me what you would like to add or remove.' };

  const nextInterests = change.interests;
  const remaining = new Set(Object.values(nextInterests).flat().map(normalize));
  const removedIds = new Set<string>();
  const bindings = profile?.bindings?.filter((binding) => nextInterests[binding.category].some((value) => normalize(value) === normalize(binding.value))) ?? [];
  const unmatchedRemovals = change.removed.filter(({ category, value }) => !remaining.has(normalize(value)) && !profile?.bindings?.some((binding) => {
    if (binding.category !== category || normalize(binding.value) !== normalize(value)) return false;
    if (!bindings.some((kept) => kept.entityId === binding.entityId)) removedIds.add(binding.entityId);
    return true;
  }) && !profile?.entities.some((entity) => {
    if (normalize(entity.name) !== normalize(value)) return false;
    removedIds.add(entity.id); return true;
  }));
  if (profile && unmatchedRemovals.length) {
    const candidates = await resolveTasteInterests(unmatchedRemovals.map(({ category, value }) => ({ label: value, category: categories[category] })), new QlooClient(qlooConfig()), true);
    for (const item of unmatchedRemovals) {
      const match = candidates.candidates.find((candidate) => normalize(candidate.label) === normalize(item.value));
      if (match?.status === 'matched' && profile.entities.some((entity) => entity.id === match.entity.id)) removedIds.add(match.entity.id);
    }
  }
  const oldEntities = profile?.entities.filter((entity) => !removedIds.has(entity.id)) ?? [];
  let addedEntities: typeof oldEntities = [];
  if (change.added.length) {
    const draft = await resolveTasteInterests(change.added.map(({ category, value }) => ({ label: value, category: categories[category] })), new QlooClient(qlooConfig()), true);
    const ambiguousBook = bookClarification(draft);
    if (ambiguousBook) return { interests, profile, applied: false,
      clarification: bookClarificationPrompt(ambiguousBook).replace(/Say the author, or say skip\./, 'Say the full add instruction with the title and author, or leave it out.') };
    addedEntities = draft.candidates.flatMap((candidate) => candidate.status === 'matched' ? [candidate.entity] : []);
    for (const item of change.added) {
      const candidate = draft.candidates.find((entry) => normalize(entry.label) === normalize(item.value));
      if (candidate?.status === 'matched') bindings.push({ category: item.category, value: item.value, entityId: candidate.entity.id });
    }
  }
  const entities = [...new Map([...oldEntities, ...addedEntities].map((entity) => [entity.id, entity])).values()].slice(0, 100);
  const updatedProfile = entities.length ? await sealDocument(tasteProfileSchema.parse({ entities, bindings }), 'taste-profile') : null;
  return { interests: nextInterests, profile: updatedProfile, applied: true };
});
