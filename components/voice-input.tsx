import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import * as Speech from 'expo-speech';
import { Button, Notice } from '@/components/ui';
import { postApi } from '@/lib/api/client';
import { discardTemporaryFile } from '@/lib/images';
import { transcriptionSchema } from '@/schemas/context';

export function VoiceInput({ onText, disabled = false }: { onText: (text: string) => void; disabled?: boolean }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => {
    const discard = async () => {
      clearTimer();
      if (recorder.isRecording) await recorder.stop();
      discardTemporaryFile(recorder.uri);
      await setAudioModeAsync({ allowsRecording: false, shouldPlayInBackground: false });
    };
    const subscription = AppState.addEventListener('change', (status) => {
      if (status !== 'active') void discard().catch(() => {});
    });
    return () => { subscription.remove(); void discard().catch(() => {}); };
  }, [recorder]);

  async function finish() {
    clearTimer();
    setPending(true);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('No recording was captured. Please try again.');
      const form = new FormData();
      if (Platform.OS === 'web') {
        form.append('audio', await (await fetch(uri)).blob(), 'question.webm');
      } else {
        form.append('audio', { uri, name: 'question.m4a', type: 'audio/mp4' } as unknown as Blob);
      }
      onText((await postApi('/api/audio/transcribe', form, transcriptionSchema)).text);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Voice input failed. You can type your question.'); }
    finally {
      discardTemporaryFile(recorder.uri);
      await setAudioModeAsync({ allowsRecording: false, shouldPlayInBackground: false });
      setPending(false);
    }
  }

  async function start() {
    setError('');
    setPending(true);
    try {
      await Speech.stop();
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error('Microphone permission was not granted. You can type your question.');
      discardTemporaryFile(recorder.uri);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false });
      await recorder.prepareToRecordAsync();
      recorder.record();
      timer.current = setTimeout(() => { void finish(); }, 60_000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The microphone is unavailable.'); }
    finally { setPending(false); }
  }

  return <>
    <Button title={pending ? 'Processing voice input…' : state.isRecording ? 'Stop recording and transcribe' : 'Ask by voice'}
      onPress={() => { void (state.isRecording ? finish() : start()); }} disabled={pending || (disabled && !state.isRecording)}
      hint="Records up to one minute. Your recording is sent for transcription when you stop." secondary />
    <Notice text={state.isRecording ? 'Microphone is recording. Tap stop when you finish your question.' : error} />
  </>;
}
