export const modes = [
  { id: 'scene', title: 'Scene Context', description: 'Understand the cultural context around you.', question: 'What cultural context am I missing?' },
  { id: 'reference', title: 'Reference Explorer', description: 'Explore a poster, brand, artwork, or other reference.', question: 'Which reference matters most here?' },
  { id: 'connection', title: 'Connection Explorer', description: 'Discover how the references connect.', question: 'How do these references connect?' },
  { id: 'guided', title: 'Guided Exploration', description: 'Explore the scene one meaningful reference at a time.', question: 'Guide me through what is culturally important here.' },
  { id: 'location', title: 'Location Context', description: 'Understand your area and its cultural significance.', question: 'What is culturally significant about this neighborhood?' },
] as const;

export type UserMode = (typeof modes)[number]['id'];
