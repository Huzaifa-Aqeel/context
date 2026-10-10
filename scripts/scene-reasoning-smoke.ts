import { ChatClient } from '../lib/ai/client';
import { ChatSceneReasoning } from '../lib/ai/scene-decision';
import { chatConfig } from '../lib/server/config';
import type { Scene } from '../types/context';

const config = chatConfig('display');
const client = new ChatClient(config);
const reasoner = new ChatSceneReasoning({ model: client.model, completion: async (body) => {
  const response = await client.completion(body);
  if (process.argv.includes('--raw')) process.stdout.write(`RAW ${JSON.stringify(response.message.content).slice(0, 2500)}\n`);
  return response;
} }, config.model, config.briefThinking);
const scene: Scene = { id: 'synthetic-event', origin: 'image', createdAt: new Date().toISOString(),
  summary: 'Summer Sound is shown on an event flyer.', confidence: 'medium',
  culturalEvidence: { entities: [], relationships: [], themes: [], confidence: 0 },
  event: { visual: { title: 'Summer Sound', dateText: 'October 10, 2026', timeText: '8 PM', timezoneText: 'ET',
    venueName: 'Blue Note', locationText: 'New York', performers: ['Radiohead'], schedule: [] },
    ranking: [{ entityId: 'radiohead', name: 'Radiohead', exactInterest: true, contributingInterestIds: ['radiohead'] }],
    researchedFacts: [] } };
const available = { research: true, places: true, qloo: true, calendar: true, devicePosition: false, locationEnabled: false };
async function main() {
  if (process.argv.includes('--dining')) {
    scene.event = undefined;
    scene.dining = { profileSignature: 'a'.repeat(64), discoveredAt: new Date().toISOString(), anchor: { kind: 'device' },
      candidates: [
        { qlooId: 'cafe-a', name: 'Cafe A', radiusMeters: 2000, contributingInterestIds: ['radiohead'], cuisineTags: ['Italian'] },
        { qlooId: 'cafe-b', name: 'Cafe B', radiusMeters: 2000, contributingInterestIds: [], cuisineTags: ['Japanese'] },
      ] };
    const question = 'How do these two differ for my interests?';
    const plan = await reasoner.plan({ question, messages: [], scene,
      interests: [{ id: 'radiohead', name: 'Radiohead' }], available: { ...available, calendar: false } });
    process.stdout.write(`${question}\n${JSON.stringify(plan)}\n`);
    return;
  }
  if (process.argv.includes('--answer')) {
    scene.event!.researchedFacts.push({ kind: 'tickets', value: 'on sale', sourceUrl: 'https://summersound.example/tickets',
      retrievedAt: new Date().toISOString(), supportingQuote: 'Summer Sound tickets are on sale now.' });
    const checked = await reasoner.answer({ question: 'Are tickets on sale now?', messages: [], scene,
      interests: [{ id: 'radiohead', name: 'Radiohead' }], available,
      completed: { scope: 'event', next: 'event_research', researchKind: 'tickets' } });
    process.stdout.write(`${JSON.stringify(checked)}\n`);
    return;
  }
  const questions = process.argv.slice(2).filter((value) => value !== '--raw');
  for (const question of questions.length ? questions : ['Which performer connects to my interests?', 'Find dinner around the event']) {
    const plan = await reasoner.plan({ question, messages: [], scene,
      interests: [{ id: 'radiohead', name: 'Radiohead' }], available });
    process.stdout.write(`${question}\n${JSON.stringify(plan)}\n`);
  }
}
void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : 'Unknown failure'}\n`); process.exitCode = 1; });
