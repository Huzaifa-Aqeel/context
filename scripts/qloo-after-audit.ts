import { QlooClient } from '../lib/qloo/client';
import { qlooConfig } from '../lib/server/config';

const cases = [
  { label: 'Interstellar', category: 'movie', carrier: 'poster' },
  { label: 'Radiohead', category: 'artist', carrier: 'album_cover' },
  { label: 'Apple', category: 'brand', carrier: 'product' },
  { label: 'Blue Note Jazz Club', category: 'place', carrier: 'venue_sign' },
] as const;

async function main() {
  const results = [];
  for (const item of cases) {
    const paths: string[] = [];
    const client = new QlooClient(qlooConfig(), async (input, init) => {
      paths.push(new URL(String(input)).pathname);
      return fetch(input, init);
    });
    const resolved = await client.resolveEntities([{ label: item.label, category: item.category, carrier: item.carrier, confidence: .96, culturallyRelevant: true }], item.category === 'place' ? { city: 'New York' } : undefined);
    const result = resolved[0];
    const facts = result.qlooId ? await client.analyzeConnections([result], { includeAffinity: false }) : undefined;
    results.push({ visual: item.label, qloo: result.qlooName ?? null, grounded: Boolean(result.qlooId), candidates: result.candidates, facts: facts?.facts?.map((fact) => ({ name: fact.name, category: fact.category, description: fact.description?.slice(0, 160) })) ?? [], calls: paths });
  }
  process.stdout.write(JSON.stringify(results, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
