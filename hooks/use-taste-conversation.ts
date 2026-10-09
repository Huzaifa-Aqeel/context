import { useEffect, useRef } from 'react';
import { postApi } from '@/lib/api/client';
import { interestsPrompt } from '@/lib/taste/conversation';
import { interestGroups, tasteDraftSchema, tasteEditResultSchema, tasteProfileSchema } from '@/schemas/taste';
import { useContextStore } from '@/stores/context';
import { useSpokenConversation } from './use-spoken-conversation';
import { bookClarification, bookClarificationPrompt, selectBookClarification } from '@/lib/taste/clarification';
import type { TasteDraft } from '@/types/taste';

const groupLabels = { movies_tv: 'movies and TV', music_artists: 'music', books_podcasts: 'books and podcasts', dining_food: 'food and dining', places_travel: 'places and travel', brands: 'brands', video_games: 'video games', other: 'other interests' } as const;

export function useTasteConversation(editExisting: boolean, onSetupComplete: () => void) {
  const editMode = useRef(editExisting);
  editMode.current = editExisting;
  const clarification = useRef('');
  const pendingSetup = useRef<TasteDraft | null>(null);
  useEffect(() => { if (!editExisting) clarification.current = ''; }, [editExisting]);
  useEffect(() => { if (editExisting) pendingSetup.current = null; }, [editExisting]);
  return useSpokenConversation({
    prompt: () => {
      const pendingBook = pendingSetup.current && bookClarification(pendingSetup.current);
      if (pendingBook) return `${bookClarificationPrompt(pendingBook)} I'll listen after I finish speaking. Tap the orb again when you're done.`;
      if (!editMode.current) return Object.values(useContextStore.getState().interests ?? {}).flat().length || useContextStore.getState().profile
        ? `Set up your interests again. Your previous interests will be replaced only after you finish. Tell me anything you like in movies and TV, music, books and podcasts, food and dining, places and travel, brands, video games, or anything else. For example: Add Interstellar to movies and TV and Radiohead to music. I'll listen when I finish speaking. Tap the orb again when you're done.`
        : interestsPrompt;
      if (clarification.current) return `${clarification.current} I'll listen after I finish speaking. Tap the orb again when you're done.`;
      const state = useContextStore.getState();
      const groups = state.interests;
      const summary = groups ? interestGroups.filter((group) => groups[group].length).map((group) => `${groups[group].join(', ')} in ${groupLabels[group]}`) : [];
      if (!summary.length && state.profile?.entities.length) summary.push(state.profile.entities.map((entity) => entity.name).join(', '));
      if (!summary.length) return interestsPrompt;
      return `Your interests include ${summary.join('; ')}. You can add, remove, or change them in one response. For example, say: Delete from movies and TV Interstellar. Add to movies and TV Black Panther. You can also say remove all my movies and TV interests. I'll listen after I finish speaking. Tap the orb again when you're done.`;
    },
    readyMessage: 'Listen, then tell me your interests or changes.',
    processingMessage: 'Updating your interests…',
    filename: 'interests',
    saveTranscript: async (text, signal, commit) => {
      const current = useContextStore.getState();
      if (pendingSetup.current) {
        const draft = pendingSetup.current;
        const pendingBook = bookClarification(draft);
        if (!pendingBook) { pendingSetup.current = null; return 'Please start again and tell me your interests.'; }
        const choice = selectBookClarification(pendingBook, text);
        if (!choice) return `I could not tell which author you meant. ${bookClarificationPrompt(pendingBook)}`;
        const includedIds = [...new Set([
          ...draft.candidates.flatMap((candidate) => candidate.status === 'matched' ? [candidate.entity.id] : []),
          ...(choice.skip ? [] : [choice.entityId]),
        ])];
        if (!includedIds.length) { pendingSetup.current = null; return 'I left that book out. Tell me another interest when you are ready.'; }
        const profile = await postApi('/api/taste/confirm', { draft, includedIds,
          clarified: choice.skip ? [] : [{ label: pendingBook.label, entityId: choice.entityId }] }, tasteProfileSchema, signal);
        pendingSetup.current = null;
        commit(() => { useContextStore.getState().saveInterests(draft.structuredInterests!, profile); onSetupComplete(); });
        return choice.skip ? 'I left that book out and saved your other matched interests.' : 'Your interests are saved. You’re ready to explore.';
      }
      if (editMode.current && ((current.interests && Object.values(current.interests).flat().length > 0) || current.profile)) {
        const response = await postApi('/api/taste/edit', { text: clarification.current ? `${clarification.current} ${text}` : text,
          interests: current.interests ?? Object.fromEntries(interestGroups.map((group) => [group, []])), profile: current.profile }, tasteEditResultSchema, signal);
        if (!response.applied) {
          clarification.current = response.clarification ?? 'Tell me what you would like to change.';
          return clarification.current;
        }
        clarification.current = '';
        commit(() => useContextStore.getState().updateInterests(response.interests, response.profile));
        return response.profile?.entities.length
          ? 'Your changes have been applied.'
          : 'Your interests were removed. Add at least one matched interest before exploring.';
      }
      const draft = await postApi('/api/taste/resolve', { text, format: 'categorized' }, tasteDraftSchema, signal);
      const interests = draft.structuredInterests;
      if (!interests) throw new Error('I could not save your interests. Please start again.');
      const count = interestGroups.reduce((total, group) => total + interests[group].length, 0);
      if (!count) return 'I did not hear any interests to save. You can start again whenever you like.';
      const pendingBook = bookClarification(draft);
      if (pendingBook) { pendingSetup.current = draft; return bookClarificationPrompt(pendingBook); }
      const includedIds = [...new Set(draft.candidates.flatMap((candidate) => candidate.status === 'matched' ? [candidate.entity.id] : []))];
      if (!includedIds.length) return 'I could not match any of those interests. You can leave them out and try again with a film, artist, book, brand, game, or place you like.';
      const profile = await postApi('/api/taste/confirm', { draft, includedIds }, tasteProfileSchema, signal);
      commit(() => { useContextStore.getState().saveInterests(interests, profile); onSetupComplete(); });
      clarification.current = '';
      return 'Your interests are saved. You’re ready to explore.';
    },
  });
}
