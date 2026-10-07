/** React Native's AbortSignal lacks timeout()/any(); use portable controller composition. */
export async function withRequestSignal<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number, parent?: AbortSignal | null): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (parent?.aborted) cancel();
  else parent?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, timeoutMs);
  try { return await run(controller.signal); }
  finally { clearTimeout(timer); parent?.removeEventListener('abort', cancel); }
}
