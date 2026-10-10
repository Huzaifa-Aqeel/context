import { useEffect, useId, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useIsFocused } from 'expo-router';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { clearSpokenOutput, getSpeechState, speakResponse } from '@/lib/audio/playback';
import { postApi } from '@/lib/api/client';
import { discardTemporaryFile } from '@/lib/images';
import { ResponseSilence, VoiceConversation, type ConversationState } from '@/lib/taste/conversation';
import { transcriptionSchema } from '@/schemas/context';
import { assertCurrentSession, useContextStore } from '@/stores/context';

type SpokenConversationOptions = {
  prompt?: string | (() => string);
  skipPromptSpeech?: () => boolean;
  skipResultSpeech?: () => boolean;
  readyMessage: string;
  processingMessage: string | (() => string);
  filename: string;
  saveTranscript: (text: string, signal: AbortSignal, commit: (save: () => void) => void) => Promise<string>;
};

export function useSpokenConversation(options: SpokenConversationOptions) {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recording = useAudioRecorderState(recorder, 100);
  const focused = useIsFocused();
  const owner = useId();
  const [state, setState] = useState<ConversationState>({ phase: 'idle', orbVisible: false, busy: false, message: '' });
  const otherRecording = useContextStore((context) => Boolean(context.recordingOwner && context.recordingOwner !== owner));
  const mounted = useRef(false);
  const focus = useRef(focused);
  const generation = useRef(0);
  const permissionUI = useRef(false);
  const ownSave = useRef(false);
  const pendingPermission = useRef<Promise<unknown> | null>(null);
  const pendingRecord = useRef<Promise<void> | null>(null);
  const pendingStop = useRef<Promise<void> | null>(null);
  const silence = useRef(new ResponseSilence());
  const metering = useRef(recording.metering);
  useEffect(() => { focus.current = focused; }, [focused]);
  useEffect(() => { metering.current = recording.metering; }, [recording.metering]);
  const [conversation] = useState(() => {
    const check = (signal: AbortSignal) => {
      if (signal.aborted || !mounted.current || !focus.current || AppState.currentState !== 'active') throw new Error('Conversation ended.');
      assertCurrentSession(generation.current);
    };
    const release = async () => {
      if (useContextStore.getState().recordingOwner !== owner) return;
      try { await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false }); }
      finally { useContextStore.getState().endRecording(owner); }
    };
    const stop = async () => {
      if (pendingStop.current) return pendingStop.current;
      const work = (async () => { try { if (recorder.isRecording) await recorder.stop(); } finally { await release(); } })();
      pendingStop.current = work;
      try { await work; } finally { if (pendingStop.current === work) pendingStop.current = null; }
    };
    return new VoiceConversation<string>({
      prompt: options.prompt,
      skipPromptSpeech: options.skipPromptSpeech,
      skipResultSpeech: options.skipResultSpeech,
      readyMessage: options.readyMessage,
      processingMessage: options.processingMessage,
      isActive: () => mounted.current && focus.current && AppState.currentState === 'active',
      prepare: async (signal) => {
        clearSpokenOutput(); generation.current = useContextStore.getState().generation;
        permissionUI.current = true;
        const work = requestRecordingPermissionsAsync(); pendingPermission.current = work;
        let permission;
        try { permission = await work; }
        finally { if (pendingPermission.current === work) pendingPermission.current = null; permissionUI.current = false; }
        check(signal);
        if (!permission.granted) throw new Error('Microphone access is off. You can enable it in your device settings and start again.');
      },
      speak: async (text, signal) => {
        const played = await speakResponse(text, signal);
        if (!played && !signal.aborted) {
          const speech = getSpeechState();
          if (speech.status === 'error' && speech.error) throw new Error(speech.error);
        }
        return played;
      },
      record: async (signal) => {
        check(signal);
        if (!useContextStore.getState().beginRecording(owner)) throw new Error('Another conversation is using the microphone. Please try again.');
        const work = (async () => {
          discardTemporaryFile(recorder.uri);
          await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false });
          check(signal);
          await recorder.prepareToRecordAsync(); check(signal);
          recorder.record(); silence.current.reset(Date.now());
        })();
        pendingRecord.current = work;
        try { await work; } finally { if (pendingRecord.current === work) pendingRecord.current = null; }
      },
      stopRecording: async (signal) => {
        await stop(); check(signal);
        if (metering.current !== undefined && !silence.current.hasSpeech()) throw new Error('I did not hear a response. Please start again.');
        if (!recorder.uri) throw new Error('I did not hear a response. Please start again.');
        return recorder.uri;
      },
      discardRecording: async () => {
        clearSpokenOutput();
        try {
          await pendingPermission.current?.catch(() => {});
          await pendingRecord.current?.catch(() => {});
          await stop();
        } finally { discardTemporaryFile(recorder.uri); }
      },
      save: async (uri, signal) => {
        check(signal);
        const form = new FormData();
        if (Platform.OS === 'web') form.append('audio', await (await fetch(uri, { signal })).blob(), `${options.filename}.webm`);
        else form.append('audio', { uri, name: `${options.filename}.m4a`, type: 'audio/mp4' } as unknown as Blob);
        check(signal);
        const transcript = await postApi('/api/audio/transcribe', form, transcriptionSchema, signal); check(signal);
        return options.saveTranscript(transcript.text, signal, (save) => {
          check(signal);
          ownSave.current = true;
          try { save(); generation.current = useContextStore.getState().generation; }
          finally { ownSave.current = false; }
        });
      },
      onState: (next) => { if (mounted.current) setState(next); },
    });
  });
  useEffect(() => {
    mounted.current = true;
    const app = AppState.addEventListener('change', (status) => { if (status !== 'active' && !(status === 'inactive' && permissionUI.current)) void conversation.cancel(); });
    const session = useContextStore.subscribe((context, previous) => { if (context.generation !== previous.generation && !ownSave.current) void conversation.cancel(); });
    return () => { mounted.current = false; app.remove(); session(); void conversation.cancel(); };
  }, [conversation]);
  useEffect(() => { if (!focused) void conversation.cancel(); }, [conversation, focused]);
  useEffect(() => {
    if (state.phase !== 'listening') return;
    const timer = setInterval(() => {
      const result = silence.current.sample(Date.now(), metering.current);
      if (result === 'finish') void conversation.finish();
      if (result === 'empty') void conversation.cancel('I did not hear a response. Please start again.');
    }, 100);
    return () => clearInterval(timer);
  }, [conversation, state.phase]);
  return { ...state, level: recording.metering, otherRecording, start: () => { void conversation.start(); }, end: () => { void conversation.end(); } };
}
