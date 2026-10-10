import { useMutation } from '@tanstack/react-query';
import { postApi } from '@/lib/api/client';
import { answerSchema, askRequestSchema } from '@/schemas/context';
import { activeTasteRequest, assertCurrentSession, conversationForRequest, includeLocality, useContextStore } from '@/stores/context';
import { useContextRequest } from './use-context-request';
import { asksAboutArea } from '@/lib/orchestration/intent';
import { asksForDiningDiscovery, asksForAreaDiscovery, needsDevicePosition } from '@/lib/orchestration/intent';
import { devicePosition } from '@/lib/location/position';
import { createCalendarAction } from '@/lib/actions/calendar';
import { capabilityAnswer, isCapabilityQuestion } from '@/lib/guidance/scene-guidance';
export function useExploration() {
  const begin = useContextRequest();
  return useMutation({
    mutationFn: async (question: string) => {
      if (isCapabilityQuestion(question)) return { ...answerSchema.parse({ answer: capabilityAnswer(useContextStore.getState().scene) }),
        requestGeneration: useContextStore.getState().generation };
      const request = await begin(question); const { state } = request;
      const dining = asksForDiningDiscovery(question);
      const area = asksForAreaDiscovery(question);
      const active = Boolean(state.scene?.event || state.scene?.dining || state.scene?.area);
      const useLocality = !active && !dining && !area && includeLocality(state) && asksAboutArea(question);
      const needDevicePosition = needsDevicePosition(question, active);
      const position = needDevicePosition && state.locationEnabled ? await devicePosition(request.current) : undefined;
      const result = await postApi('/api/scene/ask', askRequestSchema.parse({ question, scene: state.scene ?? undefined, locality: useLocality ? state.locality ?? undefined : undefined, locationContext: useLocality ? state.locationContext ?? undefined : undefined, useLocality,
        locale: Intl.DateTimeFormat().resolvedOptions().locale, deviceTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locationEnabled: state.locationEnabled, position, messages: conversationForRequest(), ...activeTasteRequest() }), answerSchema);
      assertCurrentSession(state.generation);
      if (!request.current()) throw new Error('This exploration was cancelled. Ask again when you return.');
      let answer = result.answer;
      if (result.action?.kind === 'calendar') {
        try { answer = await createCalendarAction(result.action); }
        catch { answer = 'I could not add that event to Calendar. Please try again or check Calendar permission.'; }
      }
      assertCurrentSession(state.generation);
      return { ...result, answer, action: undefined, requestGeneration: state.generation,
        warnings: [...new Set([...(result.warnings ?? []), ...(request.warning ? [request.warning] : [])])] };
    },
    onSuccess: (result, question) => {
      const state = useContextStore.getState();
      if (state.generation !== result.requestGeneration) return;
      if (result.scene) state.updateScene(result.scene);
      if (result.locationContext) state.setLocationContext(result.locationContext);
      if (result.tasteContext) state.setTasteContext(result.tasteContext);
      state.addMessage({ role: 'user', content: question }); state.addMessage({ role: 'assistant', content: result.answer });
      useContextStore.setState({ lastQuestion: question, question: '' });
    },
  });
}
