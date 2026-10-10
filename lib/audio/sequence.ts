import { defaultSpeechPreferences, directionPrefix, type SpeechPreferences } from './options';
export type SpeechAsset = { uri: string; dispose: () => void };
export type SpeechState = { status: 'idle' | 'loading' | 'playing' | 'error'; error?: string };
type Dependencies = {
  generate: (text: string, signal: AbortSignal, preferences: SpeechPreferences) => Promise<SpeechAsset>;
  play: (uri: string, signal: AbortSignal) => Promise<void>;
  isActive: () => boolean;
  onState: (state: SpeechState) => void;
};

export function splitSpeech(text: string, maxCharacters = 200): string[] {
  const chunks: string[] = [];
  let remaining = text.trim().replace(/\s+/g, ' ');
  while (remaining) {
    let end = Math.min(maxCharacters, remaining.length);
    if (remaining.length > end) {
      const candidate = remaining.slice(0, end);
      const sentences = [...candidate.matchAll(/[.!?](?:["”’']?)\s/g)];
      const sentenceEnd = sentences.at(-1)?.index;
      const spaceEnd = candidate.lastIndexOf(' ');
      if (sentenceEnd !== undefined && sentenceEnd >= 60) end = sentenceEnd + 1;
      else if (spaceEnd >= 60) end = spaceEnd;
      else if (/[\uD800-\uDBFF]/.test(remaining[end - 1])) end--;
    }
    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  return chunks;
}

/** One cancellable utterance; replay reuses only the current response's temporary audio. */
export class SpeechSequence {
  private controller?: AbortController;
  private text = '';
  private assets = new Map<string, SpeechAsset>();
  private retained = new Map<string, Map<string, SpeechAsset>>();
  constructor(private dependencies: Dependencies) {}
  stop() { this.controller?.abort(); this.controller = undefined; this.dependencies.onState({ status: 'idle' }); }
  clear() {
    this.stop(); this.assets.forEach((asset) => asset.dispose()); this.assets.clear(); this.text = '';
  }
  async speak(text: string, preferences: SpeechPreferences = defaultSpeechPreferences, retain = false) {
    this.stop();
    if (!this.dependencies.isActive() || !text.trim()) return false;
    const cacheKey = JSON.stringify({ text, preferences });
    if (this.text !== cacheKey) { this.clear(); this.text = cacheKey; }
    let assets = this.assets;
    if (retain) {
      assets = this.retained.get(cacheKey) ?? new Map<string, SpeechAsset>();
      this.retained.delete(cacheKey);
      this.retained.set(cacheKey, assets);
      while (this.retained.size > 6) {
        const oldestKey = this.retained.keys().next().value!;
        const oldest = this.retained.get(oldestKey)!;
        oldest.forEach((asset) => asset.dispose());
        this.retained.delete(oldestKey);
      }
    }
    const controller = new AbortController();
    this.controller = controller;
    const { signal } = controller;
    try {
      for (const chunk of splitSpeech(text, 200 - directionPrefix(preferences.style).length)) {
        if (signal.aborted || !this.dependencies.isActive()) break;
        let asset = assets.get(chunk);
        if (!asset) {
          this.dependencies.onState({ status: 'loading' });
          asset = await this.dependencies.generate(chunk, signal, preferences);
          if (signal.aborted) { asset.dispose(); break; }
          assets.set(chunk, asset);
        }
        if (!this.dependencies.isActive()) break;
        this.dependencies.onState({ status: 'playing' });
        await this.dependencies.play(asset.uri, signal);
      }
      const completed = this.controller === controller && !signal.aborted && this.dependencies.isActive();
      if (this.controller === controller) { this.controller = undefined; this.dependencies.onState({ status: 'idle' }); }
      return completed;
    } catch (error) {
      if (!signal.aborted && this.controller === controller) {
        this.controller = undefined;
        this.dependencies.onState({ status: 'error', error: error instanceof Error ? error.message : 'Spoken output is unavailable. You can read the response or try replay.' });
      }
      return false;
    }
  }
}
