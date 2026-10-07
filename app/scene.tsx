import { useState } from 'react';
import { Image, Text } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { TasteControls } from '@/components/taste-controls';
import { TasteEvidence } from '@/components/taste-evidence';
import { interestConnection, orderedReferences } from '@/lib/taste/presentation';
import { Body, Button, Card, Heading, Notice, Screen, styles } from '@/components/ui';
import { ResponseControls } from '@/components/response-controls';
import { postApi } from '@/lib/api/client';
import { analyzeRequestSchema, sceneSchema } from '@/schemas/context';
import { assertCurrentSession, useContextStore } from '@/stores/context';

export default function SceneScreen() {
  const { image, scene, locality, mode, setScene, personalization, profile, tasteContext, strategy } = useContextStore();
  const [notice, setNotice] = useState('');
  const analysis = useMutation({
    mutationFn: async () => {
      const generation = useContextStore.getState().generation;
      const result = await postApi('/api/scene/analyze', analyzeRequestSchema.parse({ image, locality: locality ?? undefined, mode }), sceneSchema);
      assertCurrentSession(generation);
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
      <Button title={analysis.isPending ? 'Analyzing your scene…' : 'Explain this scene'} onPress={() => { setNotice(''); analysis.mutate(); }} disabled={analysis.isPending} />
      <Button title="Add or change area context" onPress={() => router.push('/location')} disabled={analysis.isPending} secondary />
      <Button title="Retake image" onPress={() => router.replace('/camera')} disabled={analysis.isPending} secondary />
    </>}
    {scene && <>
      <Card><Body>{scene.summary}</Body><Text style={styles.small}>Confidence: {scene.confidence}</Text></Card>
      <ResponseControls text={scene.summary} />
      {scene.warnings?.map((warning) => <Notice key={warning} text={warning} />)}
      <Button title="Ask a follow-up" onPress={() => router.push('/conversation')} />
      <TasteControls />
      <TasteEvidence />
      <Body>{personalization ? 'Personalized ordering · The same detected references are shown.' : 'Environmental context · Personalization is off.'}</Body>
      {orderedReferences(scene, personalization ? tasteContext : undefined, strategy).map((entity, index) => <Card key={`${entity.detectedName}-${index}`}>
        <Body>{entity.qlooName ?? entity.detectedName}</Body>
        {personalization && interestConnection(entity.qlooId, tasteContext) && <Text style={[styles.small, { fontWeight: '700' }]}>Connects to your interests · {profile?.entities.find((interest) => interest.id === interestConnection(entity.qlooId, tasteContext)?.interestId)?.name}</Text>}
        <Text style={styles.small}>{entity.detectedCategory}{(entity.matchConfidence ?? 0) >= 0.75 && entity.visionConfidence >= 0.7 ? ' · Matched cultural reference' : ' · Identification uncertain'}</Text>
      </Card>)}
    </>}
    {!image && !scene && <>
      <Body>Capture or choose an image to start exploring.</Body>
      <Button title="Capture a scene" onPress={() => router.replace('/camera')} />
    </>}
    <Notice text={notice} />
  </Screen>;
}
