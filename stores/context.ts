import { defaultSpeechPreferences, type SpeechPreferences } from '@/lib/audio/options';
import type { StructuredInterests, TasteContext, TasteProfile } from '@/types/taste';
import { create } from 'zustand';
import type { ConversationMessage, Locality, LocationContext, Scene } from '@/types/context';

type ContextState = {
  recordingOwner: string | null; beginRecording: (owner: string) => boolean; endRecording: (owner: string) => void;
  image: string | null; scene: Scene | null; locality: Locality | null;
  locationEnabled: boolean; setLocationEnabled: (enabled: boolean) => void;
  question: string; lastQuestion: string; setQuestion: (question: string) => void;
  profile: TasteProfile | null; personalization: boolean; tasteContext: TasteContext | null; strategy: 'balanced' | 'familiar' | 'discover';
  interests: StructuredInterests | null; saveInterests: (interests: StructuredInterests, profile: TasteProfile | null) => void;
  updateInterests: (interests: StructuredInterests, profile: TasteProfile | null) => void;
  tasteError: string | null; setTasteError: (error: string | null) => void;
  setProfile: (profile: TasteProfile) => void; setPersonalization: (enabled: boolean) => void; clearTaste: () => void;
  setTasteContext: (context: TasteContext) => void; setStrategy: (strategy: 'balanced' | 'familiar' | 'discover') => void;
  messages: (ConversationMessage & { tasteSignature?: string; localityKey?: string })[]; autoSpeak: boolean; locationContext: LocationContext | null; generation: number; speechPreferences: SpeechPreferences;
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
export const useContextStore = create<ContextState>((set, get) => ({
  recordingOwner: null,
  beginRecording: (owner) => { if (get().recordingOwner) return false; set({ recordingOwner: owner }); return true; },
  endRecording: (owner) => { if (get().recordingOwner === owner) set({ recordingOwner: null }); },
  question: '', lastQuestion: '', setQuestion: (question) => set({ question }),
  profile: null, personalization: false, tasteContext: null, tasteError: null, strategy: 'balanced',
  interests: null,
  saveInterests: (interests, profile) => set((state) => ({ interests, profile, personalization: Boolean(profile), tasteContext: null, tasteError: null, generation: state.generation + 1 })),
  updateInterests: (interests, profile) => set((state) => ({ interests, profile, personalization: Boolean(profile) && (state.profile ? state.personalization : true), tasteContext: null, tasteError: null, generation: state.generation + 1 })),
  setTasteError: (tasteError) => set({ tasteError }),
  setProfile: (profile) => set((state) => ({ profile, interests: null, personalization: true, tasteContext: null, tasteError: null, generation: state.generation + 1 })),
  setPersonalization: (enabled) => set((state) => ({ personalization: enabled && Boolean(state.profile), tasteContext: null, tasteError: null, generation: state.generation + 1 })),
  clearTaste: () => set((state) => ({ profile: null, interests: null, personalization: false, tasteContext: null, tasteError: null, strategy: 'balanced', messages: state.messages.filter((message) => !message.tasteSignature), generation: state.generation + 1 })),
  setTasteContext: (tasteContext) => set((state) => state.personalization && state.profile?.signature === tasteContext.profileSignature ? { tasteContext, tasteError: null } : {}),
  setStrategy: (strategy) => set((state) => ({ strategy, generation: state.generation + 1 })),
  image: null, scene: null, locality: null, locationEnabled: false, messages: [], autoSpeak: true, locationContext: null, generation: 0, speechPreferences: defaultSpeechPreferences,
  setLocationEnabled: (locationEnabled) => set((state) => ({ locationEnabled, ...(locationEnabled ? {} : { locality: null, locationContext: null }), tasteContext: null, tasteError: null, generation: state.generation + 1 })),
  setImage: (image) => set((state) => ({ image, scene: null, tasteContext: null, tasteError: null, messages: [], generation: state.generation + 1 })),
  setScene: (scene) => set((state) => ({ scene, image: null, messages: [], tasteContext: null, tasteError: null, locationContext: scene.locationContext ?? state.locationContext, generation: state.generation + 1 })),
  updateScene: (scene) => set({ scene }),
  setLocality: (locality) => set((state) => ({ locality, locationContext: null, tasteContext: null, tasteError: null, generation: state.generation + 1 })),
  setLocationContext: (locationContext) => set({ locationContext }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, { ...message, tasteSignature: state.personalization ? state.profile?.signature : undefined, localityKey: message.role === 'assistant' && includeLocality(state) && state.locality ? localityKey(state.locality) : undefined }].slice(-20) })),
  setAutoSpeak: (autoSpeak) => set({ autoSpeak }),
  setSpeechPreferences: (speechPreferences) => set({ speechPreferences }),
  clearSession: () => set((state) => ({ question: '', lastQuestion: '', image: null, scene: null, locality: null, locationEnabled: false, locationContext: null, profile: null, interests: null, personalization: false, tasteContext: null, tasteError: null, strategy: 'balanced', messages: [], generation: state.generation + 1 })),
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
  const currentArea = includeLocality(state) && state.locality ? localityKey(state.locality) : undefined;
  return state.messages.filter((message) => (!message.tasteSignature || (state.personalization && message.tasteSignature === state.profile?.signature)) && (!message.localityKey || message.localityKey === currentArea)).map(({ role, content }) => ({ role, content }));
}
export const localityKey = (locality: Locality) => JSON.stringify(Object.entries(locality).sort(([a], [b]) => a.localeCompare(b)));
export const includeLocality = (state: Pick<ContextState, 'locationEnabled'>) => state.locationEnabled;
