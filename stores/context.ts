import { create } from 'zustand';
import type { UserMode } from '@/lib/modes';
import type { ConversationMessage, Locality, Scene } from '@/types/context';

type ContextState = {
  mode: UserMode; image: string | null; scene: Scene | null; locality: Locality | null;
  messages: ConversationMessage[]; autoSpeak: boolean;
  setMode: (mode: UserMode) => void;
  setImage: (image: string) => void;
  setScene: (scene: Scene) => void;
  updateScene: (scene: Scene) => void;
  setLocality: (locality: Locality | null) => void;
  addMessage: (message: ConversationMessage) => void;
  setAutoSpeak: (value: boolean) => void;
  clearSession: () => void;
};

// Intentionally no persistence middleware: images, locality, and conversations are ephemeral.
export const useContextStore = create<ContextState>((set) => ({
  mode: 'scene', image: null, scene: null, locality: null, messages: [], autoSpeak: true,
  setMode: (mode) => set({ mode }),
  setImage: (image) => set({ image, scene: null, messages: [] }),
  setScene: (scene) => set({ scene, image: null, messages: [] }),
  updateScene: (scene) => set({ scene }),
  setLocality: (locality) => set({ locality }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message].slice(-20) })),
  setAutoSpeak: (autoSpeak) => set({ autoSpeak }),
  clearSession: () => set({ image: null, scene: null, locality: null, messages: [] }),
}));
