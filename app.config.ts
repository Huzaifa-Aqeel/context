import type { ExpoConfig } from 'expo/config';

const origin = process.env.EXPO_PUBLIC_API_URL?.trim();

const config: ExpoConfig = {
  name: 'Context',
  slug: 'context',
  owner: 'quepass',
  version: '1.0.0',
  scheme: 'context',
  extra: { eas: { projectId: '9e9c1077-1980-4cbf-93a3-83f88e04e203' } },
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  ios: { supportsTablet: true },
  android: {
    package: 'com.huzaifaaqeel.context',
    adaptiveIcon: { foregroundImage: './assets/android-icon-foreground.png', backgroundColor: '#F6F3EC' },
  },
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
    ['expo-calendar', {
      calendarPermission: 'Allow Context to check for duplicates and add an event to your calendar when you ask.',
      writeOnlyAccess: false,
    }],
  ],
};

export default config;
