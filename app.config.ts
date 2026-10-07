import type { ExpoConfig } from 'expo/config';

const origin = process.env.EXPO_PUBLIC_API_URL?.trim();

const config: ExpoConfig = {
  name: 'Context',
  slug: 'context',
  version: '1.0.0',
  scheme: 'context',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  ios: { supportsTablet: true },
  android: { adaptiveIcon: { foregroundImage: './assets/android-icon-foreground.png', backgroundColor: '#F6F3EC' } },
  web: { bundler: 'metro', output: 'server', favicon: './assets/favicon.png' },
  plugins: [
    'expo-asset',
    ['expo-router', origin ? { origin } : {}],
    ['expo-camera', {
      cameraPermission: 'Allow Context to capture a scene you want to explore.',
      recordAudioAndroid: false,
    }],
    ['expo-image-picker', {
      photosPermission: 'Allow Context to analyze a photo you choose.',
      cameraPermission: false,
      microphonePermission: false,
    }],
    ['expo-location', {
      locationWhenInUsePermission: 'Allow Context to explain cultural context in your local area.',
      isIosBackgroundLocationEnabled: false,
      isAndroidBackgroundLocationEnabled: false,
      isAndroidForegroundServiceEnabled: false,
    }],
    ['expo-audio', {
      microphonePermission: 'Allow Context to record a question while you use the microphone.',
      enableBackgroundRecording: false,
      enableBackgroundPlayback: false,
    }],
  ],
};

export default config;
