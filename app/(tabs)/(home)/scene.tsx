import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, Image, Platform, Text, View } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { useExploration } from '@/hooks/use-exploration';
import { useContextRequest } from '@/hooks/use-context-request';
import { TasteEvidence } from '@/components/taste-evidence';
import { VoiceInput } from '@/components/voice-input';
import { interestConnection, orderedReferences, scenePresentation } from '@/lib/taste/presentation';
import { isConfirmed } from '@/lib/qloo/confirmed';
import { visualName } from '@/lib/orchestration/visual';
import { Body, Button, Notice, Screen, styles } from '@/components/ui';
import { ResponseControls } from '@/components/response-controls';
import { postApi } from '@/lib/api/client';
import { analyzeRequestSchema, sceneSchema } from '@/schemas/context';
import { assertCurrentSession, includeLocality, useContextStore } from '@/stores/context';
import { hasRequiredTasteProfile } from '@/lib/taste/required';
import { ProfileRequired } from '@/components/profile-required';
import { SceneGuidanceDisclosure } from '@/components/scene-guidance-disclosure';
import { capabilityAnswer } from '@/lib/guidance/scene-guidance';

export default function SceneScreen() {
  const { image, scene, setScene, locationEnabled, profile, tasteContext, tasteError, strategy, question, lastQuestion,
    announcedSceneId, markSceneAnnounced, guidanceOpenSceneId, toggleSceneGuidance } = useContextStore();
  const personalization = Boolean(profile && !scene?.shelf && !scene?.event && !scene?.dining);
  const profileReady = hasRequiredTasteProfile(profile);
  const exploration = useExploration();
  const begin = useContextRequest();
  const focused = useIsFocused();
  const attemptedImage = useRef<string | null>(null);
  const resultText = useRef<Text>(null);
  const [laidOutScene, setLaidOutScene] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const analysis = useMutation({
    mutationFn: async () => {
      const request = await begin(); const { state } = request;
      const result = await postApi('/api/scene/analyze', analyzeRequestSchema.parse({ image: state.image, profile: state.profile ?? undefined, resolutionCache: state.resolutionCache, locality: includeLocality(state) ? state.locality ?? undefined : undefined, question: state.question.trim() || undefined }), sceneSchema);
      assertCurrentSession(state.generation);
      if (!request.current()) throw new Error('This scene analysis was cancelled. Try again when you return.');
      return { scene: result, warning: request.warning, generation: state.generation };
    },
    onSuccess: (result) => {
      if (useContextStore.getState().generation !== result.generation) return;
      setScene(result.scene); setNotice(result.warning ?? '');
    },
    onError: (error) => setNotice(error.message),
  });
  useEffect(() => {
    if (profileReady && focused && image && !analysis.isPending && attemptedImage.current !== image) {
      attemptedImage.current = image;
      analysis.mutate();
    }
  }, [profileReady, focused, image, analysis]);
  const ask = (text: string) => {
    setNotice('');
    exploration.mutate(text, { onSuccess: (result) => {
      if (useContextStore.getState().generation === result.requestGeneration) router.push('/conversation');
    }, onError: (error) => setNotice(error.message) });
  };
  const summary = scene ? scenePresentation(scene, profile, tasteContext, personalization, strategy, question || lastQuestion) : '';
  const references = scene ? orderedReferences(scene, personalization ? tasteContext : undefined, strategy, question || lastQuestion).filter(isConfirmed) : [];
  const hasTasteTargets = references.length > 0 || Boolean(locationEnabled && scene?.locationContext?.facts?.length);
  const resultReady = !personalization || !hasTasteTargets || Boolean(tasteContext || tasteError);
  useEffect(() => {
    if (!focused || !scene || laidOutScene !== scene.id || !resultReady || Platform.OS === 'web' || announcedSceneId === scene.id) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
        if (!enabled || cancelled || !resultText.current) return;
        const handle = findNodeHandle(resultText.current);
        if (handle) { AccessibilityInfo.setAccessibilityFocus(handle); markSceneAnnounced(scene.id); }
      }).catch(() => {});
    }, 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [announcedSceneId, focused, laidOutScene, markSceneAnnounced, resultReady, scene, summary]);
  if (!profileReady) return <ProfileRequired />;
  return <Screen>
    {image && <>
      <Image source={{ uri: image }} style={{ width: '100%', height: 240, borderRadius: 18 }} accessibilityLabel="The photo you chose to analyze" resizeMode="contain" />
      <Text accessibilityLiveRegion="polite" style={styles.body}>{analysis.isPending ? 'Looking for meaningful references and supported cultural connections…' : 'Your photo is ready. If analysis was interrupted, you can try again.'}</Text>
      {!analysis.isPending && <Button title="Try scene analysis again" onPress={() => { setNotice(''); analysis.mutate(); }} />}
      <Button title="Retake image" onPress={() => router.replace('/camera')} disabled={analysis.isPending} secondary />
    </>}
    {scene && <>
      <Text ref={resultText} style={styles.body}
        accessibilityLabel={resultReady ? `Scene analysis complete. ${summary}` : summary}
        accessibilityLiveRegion={Platform.OS === 'web' && resultReady ? 'polite' : 'none'}
        onLayout={() => setLaidOutScene(scene.id)}>{summary}</Text>
      <SceneGuidanceDisclosure text={capabilityAnswer(scene)} expanded={guidanceOpenSceneId === scene.id}
        onToggle={() => toggleSceneGuidance(scene.id)} />
      <ResponseControls text={summary} />
      {scene.warnings?.map((warning) => <Notice key={warning} text={warning} speech={false} />)}
      {scene.environmentalObservations?.map((item) => <View key={item.label} style={{ gap: 4 }}><Body>{item.label}</Body><Text style={styles.small}>{item.confidence < 0.7 ? 'Identification uncertain' : 'Visually identified'}{item.position ? ` · ${item.position}` : ''}</Text></View>)}
      <TasteEvidence />
      {references.length > 0 && <>
        <Text accessibilityRole="header" style={[styles.body, { fontWeight: '700' }]}>Notable references</Text>
        {references.map((entity, index) => <View key={`${entity.detectedName}-${index}`} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#C1CDC7' }}>
          <Body>{visualName(entity)}</Body>
          {personalization && interestConnection(entity.qlooId, tasteContext) && <Text style={styles.small}>Connects to your interest in {profile?.entities.find((interest) => interest.id === interestConnection(entity.qlooId, tasteContext)?.interestId)?.name}</Text>}
        </View>)}
      </>}
      <VoiceInput onText={ask} disabled={exploration.isPending} />
    </>}
    {!image && !scene && <>
      <Body>Show Context a scene or ask about a cultural reference.</Body>
      <Button title="Capture a scene" onPress={() => router.replace('/camera')} />
      <Button title="Ask Context" onPress={() => router.push('/conversation')} secondary />
    </>}
    <Notice text={notice} speech={false} />
  </Screen>;
}
