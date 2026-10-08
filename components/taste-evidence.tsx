import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { postApi } from '@/lib/api/client';
import { tasteContextSchema } from '@/schemas/taste';
import { assertCurrentSession, includeLocality, useContextStore } from '@/stores/context';
import { isConfirmed } from '@/lib/qloo/confirmed';
import { Body, Notice } from './ui';
export function TasteEvidence() {
  const { scene, locality, locationEnabled, locationContext, profile, personalization, tasteContext, tasteError, generation, setTasteContext, setTasteError } = useContextStore();
  const focused = useIsFocused();
  const hasReferences = Boolean(scene?.culturalEvidence.entities.some((entity) => entity.source !== 'qloo' && isConfirmed(entity)) || (locationEnabled && (locationContext ?? scene?.locationContext)?.facts?.length));
  const query = useQuery({
    queryKey: ['taste-evidence', generation, scene?.id, profile?.signature],
    enabled: focused && personalization && Boolean(profile && (scene || locationContext)) && hasReferences && !tasteContext && !tasteError,
    gcTime: 0, staleTime: Infinity, retry: false,
    queryFn: async () => {
      const useLocality = includeLocality(useContextStore.getState());
      const result = await postApi('/api/taste/context', { useLocality, profile, scene: scene ?? undefined, locality: useLocality ? locality ?? undefined : undefined, locationContext: useLocality ? locationContext ?? undefined : undefined }, tasteContextSchema);
      assertCurrentSession(generation); return result;
    },
  });
  useEffect(() => { if (focused && query.data && useContextStore.getState().generation === generation) setTasteContext(query.data); }, [focused, generation, query.data, setTasteContext]);
  useEffect(() => { if (focused && query.error && useContextStore.getState().generation === generation) setTasteError(query.error.message); }, [focused, generation, query.error, setTasteError]);
  if (!personalization || !hasReferences) return null;
  return <>
    {query.isFetching && <Body>Finding connections to your interests…</Body>}
    <Notice text={tasteError ?? undefined} speech={false} />
    {tasteContext?.warnings.map((warning) => <Notice key={warning} text={warning} speech={false} />)}
  </>;
}
