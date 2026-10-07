import type { TasteEntity, TasteContext } from '@/types/taste';
import { z } from 'zod';
import { ApiError } from '@/lib/api/server';
import type { QlooConfig } from '@/lib/server/config';
import { ProviderHttp, providerData, type ProviderFetch } from '@/lib/server/http';
import type { QlooService } from './service';
import type { CulturalEvidence, Locality, LocationContext, ResolvedEntity, VisionEntity } from '@/types/context';

const tagSchema = z.object({ id: z.string().optional(), tag_id: z.string().optional(), name: z.string(), type: z.string().optional() });
const entitySchema = z.object({
  entity_id: z.string(), name: z.string(), types: z.array(z.string()).optional(), subtype: z.string().optional(), type: z.string().optional(),
  tags: z.array(tagSchema).optional(),
  properties: z.object({
    short_description: z.string().nullable().optional(), description: z.string().nullable().optional(),
    akas: z.array(z.object({ value: z.string() })).optional(),
  }).optional(),
  query: z.object({ affinity: z.number().optional() }).optional(),
});
const lookupSchema = z.object({ results: z.union([z.array(entitySchema), z.object({ entities: z.array(entitySchema) })]) });
const insightsSchema = z.object({
  success: z.boolean().optional(),
  results: z.object({ entities: z.array(entitySchema).optional(), tags: z.array(tagSchema).optional() }),
  query: z.object({ localities: z.object({ filter: z.array(z.object({ name: z.string() })).optional(), signal: z.array(z.object({ name: z.string() })).optional() }).optional() }).optional(),
});
type QlooEntity = z.infer<typeof entitySchema>;
type Fact = NonNullable<CulturalEvidence['facts']>[number];

const categoryTypes: Record<string, string> = {
  brand: 'urn:entity:brand', fashion: 'urn:entity:brand', fashion_label: 'urn:entity:brand',
  film: 'urn:entity:movie', movie: 'urn:entity:movie', tv_show: 'urn:entity:tv_show',
  author: 'urn:entity:author', writer: 'urn:entity:author', artist: 'urn:entity:artist', music: 'urn:entity:artist',
  book: 'urn:entity:book', game: 'urn:entity:videogame', video_game: 'urn:entity:videogame',
  restaurant: 'urn:entity:place', venue: 'urn:entity:place', landmark: 'urn:entity:place', museum: 'urn:entity:place',
};
const normalized = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const typeOf = (entity: QlooEntity) => entity.types?.find((type) => type.startsWith('urn:entity:') && type !== 'urn:entity') ?? entity.subtype ?? entity.type ?? 'urn:entity:unknown';
const cleanText = (text: string) => text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const cultureTags = (tags: z.infer<typeof tagSchema>[] = []) => [...new Set(tags
  .filter((tag) => /^urn:tag:(genre|keyword):/.test(tag.tag_id ?? tag.id ?? tag.type ?? ''))
  .map((tag) => tag.name.trim()).filter(Boolean))].slice(0, 12);
const factOf = (entity: QlooEntity): Fact => ({
  entityId: entity.entity_id, name: entity.name.slice(0, 500), category: typeOf(entity),
  description: cleanText(entity.properties?.short_description || entity.properties?.description || '').slice(0, 1200) || undefined,
  tags: cultureTags(entity.tags), source: 'qloo',
});
const emptyEvidence = (): CulturalEvidence => ({ entities: [], relationships: [], themes: [], confidence: 0, facts: [] });
const localityName = (locality: Locality) => [...new Set(Object.values(locality).filter(Boolean))].join(', ');

export function selectQlooMatch(detected: VisionEntity, candidates: QlooEntity[]): ResolvedEntity {
  const expectedType = categoryTypes[normalized(detected.category).replace(/ /g, '_')];
  const namesMatch = (entity: QlooEntity) => [entity.name, ...(entity.properties?.akas?.map((aka) => aka.value) ?? [])].some((name) => normalized(name) === normalized(detected.label));
  const exact = candidates.filter((candidate) => namesMatch(candidate) && (!expectedType || typeOf(candidate) === expectedType));
  const base = { detectedName: detected.label, detectedCategory: detected.category, visionConfidence: detected.confidence, source: 'vision' as const, ...(detected.position ? { position: detected.position } : {}) };
  if (exact.length !== 1) return {
    ...base, matchConfidence: candidates.length ? 0.4 : 0,
    candidates: candidates.slice(0, 3).map((candidate) => ({ id: candidate.entity_id, name: candidate.name.slice(0, 500), type: typeOf(candidate) })),
  };
  const match = exact[0];
  return { ...base, qlooId: match.entity_id, qlooName: match.name, qlooType: typeOf(match), matchConfidence: 0.95 };
}

/** Request-scoped caches reduce duplicate lookups; no image, coordinate, or global session storage. */
export class QlooClient implements QlooService {
  private http: ProviderHttp;
  private facts = new Map<string, Fact>();
  private requests = new Map<string, Promise<unknown>>();
  constructor(config: QlooConfig, fetcher?: ProviderFetch) { this.http = new ProviderHttp(config.baseUrl, { 'X-Api-Key': config.apiKey }, 'QLOO', fetcher); }

