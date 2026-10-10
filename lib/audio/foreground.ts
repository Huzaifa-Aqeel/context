import { AppState } from 'react-native';

/** Android can report background while its runtime-permission activity is on top. */
export function waitForAppActive(signal?: AbortSignal, timeoutMs = 15_000): Promise<void> {
  if (AppState.currentState === 'active') return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    let subscription: ReturnType<typeof AppState.addEventListener>;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      subscription.remove();
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => finish(new Error('Conversation ended.'));
    const timeout = setTimeout(() => finish(new Error('Return to Context and try again.')), timeoutMs);
    subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') finish();
    });
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    else if (AppState.currentState === 'active') finish();
  });
}
