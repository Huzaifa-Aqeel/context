import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from 'expo-router';
import { TaskScope } from '@/lib/lifecycle/task';
import { useContextStore } from '@/stores/context';
export function useForegroundTask(onCancel?: () => void, allowSystemUI = false, allowPermissionUI = false) {
  const focused = useIsFocused();
  const [scope] = useState(() => new TaskScope());
  const mounted = useRef(false);
  const cancel = useCallback(() => { scope.cancel(); if (mounted.current) onCancel?.(); }, [onCancel, scope]);
  useEffect(() => {
    mounted.current = true;
    const app = AppState.addEventListener('change', (status) => { if (status !== 'active' && !allowSystemUI && !(status === 'inactive' && allowPermissionUI)) cancel(); });
    const session = useContextStore.subscribe((state, previous) => { if (state.generation !== previous.generation) cancel(); });
    return () => { mounted.current = false; scope.cancel(); app.remove(); session(); };
  }, [allowPermissionUI, allowSystemUI, cancel, scope]);
  useEffect(() => { if (!focused) cancel(); return () => scope.cancel(); }, [cancel, focused, scope]);
  return {
    begin: () => scope.begin(useContextStore.getState().generation, () => useContextStore.getState().generation, () => mounted.current && focused && AppState.currentState === 'active'),
    cancel, mounted: () => mounted.current,
  };
}