  private get(path: string, params: Record<string, string>) {
    const url = `${path}?${new URLSearchParams(params)}`;
    if (!this.requests.has(url)) this.requests.set(url, this.http.request(url));
    return this.requests.get(url)!;
  }
  private async insights(params: Record<string, string>) {
    const result = providerData(insightsSchema, await this.get('/v2/insights', params));
    if (result.success === false) throw new ApiError(502, 'QLOO_ERROR', 'The cultural analysis service could not complete the request.');
    return result;
  }
  private async lookup(ids: string[]) {
    if (!ids.length) return [];
    const result = providerData(lookupSchema, await this.get('/entities', { entity_ids: ids.join(',') }));
    const entities = Array.isArray(result.results) ? result.results : result.results.entities;
    for (const entity of entities) this.facts.set(entity.entity_id, factOf(entity));
    return entities;
  }
  async resolveEntities(detections: VisionEntity[]) {
    const results: ResolvedEntity[] = [];
    // Process two at a time to avoid bursts against hackathon quotas.
    for (let offset = 0; offset < Math.min(detections.length, 8); offset += 2) {
      results.push(...await Promise.all(detections.slice(offset, offset + 2).map(async (detected) => {
        const expectedType = categoryTypes[normalized(detected.category).replace(/ /g, '_')];
        let candidates: QlooEntity[];
        try {
          const result = providerData(lookupSchema, await this.get('/search', { query: detected.label, take: '5', ...(expectedType ? { types: expectedType } : {}) }));
          candidates = Array.isArray(result.results) ? result.results : result.results.entities;
        } catch (error) {
          if (error instanceof ApiError && error.code === 'QLOO_NOT_FOUND') candidates = [];
          else throw error;
        }
        const match = selectQlooMatch(detected, candidates);
        if (match.qlooId) {
          const entity = candidates.find((candidate) => candidate.entity_id === match.qlooId)!;
          this.facts.set(match.qlooId, factOf(entity));
        }
        return match;
      })));
    }
    return results;
  }

  async analyzeTaste(interests: TasteEntity[], references: TasteEntity[]): Promise<Pick<TasteContext, 'connections' | 'warnings'>> {
    const connections: TasteContext['connections'] = [];
    for (const reference of references) if (interests.some((interest) => interest.id === reference.id)) {
      connections.push({ referenceId: reference.id, interestId: reference.id, kind: 'exact', evidenceSource: 'qloo', description: `${reference.name} is a confirmed Qloo entity in the interests you shared.` });
    }
    const selected = references.slice(0, 8);
    const groups = new Map<string, TasteEntity[]>();
    selected.forEach((reference) => { if (reference.type.startsWith('urn:entity:') && reference.type !== 'urn:entity:unknown') groups.set(reference.type, [...(groups.get(reference.type) ?? []), reference]); });
    let requests = 0;
    let incomplete = references.length > selected.length;
    // Query each anchor separately so the explanation can name a real supported connection.
    for (const interest of interests) for (const [type, targets] of groups) {
      const candidates = targets.filter((target) => target.id !== interest.id);
      if (!candidates.length) continue;
      if (requests >= 6) { incomplete = true; continue; }
      requests++;
      const result = await this.insights({ 'filter.type': type, 'signal.interests.entities': interest.id, 'filter.results.entities': candidates.map((target) => target.id).join(','), take: String(candidates.length) });
      for (const item of result.results.entities ?? []) {
        if (!candidates.some((target) => target.id === item.entity_id)) continue;
        const score = item.query?.affinity;
        if (score === undefined || score < 0 || score > 1) continue;
        connections.push({ referenceId: item.entity_id, interestId: interest.id, kind: 'affinity', strength: score, evidenceSource: 'qloo',
          description: `Qloo returned an aggregate cultural affinity between ${item.name} and the stated interest ${interest.name}. This supports a qualified cultural connection, not an assumption about the user's knowledge or a structural analogy.` });
      }
    }
    return { connections, warnings: incomplete ? ['Interest connections use a limited set of Qloo checks. Unchecked references remain available; no overlap is not proof of unfamiliarity.'] : [] };
  }

