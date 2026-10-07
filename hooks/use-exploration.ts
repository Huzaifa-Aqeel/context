import { useMutation } from '@tanstack/react-query';
import { postApi } from '@/lib/api/client';
import { answerSchema, askRequestSchema } from '@/schemas/context';
import { activeTasteRequest, assertCurrentSession, conversationForRequest, useContextStore } from '@/stores/context';
import { useForegroundTask } from './use-foreground-task';
export function useExploration() {
  const task = useForegroundTask();
  return useMutation({
    mutationFn: async (question: string) => {
      const state = useContextStore.getState(); const generation = state.generation;
      const ticket = task.begin();
      const result = await postApi('/api/scene/ask', askRequestSchema.parse({ question, scene: state.scene ?? undefined, locality: state.locality ?? undefined, locationContext: state.locationContext ?? undefined, messages: conversationForRequest(), mode: state.mode, ...activeTasteRequest() }), answerSchema);
      assertCurrentSession(generation);
      if (!ticket.current()) throw new Error('This exploration was cancelled. Ask again when you return.');
      return result;
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
