import { useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { useExploration } from '@/hooks/use-exploration';
import { TasteEvidence } from '@/components/taste-evidence';
import { TasteControls } from '@/components/taste-controls';
import { Body, Button, Card, Heading, Notice, Screen, styles, TextInput } from '@/components/ui';
import { ResponseControls } from '@/components/response-controls';
import { VoiceInput } from '@/components/voice-input';
import { modes } from '@/lib/modes';
import { conversationForRequest, useContextStore } from '@/stores/context';

export default function ConversationScreen() {
  const { scene, locality, mode, messages } = useContextStore();
  const { question, setQuestion } = useContextStore();
  const [notice, setNotice] = useState('');
  const answer = useExploration();
  const latestResponse = [...conversationForRequest()].reverse().find((message) => message.role === 'assistant')?.content;
  const hasContext = Boolean(scene || locality);
  return <Screen>
    <Heading>Follow your curiosity.</Heading>
    <Body>Explore a reference, its connections, or how it relates to your area. Your current scene stays available for follow-ups.</Body>
    <TasteControls onExplore={(text) => answer.mutate(text, { onError: (error) => setNotice(error.message), onSuccess: (result) => setNotice(result.warnings?.join(' ') ?? '') })} disabled={answer.isPending || !Boolean(scene || locality)} />
    <TasteEvidence />
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
    <Button title={answer.isPending ? 'Exploring your question…' : 'Ask Context'} onPress={() => { setNotice(''); answer.mutate(question.trim(), { onError: (error) => setNotice(error.message), onSuccess: (result) => setNotice(result.warnings?.join(' ') ?? '') }); }}
      disabled={!question.trim() || answer.isPending || !hasContext} />
    <Notice text={notice} />
  </Screen>;
}
