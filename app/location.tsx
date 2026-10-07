import { useState } from 'react';
import { TextInput } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Body, Button, Card, Heading, Notice, Screen, styles } from '@/components/ui';
import { ResponseControls } from '@/components/response-controls';
import { VoiceInput } from '@/components/voice-input';
import { useLocality } from '@/hooks/use-locality';
import { postApi } from '@/lib/api/client';
import { answerSchema, locationRequestSchema } from '@/schemas/context';
import { useContextStore } from '@/stores/context';

const questions = ['What kind of area am I in?', 'What is culturally significant about this neighborhood?', "How does what I'm seeing relate to this area?"];

export default function LocationScreen() {
  const { locality, scene, image, setLocality } = useContextStore();
  const { requestLocality, pending, notice } = useLocality();
  const [area, setArea] = useState('');
  const [question, setQuestion] = useState<string>(questions[1]);
  const [error, setError] = useState('');
  const analysis = useMutation({
    mutationFn: () => postApi('/api/location/context', locationRequestSchema.parse({ locality, question, scene: scene ?? undefined }), answerSchema),
    onError: (cause) => setError(cause.message),
  });
  return <Screen>
    <Heading>A little local context.</Heading>
    <Body>Learn about your area and how the references around you relate to it.</Body>
    <Body>Location is used only while Context is open. There is no background tracking. You can enter an area name instead.</Body>
    <Button title={pending ? 'Finding your area…' : 'Use foreground location'} onPress={() => { void requestLocality(); }} disabled={pending || analysis.isPending} />
    <Notice text={notice} />
    <TextInput accessibilityLabel="Neighborhood or area name" placeholder="Neighborhood, city, or area" placeholderTextColor="#475D60"
      value={area} onChangeText={setArea} maxLength={500} style={styles.input} />
    <Button title="Use this area name" onPress={() => { setLocality({ neighborhood: area.trim() }); analysis.reset(); setError(''); }} disabled={!area.trim() || pending || analysis.isPending} secondary />
    {locality && <Card><Body>Current area: {Object.values(locality).filter(Boolean).join(', ')}</Body></Card>}
    <TextInput accessibilityLabel="Your locality question" value={question} onChangeText={setQuestion} multiline maxLength={2000} style={styles.input} />
    <VoiceInput onText={setQuestion} disabled={analysis.isPending} />
    {questions.map((text) => <Button key={text} title={text} onPress={() => setQuestion(text)} disabled={analysis.isPending} secondary />)}
    <Button title={analysis.isPending ? 'Exploring the area…' : 'Explain area context'}
      onPress={() => { setError(''); analysis.mutate(); }} disabled={!locality || !question.trim() || analysis.isPending} />
    {analysis.data && <Card><Body>{analysis.data.answer}</Body><ResponseControls text={analysis.data.answer} /></Card>}
    <Notice text={error} />
    {(image || scene) && <Button title="Return to scene" onPress={() => router.push('/scene')} secondary />}
    <Button title="Continue exploring" onPress={() => router.push('/conversation')} secondary />
  </Screen>;
}