  async analyzeConnections(entities: ResolvedEntity[]): Promise<CulturalEvidence> {
    const selected = [...new Map(entities.filter((entity) => entity.qlooId).map((entity) => [entity.qlooId, entity])).values()].slice(0, 6);
    if (!selected.length) return emptyEvidence();
    await this.lookup(selected.map((entity) => entity.qlooId!).filter((id) => !this.facts.has(id)));
    const facts = selected.flatMap((entity) => this.facts.get(entity.qlooId!) ? [this.facts.get(entity.qlooId!)!] : []);
    const relationships: CulturalEvidence['relationships'] = [];
    // Exact shared Qloo tags are metadata evidence, not fabricated affinity scores.
    for (let i = 0; i < facts.length; i++) for (let j = i + 1; j < facts.length; j++) {
      const shared = facts[i].tags.filter((tag) => facts[j].tags.includes(tag));
      if (shared.length) relationships.push({ source: facts[i].entityId, target: facts[j].entityId,
        description: `Qloo assigns both references these cultural tags: ${shared.join(', ')}.`, kind: 'shared_tags', evidenceSource: 'qloo' });
    }
    // Measure a small shortlist of actual pair affinities. Never turn an absent score into a strong relationship.
    const pairs: [ResolvedEntity, ResolvedEntity][] = [];
    for (let i = 0; i < selected.length; i++) for (let j = i + 1; j < selected.length; j++) pairs.push([selected[i], selected[j]]);
    pairs.sort((a, b) => Number(b[0].qlooType !== b[1].qlooType) - Number(a[0].qlooType !== a[1].qlooType));
    for (const [source, target] of pairs.slice(0, 4)) {
      if (!target.qlooType?.startsWith('urn:entity:')) continue;
      const response = await this.insights({ 'filter.type': target.qlooType, 'signal.interests.entities': source.qlooId!,
        'filter.results.entities': target.qlooId!, take: '1' });
      const score = response.results.entities?.find((entity) => entity.entity_id === target.qlooId)?.query?.affinity;
      if (score !== undefined && score >= 0 && score <= 1) relationships.push({ source: source.qlooId!, target: target.qlooId!, strength: score,
        description: `Qloo returned an aggregate affinity between ${source.qlooName ?? source.detectedName} and ${target.qlooName ?? target.detectedName}. This is not a causal link or a probability about an individual.`, kind: 'affinity', evidenceSource: 'qloo' });
    }
    const counts = new Map<string, number>();
    for (const fact of facts) for (const tag of fact.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    const themes = [...counts].filter(([, count]) => count >= 2 || selected.length === 1).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tag]) => tag);
    return { entities: selected, relationships, facts, themes, confidence: facts.length ? (relationships.length ? 0.8 : 0.5) : 0 };
  }

  async exploreReference(entityId: string): Promise<CulturalEvidence> {
    const [entity] = await this.lookup([entityId]);
    if (!entity) throw new ApiError(404, 'QLOO_NOT_FOUND', 'That reference is no longer available in the cultural database.');
    const related = await this.insights({ 'filter.type': typeOf(entity), 'signal.interests.entities': entityId, 'filter.exclude.entities': entityId, take: '4' });
    const reference: ResolvedEntity = { detectedName: entity.name, detectedCategory: typeOf(entity), qlooId: entityId, qlooName: entity.name,
      qlooType: typeOf(entity), matchConfidence: 1, visionConfidence: 0, source: 'qloo' };
    const recommendations = (related.results.entities ?? []).slice(0, 4);
    const facts = [factOf(entity), ...recommendations.map(factOf)];
    const relationships: CulturalEvidence['relationships'] = recommendations.flatMap((item) => {
      const score = item.query?.affinity;
      return score !== undefined && score >= 0 && score <= 1 ? [{ source: entityId, target: item.entity_id, strength: score,
        description: `Qloo returned ${item.name} as a related cultural reference to ${entity.name}; it was not necessarily visible in the scene.`, evidenceSource: 'qloo' as const, kind: 'affinity' as const }] : [];
    });
    const entities = [reference, ...recommendations.map((item): ResolvedEntity => ({ detectedName: item.name, detectedCategory: typeOf(item), qlooId: item.entity_id,
      qlooName: item.name, qlooType: typeOf(item), matchConfidence: 1, visionConfidence: 0, source: 'qloo' }))];
    return { entities, relationships, facts, themes: factOf(entity).tags, confidence: facts[0].description || facts[0].tags.length ? 0.7 : 0.3 };
  }

  async getLocationContext(locality: Locality): Promise<LocationContext> {
    let response: z.infer<typeof insightsSchema>;
    try {
      response = await this.insights({ 'filter.type': 'urn:entity:place', 'filter.location.query': localityName(locality), 'filter.location.radius': '0', take: '5' });
    } catch (error) {
      if (error instanceof ApiError && ['QLOO_NOT_FOUND', 'QLOO_REJECTED'].includes(error.code)) return {
        locality, relatedEntities: [], culturalThemes: [], confidence: 'low', facts: [],
        warnings: ['Qloo could not identify this locality. Try adding the city or country, or explore the scene without local evidence.'],
      };
      throw error;
    }
    const entities = (response.results.entities ?? []).slice(0, 5);
    const facts = entities.map(factOf);
    const counts = new Map<string, number>();
    facts.forEach((fact) => fact.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    return {
      locality, resolvedName: response.query?.localities?.filter?.[0]?.name,
      relatedEntities: entities.map((entity) => entity.name.slice(0, 500)),
      culturalThemes: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tag]) => tag), facts,
      confidence: entities.length ? 'medium' : 'low',
      warnings: entities.length ? ['Local context is based on a small set of Qloo place records, not a complete history or description of everyone in the area.'] : ['No reliable Qloo place records were returned for this area.'],
    };
  }
}
