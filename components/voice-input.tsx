import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { useIsFocused } from 'expo-router';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { getSpeechState, speakResponse, stopSpokenOutput, subscribeSpeech } from '@/lib/audio/playback';
import { waitForAppActive } from '@/lib/audio/foreground';
import { recordingFormData } from '@/lib/audio/upload';
import { colors, Notice } from '@/components/ui';
import { postApi } from '@/lib/api/client';
import { discardTemporaryFile } from '@/lib/images';
import { useContextStore } from '@/stores/context';
import { transcriptionSchema } from '@/schemas/context';
import { VoiceOrb } from './voice-orb';

export function VoiceInput({ onText, disabled = false, replayText }: { onText: (text: string) => void; disabled?: boolean; replayText?: string }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [pending, setPending] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const owner = useId();
  const focused = useIsFocused();
  const otherRecording = useContextStore((context) => Boolean(context.recordingOwner && context.recordingOwner !== owner));
  const speech = useSyncExternalStore(subscribeSpeech, getSpeechState, getSpeechState);
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
        if (mounted.current && cancelled === operation.current) { setPending(false); setListening(false); }
      }
    };
    const subscription = AppState.addEventListener('change', (status) => {
      if (status !== 'active' && !permissionRequest.current) void discard().catch(() => {});
    });
    const session = useContextStore.subscribe((context, previous) => { if (context.generation !== previous.generation) void discard().catch(() => {}); });
    if (!focused) void discard().catch(() => {});
    return () => { mounted.current = false; subscription.remove(); session(); void discard().catch(() => {}); };
  }, [focused, recorder, release]);

  async function finish() {
    clearTimer();
    setListening(false);
    const currentOperation = ++operation.current;
    const generation = useContextStore.getState().generation;
    setPending(true);
    try {
      await recorder.stop();
      await release();
      const uri = recorder.uri;
      if (!uri) throw new Error('No recording was captured. Please try again.');
      const form = await recordingFormData(uri, 'question');
      const transcript = await postApi('/api/audio/transcribe', form, transcriptionSchema);
      if (mounted.current && focused && currentOperation === operation.current && AppState.currentState === 'active' && generation === useContextStore.getState().generation) onText(transcript.text);
    } catch (cause) { if (mounted.current && currentOperation === operation.current) setError(cause instanceof Error ? cause.message : 'Voice input failed. Please try again.'); }
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
      let permission;
      try {
        permission = await requestRecordingPermissionsAsync();
        await waitForAppActive();
      } finally { permissionRequest.current = false; }
      if (!mounted.current || currentOperation !== operation.current || AppState.currentState !== 'active') return;
      if (!permission.granted) throw new Error('Microphone access is off. You can enable it in your device settings and try again.');
      if (!useContextStore.getState().beginRecording(owner)) throw new Error('Another microphone interaction is active. Stop it before starting this one.');
      discardTemporaryFile(recorder.uri);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false });
      await recorder.prepareToRecordAsync();
      if (!mounted.current || currentOperation !== operation.current || AppState.currentState !== 'active') {
        await release(); return;
      }
      recorder.record();
      setListening(true);
      timer.current = setTimeout(() => { void finish(); }, 60_000);
    } catch (cause) {
      await release();
      if (mounted.current && currentOperation === operation.current) setError(cause instanceof Error ? cause.message : 'The microphone is unavailable.');
    }
    finally { if (mounted.current && currentOperation === operation.current) setPending(false); }
  }

  const speaking = speech.status === 'loading' || speech.status === 'playing';
  const label = pending || disabled ? 'Processing' : listening ? 'Stop recording' : speaking ? 'Context is speaking' : 'Ask Context';
  const unavailable = !focused || otherRecording || pending || (disabled && !listening);
  const press = () => { if (speaking) stopSpokenOutput(); else void (listening ? finish() : start()); };
  const replay = () => { if (replayText && !unavailable && !listening && !speaking) void speakResponse(replayText); };
  return <>
    <View style={orbStyles.container}>
      <Text style={orbStyles.label} accessibilityElementsHidden importantForAccessibility="no">{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={label}
        accessibilityHint={listening ? 'Stops recording and asks your question.' : speaking ? 'Stops Context speaking.' : replayText ? 'Starts listening. Tap again to finish. Use the Replay answer action to hear the last answer again.' : 'Starts listening. Tap again to finish your question.'}
        accessibilityState={{ disabled: unavailable, busy: pending || disabled }} disabled={unavailable} onPress={press}
        accessibilityActions={replayText ? [{ name: 'replayAnswer', label: 'Replay answer' }] : undefined}
        onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'replayAnswer') replay(); }}
        onLongPress={replayText ? replay : undefined}
        style={({ pressed }) => [orbStyles.control, pressed && orbStyles.pressed, unavailable && orbStyles.disabled]}>
        <VoiceOrb phase={pending || disabled ? 'processing' : listening ? 'listening' : speaking ? 'speaking' : 'idle'} level={state.metering} />
      </Pressable>
    </View>
    <Notice text={listening ? 'Listening. Tap the orb again to finish.' : error} speech={false} />
  </>;
}

const orbStyles = StyleSheet.create({
  container: { alignItems: 'center', gap: 12 },
  control: { minHeight: 220, minWidth: 220, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  label: { color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: '700', alignSelf: 'stretch' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
});
