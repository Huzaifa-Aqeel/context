import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { stopSpokenOutput } from '@/lib/audio/playback';
import { Button, Notice } from '@/components/ui';
import { postApi } from '@/lib/api/client';
import { discardTemporaryFile } from '@/lib/images';
import { useContextStore } from '@/stores/context';
import { transcriptionSchema } from '@/schemas/context';

export function VoiceInput({ onText, disabled = false, startLabel = 'Ask by voice' }: { onText: (text: string) => void; disabled?: boolean; startLabel?: string }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const operation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => {
    mounted.current = true;
    const discard = async () => {
      operation.current++;
      clearTimer();
      if (recorder.isRecording) await recorder.stop();
      discardTemporaryFile(recorder.uri);
      await setAudioModeAsync({ allowsRecording: false, shouldPlayInBackground: false });
    };
    const subscription = AppState.addEventListener('change', (status) => {
      if (status !== 'active') void discard().catch(() => {});
    });
    return () => { mounted.current = false; subscription.remove(); void discard().catch(() => {}); };
  }, [recorder]);

  async function finish() {
    clearTimer();
    const currentOperation = ++operation.current;
    const generation = useContextStore.getState().generation;
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
      const transcript = await postApi('/api/audio/transcribe', form, transcriptionSchema);
      if (mounted.current && currentOperation === operation.current && AppState.currentState === 'active' && generation === useContextStore.getState().generation) onText(transcript.text);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Voice input failed. You can type your question.'); }
    finally {
      discardTemporaryFile(recorder.uri);
      await setAudioModeAsync({ allowsRecording: false, shouldPlayInBackground: false }).catch(() => {});
      if (mounted.current) setPending(false);
    }
  }

  async function start() {
    if (AppState.currentState !== 'active') return;
    const currentOperation = ++operation.current;
    setError('');
    setPending(true);
    try {
      stopSpokenOutput();
      const permission = await requestRecordingPermissionsAsync();
      if (!mounted.current || currentOperation !== operation.current || AppState.currentState !== 'active') return;
      if (!permission.granted) throw new Error('Microphone permission was not granted. You can type your question.');
      discardTemporaryFile(recorder.uri);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false });
      await recorder.prepareToRecordAsync();
      if (!mounted.current || currentOperation !== operation.current || AppState.currentState !== 'active') {
        await setAudioModeAsync({ allowsRecording: false, shouldPlayInBackground: false }); return;
      }
      recorder.record();
      timer.current = setTimeout(() => { void finish(); }, 60_000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The microphone is unavailable.');
      await setAudioModeAsync({ allowsRecording: false, shouldPlayInBackground: false }).catch(() => {});
    }
    finally { setPending(false); }
  }

  return <>
    <Button title={pending ? 'Processing voice input…' : state.isRecording ? 'Stop recording and transcribe' : startLabel}
      onPress={() => { void (state.isRecording ? finish() : start()); }} disabled={pending || (disabled && !state.isRecording)}
      hint="Records up to one minute. Your recording is sent for transcription when you stop." secondary />
    <Notice text={state.isRecording ? 'Microphone is recording. Tap stop when you finish your question.' : error} />
  </>;
}
