import { defaultSpeechPreferences, type SpeechPreferences } from '@/lib/audio/options';
import type { TasteContext, TasteProfile } from '@/types/taste';
import { create } from 'zustand';
import type { UserMode } from '@/lib/modes';
import type { ConversationMessage, Locality, LocationContext, Scene } from '@/types/context';

type ContextState = {
  mode: UserMode; image: string | null; scene: Scene | null; locality: Locality | null;
  profile: TasteProfile | null; personalization: boolean; tasteContext: TasteContext | null; strategy: 'balanced' | 'familiar' | 'discover';
  setProfile: (profile: TasteProfile) => void; setPersonalization: (enabled: boolean) => void; clearTaste: () => void;
  setTasteContext: (context: TasteContext) => void; setStrategy: (strategy: 'balanced' | 'familiar' | 'discover') => void;
  messages: (ConversationMessage & { tasteSignature?: string })[]; autoSpeak: boolean; locationContext: LocationContext | null; generation: number; speechPreferences: SpeechPreferences;
  setMode: (mode: UserMode) => void;
  setImage: (image: string) => void;
  setScene: (scene: Scene) => void;
  updateScene: (scene: Scene) => void;
  setLocality: (locality: Locality | null) => void;
  setLocationContext: (context: LocationContext) => void;
  addMessage: (message: ConversationMessage) => void;
  setAutoSpeak: (value: boolean) => void;
  setSpeechPreferences: (preferences: SpeechPreferences) => void;
  clearSession: () => void;
};

// Intentionally no persistence middleware: images, locality, and conversations are ephemeral.
export const useContextStore = create<ContextState>((set) => ({
  profile: null, personalization: false, tasteContext: null, strategy: 'balanced',
  setProfile: (profile) => set((state) => ({ profile, personalization: true, tasteContext: null, generation: state.generation + 1 })),
  setPersonalization: (enabled) => set((state) => ({ personalization: enabled && Boolean(state.profile), tasteContext: null, generation: state.generation + 1 })),
  clearTaste: () => set((state) => ({ profile: null, personalization: false, tasteContext: null, strategy: 'balanced', messages: state.messages.filter((message) => !message.tasteSignature), generation: state.generation + 1 })),
  setTasteContext: (tasteContext) => set((state) => state.personalization && state.profile?.signature === tasteContext.profileSignature ? { tasteContext } : {}),
  setStrategy: (strategy) => set((state) => ({ strategy, generation: state.generation + 1 })),
  mode: 'scene', image: null, scene: null, locality: null, messages: [], autoSpeak: true, locationContext: null, generation: 0, speechPreferences: defaultSpeechPreferences,
  setMode: (mode) => set({ mode }),
  setImage: (image) => set((state) => ({ image, scene: null, tasteContext: null, messages: [], generation: state.generation + 1 })),
  setScene: (scene) => set((state) => ({ scene, image: null, messages: [], tasteContext: null, locationContext: scene.locationContext ?? state.locationContext, generation: state.generation + 1 })),
  updateScene: (scene) => set({ scene }),
  setLocality: (locality) => set((state) => ({ locality, locationContext: null, tasteContext: null, messages: [], generation: state.generation + 1 })),
  setLocationContext: (locationContext) => set({ locationContext }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, { ...message, tasteSignature: state.personalization ? state.profile?.signature : undefined }].slice(-20) })),
  setAutoSpeak: (autoSpeak) => set({ autoSpeak }),
  setSpeechPreferences: (speechPreferences) => set({ speechPreferences }),
  clearSession: () => set((state) => ({ image: null, scene: null, locality: null, locationContext: null, profile: null, personalization: false, tasteContext: null, strategy: 'balanced', messages: [], generation: state.generation + 1 })),
}));

export function assertCurrentSession(generation: number) {
  if (useContextStore.getState().generation !== generation) throw new Error("Your exploration context changed. Please ask again.");
}

export function activeTasteRequest() {
  const state = useContextStore.getState();
  return state.personalization && state.profile ? { profile: state.profile, tasteContext: state.tasteContext ?? undefined, strategy: state.strategy } : {};
}

export function conversationForRequest() {
  const state = useContextStore.getState();
  return state.messages.filter((message) => !message.tasteSignature || (state.personalization && message.tasteSignature === state.profile?.signature)).map(({ role, content }) => ({ role, content }));
}
