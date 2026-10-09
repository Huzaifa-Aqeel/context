import { router } from 'expo-router';
import { Body, Button, Heading, Screen } from './ui';

export function ProfileRequired() {
  return <Screen>
    <Heading>Set up My Interests</Heading>
    <Body>Share at least one interest that Context can match before you capture a scene or ask a question.</Body>
    <Button title="Open My Interests" onPress={() => router.push('/personalization/taste')}
      hint="Opens voice setup. Recording starts only after you tap the orb." />
  </Screen>;
}
