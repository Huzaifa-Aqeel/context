import { useMutation } from '@tanstack/react-query';
import { postApi } from '@/lib/api/client';
import { answerSchema, askRequestSchema } from '@/schemas/context';
import { activeTasteRequest, assertCurrentSession, conversationForRequest, includeLocality, useContextStore } from '@/stores/context';
import { useContextRequest } from './use-context-request';
export function useExploration() {
  const begin = useContextRequest();
  return useMutation({
    mutationFn: async (question: string) => {
      const request = await begin(); const { state } = request;
      const result = await postApi('/api/scene/ask', askRequestSchema.parse({ question, scene: state.scene ?? undefined, locality: includeLocality(state) ? state.locality ?? undefined : undefined, locationContext: includeLocality(state) ? state.locationContext ?? undefined : undefined, useLocality: includeLocality(state), messages: conversationForRequest(), ...activeTasteRequest() }), answerSchema);
      assertCurrentSession(state.generation);
      if (!request.current()) throw new Error('This exploration was cancelled. Ask again when you return.');
      return { ...result, warnings: [...new Set([...(result.warnings ?? []), ...(request.warning ? [request.warning] : [])])] };
    },
    onSuccess: (result, question) => {
      const state = useContextStore.getState();
      if (result.scene) state.updateScene(result.scene);
      if (result.locationContext) state.setLocationContext(result.locationContext);
      if (result.tasteContext) state.setTasteContext(result.tasteContext);
      state.addMessage({ role: 'user', content: question }); state.addMessage({ role: 'assistant', content: result.answer });
      useContextStore.setState({ lastQuestion: question, question: '' });
    },
  });
}
