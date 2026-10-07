import { useState } from 'react';
import { useExploration } from '@/hooks/use-exploration';
import { useForegroundTask } from '@/hooks/use-foreground-task';
import { Image, Text } from 'react-native';
import { VoiceInput } from '@/components/voice-input';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { TasteControls } from '@/components/taste-controls';
import { TasteEvidence } from '@/components/taste-evidence';
import { interestConnection, orderedReferences, scenePresentation } from '@/lib/taste/presentation';
import { isConfirmed } from '@/lib/qloo/confirmed';
import { Body, Button, Card, Heading, Notice, Screen, styles, TextInput } from '@/components/ui';
import { ResponseControls } from '@/components/response-controls';
import { postApi } from '@/lib/api/client';
import { analyzeRequestSchema, sceneSchema } from '@/schemas/context';
import { assertCurrentSession, useContextStore } from '@/stores/context';

export default function SceneScreen() {
  const { image, scene, locality, mode, setScene, personalization, profile, tasteContext, tasteError, strategy, question, lastQuestion } = useContextStore();
  const exploration = useExploration();
  const task = useForegroundTask();
  const [notice, setNotice] = useState('');
  const analysis = useMutation({
    mutationFn: async () => {
      const generation = useContextStore.getState().generation;
      const ticket = task.begin();
      const result = await postApi('/api/scene/analyze', analyzeRequestSchema.parse({ image, locality: locality ?? undefined, mode, question: question.trim() || undefined }), sceneSchema);
      assertCurrentSession(generation);
      if (!ticket.current()) throw new Error('This scene analysis was cancelled. Analyze again when you return.');
      return result;
    },
    onSuccess: (result) => { setScene(result); setNotice(''); analysis.reset(); },
    onError: (error) => { setNotice(error.message); analysis.reset(); },
  });
  return <Screen>
    <Heading>{scene ? 'Your scene, in context' : 'Ready to explore'}</Heading>
    {image && <>
      <Image source={{ uri: image }} style={{ width: '100%', height: 240, borderRadius: 18 }} accessibilityLabel="Your captured scene, ready for analysis" resizeMode="contain" />
      <Body>Analyze this image to identify meaningful references. It will be sent to the analysis service.</Body>
      <Body>{locality ? `Area context: ${Object.values(locality).filter(Boolean).join(', ')}.` : 'You can explore this scene without location, or add an area for local context.'}</Body>
      <TextInput accessibilityLabel="Your scene question, optional" value={question} onChangeText={useContextStore.getState().setQuestion} editable={!analysis.isPending} multiline maxLength={2000} placeholder="Ask about the scene, or use the selected mode." placeholderTextColor="#475D60" style={styles.input} />
      <VoiceInput onText={useContextStore.getState().setQuestion} disabled={analysis.isPending} />
      <Button title={analysis.isPending ? 'Analyzing your scene…' : 'Explain this scene'} onPress={() => { setNotice(''); analysis.mutate(); }} disabled={analysis.isPending} />
      <Button title="Add or change area context" onPress={() => router.push('/location')} disabled={analysis.isPending} secondary />
      <Button title="Retake image" onPress={() => router.replace('/camera')} disabled={analysis.isPending} secondary />
    </>}
    {scene && <>
      <Card><Body>{scenePresentation(scene, profile, tasteContext, personalization, strategy, question || lastQuestion)}</Body><Text style={styles.small}>Confidence: {scene.confidence}</Text></Card>
      <ResponseControls text={scenePresentation(scene, profile, tasteContext, personalization, strategy, question || lastQuestion)} automatic={!personalization || Boolean(tasteContext || tasteError)} />
      {scene.warnings?.map((warning) => <Notice key={warning} text={warning} />)}
      <Button title="Ask a follow-up" onPress={() => router.push('/conversation')} />
      <TasteControls disabled={exploration.isPending} onExplore={(text) => exploration.mutate(text, { onSuccess: () => router.push('/conversation'), onError: (error) => setNotice(error.message) })} />
      <TasteEvidence />
      <Body>{personalization ? 'Personalized ordering · The same detected references are shown.' : 'Environmental context · Personalization is off.'}</Body>
      {orderedReferences(scene, personalization ? tasteContext : undefined, strategy, question || lastQuestion).map((entity, index) => <Card key={`${entity.detectedName}-${index}`}>
        <Body>{entity.qlooName ?? entity.detectedName}</Body>
        {personalization && isConfirmed(entity) && interestConnection(entity.qlooId, tasteContext) && <Text style={[styles.small, { fontWeight: '700' }]}>Connects to your interests · {profile?.entities.find((interest) => interest.id === interestConnection(entity.qlooId, tasteContext)?.interestId)?.name}</Text>}
        <Text style={styles.small}>{entity.detectedCategory}{entity.source === 'user' ? ' · Reference you named' : ' · Detected in the image'}{entity.resolutionPending ? ' · Not yet investigated through Qloo' : isConfirmed(entity) ? ' · Matched cultural reference' : ' · Identification uncertain'}{entity.position ? ` · ${entity.position}` : ''}</Text>
        <Button title={`Explore ${entity.qlooName ?? entity.detectedName}`} onPress={() => { useContextStore.getState().setQuestion(`Explain ${entity.qlooName ?? entity.detectedName}.`); router.push('/conversation'); }} secondary />
      </Card>)}
    </>}
    {!image && !scene && <>
      <Body>Capture or choose an image to start exploring.</Body>
      <Button title="Capture a scene" onPress={() => router.replace('/camera')} />
    </>}
    <Notice text={notice} />
  </Screen>;
}
