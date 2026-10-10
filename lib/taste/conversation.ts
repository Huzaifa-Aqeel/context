export type VoicePhase = 'idle' | 'speaking' | 'listening' | 'processing';
export type ConversationState = { phase: VoicePhase; orbVisible: boolean; busy: boolean; message: string; silentSpeech?: boolean };
export const interestsPrompt = "You haven't set up your interests yet. Tell me anything you like in movies and TV, music, books and podcasts, food and dining, places and travel, brands, video games, or anything else. Mention as many or as few as you want. For example: Add Interstellar to movies and TV, and Radiohead to music. I'll listen when I finish speaking. Tap the orb again when you're done.";
type Dependencies<Recording> = {
  prompt?: string | (() => string);
  skipPromptSpeech?: () => boolean;
  skipResultSpeech?: () => boolean;
  readyMessage?: string;
  processingMessage?: string | (() => string);
  failureMessage?: string;
  isActive: () => boolean;
  prepare: (signal: AbortSignal) => Promise<void>;
  speak: (text: string, signal: AbortSignal) => Promise<boolean>;
  record: (signal: AbortSignal) => Promise<void>;
  stopRecording: (signal: AbortSignal) => Promise<Recording>;
  discardRecording: () => Promise<void>;
  save: (recording: Recording, signal: AbortSignal) => Promise<string>;
  onState: (state: ConversationState) => void;
};
/** One explicit start, one spoken response; cancellation cannot resume a microphone. */
export class TasteConversation<Recording> {
  private job?: AbortController;
  private cleanup?: Promise<void>;
  private resultSpeechSkipped = false;
  private state: ConversationState = { phase: 'idle', orbVisible: false, busy: false, message: '' };
  constructor(private dependencies: Dependencies<Recording>) {}
  private emit(next: Partial<ConversationState>) { this.state = { ...this.state, ...next }; this.dependencies.onState(this.state); }
  private current(job: AbortController) { return this.job === job && !job.signal.aborted && this.dependencies.isActive(); }
  private check(job: AbortController) { if (!this.current(job)) throw new Error('Conversation cancelled.'); }
  async start() {
    if (this.job || this.cleanup || !this.dependencies.isActive()) return;
    const job = new AbortController(); this.job = job;
    const skipPromptSpeech = this.dependencies.skipPromptSpeech?.() ?? false;
    const skipResultSpeech = this.dependencies.skipResultSpeech?.() ?? false;
    this.resultSpeechSkipped = skipResultSpeech;
    this.emit({ phase: 'idle', orbVisible: true, busy: true, message: 'Getting ready…', silentSpeech: skipResultSpeech });
    try {
      await this.dependencies.prepare(job.signal); this.check(job);
      if (!skipPromptSpeech) {
        this.emit({ phase: 'speaking', message: this.dependencies.readyMessage ?? 'Listen, then tell me what you like.' });
        const prompt = typeof this.dependencies.prompt === 'function' ? this.dependencies.prompt() : this.dependencies.prompt ?? interestsPrompt;
        if (!await this.dependencies.speak(prompt, job.signal)) throw new Error('I could not play the prompt. Please start again.');
        this.check(job);
      }
      await this.dependencies.record(job.signal); this.check(job);
      this.emit({ phase: 'listening', message: skipPromptSpeech ? 'Listening' : 'Listening. Take your time.' });
    } catch (error) { if (this.job === job) await this.cancel(error instanceof Error ? error.message : 'Please start again.'); }
  }
  async end() {
    if (!this.job) return;
    this.emit({ orbVisible: false });
    if (this.state.phase === 'listening') await this.finish();
    else await this.cancel('Conversation ended.');
  }
  async finish() {
    const job = this.job;
    if (!job || this.state.phase !== 'listening' || !this.current(job)) return;
    this.emit({ phase: 'processing', message: typeof this.dependencies.processingMessage === 'function'
      ? this.dependencies.processingMessage() : this.dependencies.processingMessage ?? 'Saving your interests…' });
    try {
      const recording = await this.dependencies.stopRecording(job.signal); this.check(job);
      const message = await this.dependencies.save(recording, job.signal); this.check(job);
      if (!this.resultSpeechSkipped) {
        this.emit({ phase: 'speaking', message });
        await this.dependencies.speak(message, job.signal); this.check(job);
      }
      await this.cancel(message);
    } catch (error) { if (this.job === job) await this.cancel(error instanceof Error ? error.message : this.dependencies.failureMessage ?? 'I could not save your interests. Please start again.'); }
  }
  async cancel(message = 'Conversation ended.') {
    if (!this.job && !this.cleanup && !this.state.busy) return;
    const job = this.job; this.job = undefined; job?.abort();
    if (this.cleanup) return this.cleanup;
    this.emit({ phase: 'idle', orbVisible: false, busy: true, message });
    const cleanup = this.dependencies.discardRecording().catch(() => {}).then(() => {
      if (this.cleanup === cleanup) { this.cleanup = undefined; if (!this.job) this.emit({ busy: false }); }
    });
    this.cleanup = cleanup; return cleanup;
  }
}

export { TasteConversation as VoiceConversation };

/** Metering may be unavailable on web; the explicit End action always works. */
export class ResponseSilence {
  private startedAt = 0;
  private lastVoiceAt = 0;
  private speechMs = 0;
  private lastAt = 0;
  reset(now: number) { this.startedAt = now; this.lastVoiceAt = 0; this.speechMs = 0; this.lastAt = now; }
  hasSpeech() { return this.speechMs >= 200; }
  sample(now: number, metering?: number): 'finish' | 'empty' | undefined {
    const elapsed = Math.max(0, Math.min(500, now - this.lastAt)); this.lastAt = now;
    if (metering !== undefined && metering > -40) { this.speechMs += elapsed; this.lastVoiceAt = now; }
    if (this.hasSpeech() && now - this.lastVoiceAt >= 6000) return 'finish';
    if (metering !== undefined && !this.hasSpeech() && now - this.startedAt >= 30_000) return 'empty';
    if (now - this.startedAt >= 120_000) return metering !== undefined && !this.hasSpeech() ? 'empty' : 'finish';
  }
}
