import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { postApi } from '@/lib/api/client';
import { tasteContextSchema } from '@/schemas/taste';
import { assertCurrentSession, useContextStore } from '@/stores/context';
import { Body, Notice } from './ui';
export function TasteEvidence() {
  const { scene, locationContext, profile, personalization, tasteContext, generation, setTasteContext } = useContextStore();
  const focused = useIsFocused();
  const query = useQuery({
    queryKey: ['taste-evidence', generation, scene?.id, profile?.signature],
    enabled: focused && personalization && Boolean(profile && (scene || locationContext)) && !tasteContext,
    gcTime: 0, staleTime: Infinity, retry: false,
    queryFn: async () => {
      const result = await postApi('/api/taste/context', { profile, scene: scene ?? undefined, locationContext: locationContext ?? undefined }, tasteContextSchema);
      assertCurrentSession(generation); return result;
    },
  });
  useEffect(() => { if (query.data && useContextStore.getState().generation === generation) setTasteContext(query.data); }, [generation, query.data, setTasteContext]);
  if (!personalization) return null;
  return <>
    {query.isFetching && <Body>Finding connections to your interests…</Body>}
    <Notice text={query.error?.message} />
    {tasteContext?.warnings.map((warning) => <Notice key={warning} text={warning} />)}
    {tasteContext && !tasteContext.connections.length && <Body>No supported interest connections were returned. All scene references remain available.</Body>}
  </>;
}
