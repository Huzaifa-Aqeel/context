import { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Body, Button, Card, Heading, Notice, Screen, styles } from '@/components/ui';
import { ResponseControls } from '@/components/response-controls';
import { VoiceInput } from '@/components/voice-input';
import { postApi } from '@/lib/api/client';
import { clearSpokenOutput } from '@/lib/audio/playback';
import { tasteDraftSchema, tasteProfileSchema } from '@/schemas/taste';
import { assertCurrentSession, useContextStore } from '@/stores/context';
const welcome = "Tell Context a few things you're into so it can recognize cultural references that matter to you. Tap Start speaking to share interests, or type their names. This is optional. Your microphone starts only when you choose.";
export default function TasteScreen() {
  const { profile, setProfile, clearTaste, setPersonalization } = useContextStore();
  const [text, setText] = useState(profile?.entities.map((entity) => entity.name).join(', ') ?? '');
  const [excluded, setExcluded] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const resolve = useMutation({
    mutationFn: async (input: string) => {
      const generation = useContextStore.getState().generation;
      const result = await postApi('/api/taste/resolve', { text: input }, tasteDraftSchema);
      assertCurrentSession(generation); return result;
    },
    onSuccess: () => { setExcluded([]); setNotice('Review your matched interests. Unresolved interests can be left out.'); },
    onError: (error) => setNotice(error.message),
  });
  const includedIds = resolve.data?.candidates.flatMap((candidate) => candidate.status === 'matched' && !excluded.includes(candidate.label) ? [candidate.entity.id] : []) ?? [];
  const confirm = useMutation({
    mutationFn: async () => {
      const generation = useContextStore.getState().generation;
      const result = await postApi('/api/taste/confirm', { draft: resolve.data, includedIds }, tasteProfileSchema);
      assertCurrentSession(generation); return result;
    },
    onSuccess: (result) => { clearSpokenOutput(); setProfile(result); resolve.reset(); confirm.reset(); router.replace('/'); },
    onError: (error) => setNotice(error.message),
  });
  const busy = resolve.isPending || confirm.isPending;
  const toggle = (label: string) => setExcluded((previous) => previous.includes(label) ? previous.filter((item) => item !== label) : [...previous, label]);
  return <Screen>
    <Heading>What are you into?</Heading>
    <Body>{welcome}</Body>
    <ResponseControls text={welcome} />
    <Body>Try a few films, musicians, books, games, brands, or places. We suggest 5–10 interests, but one is enough to start.</Body>
    <Body>Your spoken interests go to Groq for transcription and extraction. Qloo resolves the names. Nothing becomes a profile interest until you review and confirm it.</Body>
    <VoiceInput startLabel="Start speaking" disabled={busy} onText={(transcript) => { setText(transcript); setNotice(''); resolve.mutate(transcript); }} />
    <TextInput accessibilityLabel="Your cultural interests" placeholder="For example, Interstellar, Radiohead, Nike" placeholderTextColor="#475D60" value={text} onChangeText={setText} editable={!busy} multiline maxLength={2000} style={styles.input} />
    <Button title={resolve.isPending ? 'Finding Qloo matches…' : 'Review interest matches'} onPress={() => { setNotice(''); resolve.mutate(text); }} disabled={busy || !text.trim()} />
    {resolve.data?.candidates.map((candidate) => <Card key={candidate.label}>
      <Body>{candidate.label}</Body>
      <Text style={styles.small}>{candidate.status === 'matched' ? 'Matched' : candidate.status === 'clarify' ? 'Needs clarification' : 'No match'}{excluded.includes(candidate.label) ? ' · Left out' : ''}</Text>
      {candidate.status === 'matched' && <Body>Qloo: {candidate.entity.name} · {candidate.entity.type.replace('urn:entity:', '')}</Body>}
      {candidate.status === 'clarify' && <Body>Possible references: {candidate.candidates.map((item) => item.name).join(', ')}. Edit the names above to clarify, or leave this out.</Body>}
      {candidate.status === 'no_match' && <Body>We could not resolve this interest. You can leave it out and continue.</Body>}
      <Button title={excluded.includes(candidate.label) ? `Keep reviewing ${candidate.label}` : `Leave out ${candidate.label}`} onPress={() => toggle(candidate.label)} disabled={busy} secondary />
    </Card>)}
    {resolve.data && <>
      <Body>{includedIds.length} matched interests selected. All unresolved interests are automatically left out when you continue.</Body>
      <Button title={confirm.isPending ? 'Saving your interests…' : `Use ${includedIds.length} interests and personalize`} onPress={() => confirm.mutate()} disabled={busy || !includedIds.length} />
      <Notice text={!resolve.data.candidates.length ? 'No named interests were found. Try naming one, or continue without a profile.' : undefined} />
    </>}
    <Notice text={notice} />
    <Button title="Continue without personalization" onPress={() => { clearSpokenOutput(); setPersonalization(false); resolve.reset(); confirm.reset(); router.replace('/'); }} disabled={busy} secondary />
    {profile && <Button title="Delete my taste profile" onPress={() => { clearSpokenOutput(); clearTaste(); setText(''); resolve.reset(); setNotice('Your profile was deleted. You can still explore any environment.'); }} disabled={busy} secondary />}
  </Screen>;
}
