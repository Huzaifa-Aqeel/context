import { z } from 'zod';
import type { VisionEntity } from '@/types/context';

type FactField = string;

/** Category-specific rules for the shared visible-item display pipeline. */
export const displayCategories = {
  book: {
    sceneType: 'book_shelf', qlooType: 'urn:entity:book', visualCategory: 'book',
    acceptedVisualCategories: ['book'], itemName: 'book', itemPlural: 'books', carrier: 'book_cover',
    identityUsesRelatedName: true,
    visionInstruction: 'For a display of multiple books return {"sceneType":"book_shelf","items":[{"title":"visible book title","author":"only if printed on the cover"}]}.',
    briefInstruction: 'For books, length_category is approximate (short/medium/long), never an exact page count.',
    briefFields: ['premise', 'genre', 'themes', 'series_status', 'series_name', 'series_position', 'length_category', 'taste_explanation', 'difference'],
    questionFields: [
      { pattern: /\b(what is .{1,80} about|premise|plot)\b/i, field: 'premise' },
      { pattern: /\b(genres?|subgenres?)\b/i, field: 'genre' },
      { pattern: /\bthemes?\b/i, field: 'themes' },
      { pattern: /\b(standalone|part of a series)\b/i, field: 'series_status' },
      { pattern: /\b(series position|which book in the series|first book|second book)\b/i, field: 'series_position' },
      { pattern: /\b(how long|short book|long book|length)\b/i, field: 'length_category' },
    ],
  },
  game: {
    sceneType: 'game_shelf', qlooType: 'urn:entity:videogame', visualCategory: 'videogame',
    acceptedVisualCategories: ['game', 'video_game', 'videogame'], itemName: 'game', itemPlural: 'games', carrier: 'product',
    identityUsesRelatedName: false,
    visionInstruction: 'For a display of multiple video games return {"sceneType":"game_shelf","items":[{"title":"visible game title","platform":"only if readable on packaging","edition":"only if readable"}]}.',
    briefInstruction: 'For games, distinguish local from online co-op; generic multiplayer does not prove either. A visible platform identifies the photographed copy, not every supported platform. Accessibility features must be specific and confidently known; otherwise omit.',
    briefFields: ['premise', 'genre', 'gameplay_style', 'single_player', 'multiplayer', 'local_coop', 'online_coop', 'platforms', 'accessibility_features', 'difficulty_style', 'taste_explanation', 'difference'],
    questionFields: [
      { pattern: /\b(what is .{1,80} about|premise|story)\b/i, field: 'premise' },
      { pattern: /\bgenres?\b/i, field: 'genre' },
      { pattern: /\b(gameplay|play like|combat)\b/i, field: 'gameplay_style' },
      { pattern: /\b(single.player|solo)\b/i, field: 'single_player' },
      { pattern: /\bmultiplayer\b/i, field: 'multiplayer' },
      { pattern: /\b(platforms?|systems?|consoles?)\b/i, field: 'platforms' },
      { pattern: /\b(accessib\w*|screen.reader|subtitles?|colorblind)\b/i, field: 'accessibility_features' },
      { pattern: /\b(difficulty|hard|easy|challenging)\b/i, field: 'difficulty_style' },
    ],
  },
} as const satisfies Record<string, {
  sceneType: string; qlooType: string; visualCategory: string; acceptedVisualCategories: readonly string[];
  visionInstruction: string; briefInstruction: string; carrier: NonNullable<VisionEntity['carrier']>;
  itemName: string; itemPlural: string; identityUsesRelatedName: boolean; briefFields: readonly FactField[];
  questionFields: readonly { pattern: RegExp; field: FactField }[];
}>;

export type DisplayKind = keyof typeof displayCategories;
export const displayKindSchema = z.enum(Object.keys(displayCategories) as [DisplayKind, ...DisplayKind[]]);

export function displayKindForScene(sceneType: string): DisplayKind | undefined {
  return (Object.keys(displayCategories) as DisplayKind[]).find((kind) => displayCategories[kind].sceneType === sceneType);
}
