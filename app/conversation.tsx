import { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Body, Button, Card, Heading, Notice, Screen, styles } from '@/components/ui';
import { ResponseControls } from '@/components/response-controls';
import { VoiceInput } from '@/components/voice-input';
import { postApi } from '@/lib/api/client';
import { modes } from '@/lib/modes';
import { answerSchema, askRequestSchema } from '@/schemas/context';
import { useContextStore } from '@/stores/context';

export default function ConversationScreen() {
  const { scene, locality, mode, messages, addMessage, updateScene } = useContextStore();
  const [question, setQuestion] = useState('');
  const [notice, setNotice] = useState('');
  const answer = useMutation({
    mutationFn: (text: string) => postApi('/api/scene/ask', askRequestSchema.parse({
      question: text, scene: scene ?? undefined, locality: locality ?? undefined, messages, mode,
    }), answerSchema),
    onSuccess: (result, text) => {
      if (result.scene) updateScene(result.scene);
      addMessage({ role: 'user', content: text });
      addMessage({ role: 'assistant', content: result.answer });
      setQuestion(''); setNotice(''); answer.reset();
    },
    onError: (error) => { setNotice(error.message); answer.reset(); },
  });
  const latestResponse = [...messages].reverse().find((message) => message.role === 'assistant')?.content;
  const hasContext = Boolean(scene || locality);
  return <Screen>
    <Heading>Follow your curiosity.</Heading>
    <Body>Explore a reference, its connections, or how it relates to your area. Your current scene stays available for follow-ups.</Body>
    {scene && <Card><Body>{scene.summary}</Body></Card>}
    {messages.map((message, index) => <Card key={index}>
      <Text style={[styles.small, { fontWeight: '700' }]}>{message.role === 'user' ? 'You' : 'Context'}</Text>
      <Body>{message.content}</Body>
    </Card>)}
    {latestResponse && <ResponseControls text={latestResponse} />}
    {!hasContext && <>
      <Notice text="Capture a scene or add an area name before asking a question." />
      <Button title="Capture a scene" onPress={() => router.push('/camera')} />
      <Button title="Add area context" onPress={() => router.push('/location')} secondary />
    </>}
    <TextInput accessibilityLabel="Your follow-up question" accessibilityHint="Ask about a reference, a connection, or the local area."
      placeholder={modes.find((item) => item.id === mode)?.question} placeholderTextColor="#475D60"
      value={question} onChangeText={setQuestion} multiline maxLength={2000} editable={!answer.isPending}
      style={styles.input} />
    <VoiceInput onText={setQuestion} disabled={answer.isPending || !hasContext} />
    <Button title={answer.isPending ? 'Exploring your question…' : 'Ask Context'} onPress={() => { setNotice(''); answer.mutate(question.trim()); }}
      disabled={!question.trim() || answer.isPending || !hasContext} />
    <Notice text={notice} />
  </Screen>;
}
