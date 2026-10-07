import { useState } from 'react';
import { Image, Text } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Body, Button, Card, Heading, Notice, Screen, styles } from '@/components/ui';
import { ResponseControls } from '@/components/response-controls';
import { postApi } from '@/lib/api/client';
import { analyzeRequestSchema, sceneSchema } from '@/schemas/context';
import { useContextStore } from '@/stores/context';

export default function SceneScreen() {
  const { image, scene, locality, mode, setScene } = useContextStore();
  const [notice, setNotice] = useState('');
  const analysis = useMutation({
    mutationFn: () => postApi('/api/scene/analyze', analyzeRequestSchema.parse({ image, locality: locality ?? undefined, mode }), sceneSchema),
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
      <Button title="Ask a follow-up" onPress={() => router.push('/conversation')} />
      {scene.culturalEvidence.entities.map((entity, index) => <Card key={`${entity.detectedName}-${index}`}>
        <Body>{entity.qlooName ?? entity.detectedName}</Body>
        <Text style={styles.small}>{entity.detectedCategory}{(entity.matchConfidence ?? 0) >= 0.75 ? ' · Matched cultural reference' : ' · Identification uncertain'}</Text>
      </Card>)}
    </>}
    {!image && !scene && <>
      <Body>Capture or choose an image to start exploring.</Body>
      <Button title="Capture a scene" onPress={() => router.replace('/camera')} />
    </>}
    <Notice text={notice} />
  </Screen>;
}
