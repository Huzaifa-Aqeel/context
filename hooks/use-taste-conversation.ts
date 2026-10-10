import { useEffect, useRef } from 'react';
import { postApi } from '@/lib/api/client';
import { interestGroups, tasteDraftSchema, tasteEditResultSchema, tasteProfileSchema } from '@/schemas/taste';
import { useContextStore } from '@/stores/context';
import { useSpokenConversation } from './use-spoken-conversation';
import { bookClarification, bookClarificationPrompt, selectBookClarification } from '@/lib/taste/clarification';
import type { TasteDraft } from '@/types/taste';
import { describeInterestChanges, displayedInterests } from '@/lib/taste/edit-feedback';

export function useTasteConversation(hasProfile: boolean) {
  const editMode = useRef(hasProfile);
  editMode.current = hasProfile;
  const clarification = useRef('');
  const pendingSetup = useRef<TasteDraft | null>(null);
  useEffect(() => { if (!hasProfile) clarification.current = ''; }, [hasProfile]);
  useEffect(() => { if (hasProfile) pendingSetup.current = null; }, [hasProfile]);
  return useSpokenConversation({
    skipPromptSpeech: () => true,
    skipResultSpeech: () => true,
    readyMessage: 'Listening',
    processingMessage: 'Processing',
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
        commit(() => useContextStore.getState().saveInterests(draft.structuredInterests!, profile));
        return choice.skip ? 'I left that book out and saved your other matched interests.' : 'Your interests are saved. You’re ready to explore.';
      }
      if (editMode.current && ((current.interests && Object.values(current.interests).flat().length > 0) || current.profile)) {
        const before = displayedInterests(current.interests, current.profile);
        const response = await postApi('/api/taste/edit', { text: clarification.current ? `${clarification.current} ${text}` : text,
          interests: before, profile: current.profile }, tasteEditResultSchema, signal);
        if (!response.applied) {
          clarification.current = response.clarification ?? 'Tell me what you would like to change.';
          return clarification.current;
        }
        clarification.current = '';
        commit(() => useContextStore.getState().updateInterests(response.interests, response.profile));
        return response.profile?.entities.length
          ? describeInterestChanges(before, response.interests)
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
      commit(() => useContextStore.getState().saveInterests(interests, profile));
      clarification.current = '';
      return 'Your interests are saved. You’re ready to explore.';
    },
  });
}
