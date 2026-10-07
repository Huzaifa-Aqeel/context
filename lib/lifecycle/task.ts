/** A late asynchronous result cannot revive cancelled or replaced session context. */
export class TaskScope {
  private revision = 0;
  cancel() { this.revision++; }
  begin(generation: number, currentGeneration: () => number, active: () => boolean) {
    const revision = ++this.revision;
    return { current: () => revision === this.revision && generation === currentGeneration() && active() };
  }
}
