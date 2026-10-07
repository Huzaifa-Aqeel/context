export const speechVoices = ['autumn', 'diana', 'hannah', 'austin', 'daniel', 'troy'] as const;
export const speechStyles = ['natural', 'warm', 'cheerful', 'whisper', 'dramatic', 'slow'] as const;
export type SpeechVoice = typeof speechVoices[number];
export type SpeechStyle = typeof speechStyles[number];
export type SpeechPreferences = { voice: SpeechVoice; style: SpeechStyle };
export const defaultSpeechPreferences: SpeechPreferences = { voice: 'troy', style: 'warm' };
export const directionPrefix = (style: SpeechStyle) => style === 'natural' ? '' : `[${style === 'slow' ? 'slow paced' : style}] `;
export const speechStyleLabels: Record<SpeechStyle, string> = {
  natural: 'Natural conversation', warm: 'Warm', cheerful: 'Cheerful', whisper: 'Whisper', dramatic: 'Dramatic', slow: 'Slow paced',
};
