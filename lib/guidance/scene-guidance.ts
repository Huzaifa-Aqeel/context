import type { Scene } from '@/types/context';

export const sceneGuidance = {
  book_shelf: 'Ask Context about a book’s premise, genre, themes, series order, or length when known. You can compare the books, ask which fits your interests, or check a current detail such as availability.',
  game_shelf: 'Ask Context about gameplay, difficulty, solo or multiplayer play, local or online co-op, platforms, and accessibility features when known. You can compare the games or ask which fits your interests.',
  event_material: 'Ask Context to compare performers, check event changes, schedules, tickets, or an official event page. You can ask about the venue or dining near it, and add a verified event or reminder to Calendar.',
} as const;

const otherGuidance = {
  dining: 'Ask Context to compare these dining options or check a place’s address and opening hours when available.',
  area: 'Ask Context about one of these places, ask what else is nearby, or ask for food instead.',
  general: 'Ask Context about a visible reference, how the references connect, or a specific detail you want to understand.',
  noScene: 'Ask Context to find dining or culturally interesting places near a location you name, or near you if Location is enabled.',
} as const;

export const isGuidanceText = (text: string) => [...Object.values(sceneGuidance), ...Object.values(otherGuidance)].some((value) => value === text);

export function sceneGuidanceKind(scene: Scene | null | undefined): keyof typeof sceneGuidance | null {
  if (scene?.shelf?.kind === 'book') return 'book_shelf';
  if (scene?.shelf?.kind === 'game') return 'game_shelf';
  if (scene?.event) return 'event_material';
  return null;
}

export function isCapabilityQuestion(question: string): boolean {
  return /^(?:what (?:can|could) i ask(?: you| context)?|what can (?:you|context) (?:do|help me with)(?: here| with this)?)\??[.!]?$/i.test(question.trim());
}

export function capabilityAnswer(scene: Scene | null | undefined): string {
  const kind = sceneGuidanceKind(scene);
  if (kind) return sceneGuidance[kind];
  if (scene?.dining) return otherGuidance.dining;
  if (scene?.area) return otherGuidance.area;
  if (scene) return otherGuidance.general;
  return otherGuidance.noScene;
}
