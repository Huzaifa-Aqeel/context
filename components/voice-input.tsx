import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useIsFocused } from 'expo-router';
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
  const owner = useId();
  const focused = useIsFocused();
  const otherRecording = useContextStore((context) => Boolean(context.recordingOwner && context.recordingOwner !== owner));
  const operation = useRef(0);
  const permissionRequest = useRef(false);
  const releasePromise = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const release = useCallback(async () => {
    if (releasePromise.current) return releasePromise.current;
    if (useContextStore.getState().recordingOwner !== owner) return;
    const work = setAudioModeAsync({ allowsRecording: false, shouldPlayInBackground: false }).catch(() => {}).finally(() => useContextStore.getState().endRecording(owner));
    releasePromise.current = work;
    await work;
    if (releasePromise.current === work) releasePromise.current = null;
  }, [owner]);
  useEffect(() => {
    mounted.current = true;
    const discard = async () => {
      const cancelled = ++operation.current;
      clearTimer();
      try { if (recorder.isRecording) await recorder.stop(); }
      finally {
        discardTemporaryFile(recorder.uri); await release();
        if (mounted.current && cancelled === operation.current) setPending(false);
      }
    };
    const subscription = AppState.addEventListener('change', (status) => {
      if (status !== 'active' && !(status === 'inactive' && permissionRequest.current)) void discard().catch(() => {});
    });
    const session = useContextStore.subscribe((context, previous) => { if (context.generation !== previous.generation) void discard().catch(() => {}); });
    if (!focused) void discard().catch(() => {});
    return () => { mounted.current = false; subscription.remove(); session(); void discard().catch(() => {}); };
  }, [focused, recorder, release]);

  async function finish() {
    clearTimer();
    const currentOperation = ++operation.current;
    const generation = useContextStore.getState().generation;
    setPending(true);
    try {
      await recorder.stop();
      await release();
      const uri = recorder.uri;
      if (!uri) throw new Error('No recording was captured. Please try again.');
      const form = new FormData();
      if (Platform.OS === 'web') {
        form.append('audio', await (await fetch(uri)).blob(), 'question.webm');
      } else {
        form.append('audio', { uri, name: 'question.m4a', type: 'audio/mp4' } as unknown as Blob);
      }
      const transcript = await postApi('/api/audio/transcribe', form, transcriptionSchema);
      if (mounted.current && focused && currentOperation === operation.current && AppState.currentState === 'active' && generation === useContextStore.getState().generation) onText(transcript.text);
    } catch (cause) { if (mounted.current && currentOperation === operation.current) setError(cause instanceof Error ? cause.message : 'Voice input failed. You can type your question.'); }
    finally {
      await release();
      discardTemporaryFile(recorder.uri);
      if (mounted.current && currentOperation === operation.current) setPending(false);
    }
  }

  async function start() {
    if (!focused || AppState.currentState !== 'active') return;
    const currentOperation = ++operation.current;
    setError('');
    setPending(true);
    try {
      stopSpokenOutput();
      permissionRequest.current = true;
      const permission = await requestRecordingPermissionsAsync().finally(() => { permissionRequest.current = false; });
      if (!mounted.current || currentOperation !== operation.current || AppState.currentState !== 'active') return;
      if (!permission.granted) throw new Error('Microphone permission was not granted. You can type your question.');
      if (!useContextStore.getState().beginRecording(owner)) throw new Error('Another microphone interaction is active. Stop it before starting this one.');
      discardTemporaryFile(recorder.uri);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false });
      await recorder.prepareToRecordAsync();
      if (!mounted.current || currentOperation !== operation.current || AppState.currentState !== 'active') {
        await release(); return;
      }
      recorder.record();
      timer.current = setTimeout(() => { void finish(); }, 60_000);
    } catch (cause) {
      await release();
      if (mounted.current && currentOperation === operation.current) setError(cause instanceof Error ? cause.message : 'The microphone is unavailable.');
    }
    finally { if (mounted.current && currentOperation === operation.current) setPending(false); }
  }

  return <>
    <Button title={pending ? 'Processing voice input…' : state.isRecording ? 'Stop recording and transcribe' : startLabel}
      onPress={() => { void (state.isRecording ? finish() : start()); }} disabled={!focused || otherRecording || pending || (disabled && !state.isRecording)}
      hint="Records up to one minute. Your recording is sent for transcription when you stop." secondary />
    <Notice text={state.isRecording ? 'Microphone is recording. Tap stop when you finish your question.' : error} speech={!state.isRecording && !pending} />
  </>;
}
