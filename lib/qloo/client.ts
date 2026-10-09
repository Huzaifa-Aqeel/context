import type { TasteEntity, TasteContext } from '@/types/taste';
import { z } from 'zod';
import { ApiError } from '@/lib/api/server';
import type { QlooConfig } from '@/lib/server/config';
import { ProviderHttp, providerData, type ProviderFetch } from '@/lib/server/http';
import type { QlooService, ShelfRanking, EventRanking, DiningRecommendation, PlaceRecommendation } from './service';
import { QLOO_PLACE_TAGS, classifyQlooPlace, type CulturalPlaceBucket } from '@/lib/places/qloo-tags';
import { cachedShelfMatch, type ShelfResolutionEntry } from './display-resolution-cache';
import { displayCategories, type DisplayKind } from '@/lib/display/categories';
import type { CulturalEvidence, Locality, LocationContext, ResolvedEntity, VisionEntity } from '@/types/context';
import { metersBetween } from '@/lib/location/distance';

const tagSchema = z.object({ id: z.string().optional(), tag_id: z.string().optional(), name: z.string(), type: z.string().optional() });
const entitySchema = z.object({
  entity_id: z.string(), name: z.string(), types: z.array(z.string()).optional(), subtype: z.string().optional(), type: z.string().optional(),
  location: z.object({ lat: z.number().optional(), lon: z.number().optional() }).optional(),
  tags: z.array(tagSchema).optional(),
  properties: z.object({
    short_description: z.string().nullable().optional(), description: z.string().nullable().optional(),
    akas: z.array(z.object({ value: z.string() })).optional(),
    geocode: z.object({ name: z.string().optional(), city: z.string().optional(), admin1_region: z.string().optional(), country: z.string().optional() }).optional(),
    neighborhood: z.string().optional(),
  }).optional(),
  disambiguation: z.string().optional(),
  query: z.object({ affinity: z.number().optional(), explainability: z.object({
    'signal.interests.entities': z.array(z.object({ entity_id: z.string(), score: z.number() })).optional(),
  }).optional() }).optional(),
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
  author: 'urn:entity:person', writer: 'urn:entity:person', person: 'urn:entity:person', artist: 'urn:entity:artist', music: 'urn:entity:artist',
  book: 'urn:entity:book', game: 'urn:entity:videogame', video_game: 'urn:entity:videogame',
  videogame: 'urn:entity:videogame', podcast: 'urn:entity:podcast', destination: 'urn:entity:destination',
  restaurant: 'urn:entity:place', venue: 'urn:entity:place', place: 'urn:entity:place', landmark: 'urn:entity:place', museum: 'urn:entity:place', gallery: 'urn:entity:place',
};
const normalized = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const bookTitle = (text: string) => normalized(text.replace(/\s*\([^)]*\)\s*$/, '').replace(/,\s+or\s+.*$/i, ''));
const bookAuthor = (entity: QlooEntity) => normalized(entity.disambiguation ?? '');
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
let searchTail: Promise<void> = Promise.resolve();
const searchCache = new Map<string, unknown>();
function queuedSearch<T>(task: () => Promise<T>): Promise<T> {
  const run = searchTail.then(task, task);
  searchTail = run.then(() => {}, () => {});
  return run;
}
function retryDelay(header: string | null, attempt: number) {
  const seconds = header ? Number(header) : NaN;
  if (Number.isFinite(seconds)) return Math.min(Math.max(seconds * 1000, 0), 10_000);
  const date = header ? Date.parse(header) : NaN;
  if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 0), 10_000);
  return Math.min(1000 * 2 ** attempt, 4000);
}

export function selectQlooMatch(detected: VisionEntity, candidates: QlooEntity[], locality?: Locality): ResolvedEntity {
  const visualCategory = normalized(detected.category).replace(/ /g, '_');
  const displayCategory = Object.values(displayCategories).find((category) =>
    category.visualCategory === visualCategory || (category.acceptedVisualCategories as readonly string[]).includes(visualCategory));
  const expectedType = displayCategory?.qlooType ?? categoryTypes[visualCategory];
  const bookOrPodcast = detected.category === 'book_or_podcast';
  const compatible = expectedType ? candidates.filter((candidate) => typeOf(candidate) === expectedType)
    : bookOrPodcast ? candidates.filter((candidate) => ['urn:entity:book', 'urn:entity:podcast'].includes(typeOf(candidate)))
    : detected.allowBroadSearch ? candidates : [];
  const direct = compatible.filter((candidate) => typeOf(candidate) === 'urn:entity:book'
    ? bookTitle(candidate.name) === bookTitle(detected.label) : normalized(candidate.name) === normalized(detected.label));
  const alias = compatible.filter((candidate) => candidate.properties?.akas?.some((aka) => normalized(aka.value) === normalized(detected.label)));
  let exact = direct.length ? direct : alias;
  if (exact.length > 1 && expectedType === 'urn:entity:place' && locality) {
    const values = Object.values(locality).filter(Boolean).map((value) => normalized(value!));
    const matches = exact.filter((candidate) => {
      const geo = candidate.properties?.geocode;
      const parts = [candidate.properties?.neighborhood, geo?.name, geo?.city, geo?.admin1_region, geo?.country].filter(Boolean).map((value) => normalized(value!));
      return values.some((value) => parts.includes(value));
    });
    if (matches.length === 1) exact = matches;
  }
  const identityUsesRelatedName = Boolean(displayCategory?.identityUsesRelatedName);
  if ((identityUsesRelatedName || bookOrPodcast) && detected.relatedName && exact.length) {
    const related = normalized(detected.relatedName);
    exact = exact.filter((candidate) => (typeOf(candidate) === 'urn:entity:book' ? bookAuthor(candidate) : normalized(candidate.disambiguation ?? '')).includes(related));
  }
  const base = { detectedName: detected.label, detectedCategory: detected.category, visionConfidence: detected.confidence, source: 'vision' as const,
    groundingBasis: 'direct' as const, ...(detected.carrier ? { carrier: detected.carrier } : {}), ...(detected.visualDescription ? { visualDescription: detected.visualDescription } : {}),
    ...(detected.visibleText ? { visibleText: detected.visibleText } : {}), ...(detected.relatedName ? { relatedName: detected.relatedName } : {}),
    ...(detected.visiblePlatform ? { visiblePlatform: detected.visiblePlatform } : {}), ...(detected.visibleEdition ? { visibleEdition: detected.visibleEdition } : {}),
    ...(detected.position ? { position: detected.position } : {}) };
  if (exact.length !== 1) return {
    ...base, matchConfidence: candidates.length ? 0.4 : 0,
    candidates: compatible.filter((candidate) => typeOf(candidate) !== 'urn:entity:book' || bookTitle(candidate.name) === bookTitle(detected.label)).slice(0, 3).map((candidate) => ({ id: candidate.entity_id, name: `${candidate.name}${candidate.disambiguation ? ` — ${candidate.disambiguation}` : ''}`.slice(0, 500), type: typeOf(candidate) })),
  };
  const match = exact[0];
  return { ...base, qlooId: match.entity_id, qlooName: match.name, qlooType: typeOf(match), matchConfidence: 0.95 };
}

/** Search calls share a serial queue; only public entity lookups are cached across requests. */
export class QlooClient implements QlooService {
  private http: ProviderHttp;
  private facts = new Map<string, Fact>();
  private requests = new Map<string, Promise<unknown>>();
  constructor(private config: QlooConfig, private fetcher: ProviderFetch = globalThis.fetch) { this.http = new ProviderHttp(config.baseUrl, { 'X-Api-Key': config.apiKey }, 'QLOO', fetcher); }

  private search(params: Record<string, string>): Promise<unknown> {
    const path = `/search?${new URLSearchParams(params)}`;
    const cacheKey = `${this.config.baseUrl}:${path}`;
    const cacheable = this.fetcher === globalThis.fetch;
    if (cacheable && searchCache.has(cacheKey)) return Promise.resolve(searchCache.get(cacheKey));
    if (this.requests.has(path)) return this.requests.get(path)!;
    const pending = queuedSearch(async () => {
      if (cacheable && searchCache.has(cacheKey)) return searchCache.get(cacheKey);
      for (let attempt = 0; attempt < 4; attempt++) {
        let response: Response;
        try { response = await this.fetcher(`${this.config.baseUrl}${path}`, { headers: { Accept: 'application/json', 'X-Api-Key': this.config.apiKey }, signal: AbortSignal.timeout(30_000) }); }
        catch { throw new ApiError(503, 'QLOO_UNREACHABLE', 'Cultural matching is temporarily unavailable.'); }
        if (response.status === 429 && attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay(response.headers.get('Retry-After'), attempt)));
          continue;
        }
        if (response.status === 429) throw new ApiError(429, 'QLOO_RATE_LIMIT', 'Cultural matching is busy. Try again shortly.');
        if (response.status === 404) throw new ApiError(404, 'QLOO_NOT_FOUND', 'No cultural match was found.');
        if (!response.ok) throw new ApiError(502, 'QLOO_ERROR', 'Cultural matching could not complete.');
        const result: unknown = await response.json().catch(() => { throw new ApiError(502, 'INVALID_PROVIDER_RESPONSE', 'Cultural matching returned an unreadable response.'); });
        if (cacheable) {
          searchCache.set(cacheKey, result);
          if (searchCache.size > 500) searchCache.delete(searchCache.keys().next().value!);
        }
        return result;
      }
    });
    this.requests.set(path, pending);
    void pending.catch(() => { this.requests.delete(path); });
    return pending;
  }

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
  async rankShelf(kind: DisplayKind, visible: VisionEntity[], interests: TasteEntity[], cache: ShelfResolutionEntry[] = []): Promise<ShelfRanking> {
    const type = displayCategories[kind].qlooType;
    const resolved = new Array<ResolvedEntity>(visible.length);
    let next = 0;
    let searchFailed = false;
    const worker = async () => {
      while (next < visible.length) {
        const index = next++;
        const item = visible[index];
        const cached = cachedShelfMatch(kind, item, cache);
        if (cached) {
          resolved[index] = { detectedName: item.label, detectedCategory: item.category, visionConfidence: item.confidence,
            qlooId: cached.qlooId, qlooName: cached.qlooName, qlooType: cached.qlooType, matchConfidence: 0.95,
            source: 'vision', relatedName: item.relatedName, visiblePlatform: item.visiblePlatform,
            visibleEdition: item.visibleEdition, carrier: item.carrier, position: item.position };
          continue;
        }
        try {
          const response = providerData(lookupSchema, await this.search({ query: item.label, take: '8', types: type }));
          const candidates = Array.isArray(response.results) ? response.results : response.results.entities;
          resolved[index] = selectQlooMatch(item, candidates);
          if (resolved[index].qlooId) {
            const match = candidates.find((candidate) => candidate.entity_id === resolved[index].qlooId);
            if (match) this.facts.set(match.entity_id, factOf(match));
          }
        } catch (error) {
          if (error instanceof ApiError && error.code === 'QLOO_NOT_FOUND') {
            resolved[index] = selectQlooMatch(item, []);
            continue;
          }
          searchFailed = true;
          resolved[index] = { detectedName: item.label, detectedCategory: item.category, visionConfidence: item.confidence,
            source: 'vision', resolutionPending: true, carrier: item.carrier, visualDescription: item.visualDescription,
            visibleText: item.visibleText, relatedName: item.relatedName, visiblePlatform: item.visiblePlatform,
            visibleEdition: item.visibleEdition, position: item.position };
        }
      }
    };
    await worker();
    return this.rerankShelf(kind, resolved, interests, searchFailed);
  }
  async rerankShelf(kind: DisplayKind, resolved: ResolvedEntity[], interests: TasteEntity[], incompleteResolution = false): Promise<ShelfRanking> {
    const type = displayCategories[kind].qlooType;
    const uniqueIds = [...new Set(resolved.flatMap((item) => item.qlooId ? [item.qlooId] : []))];
    const interestIds = [...new Set(interests.map((item) => item.id))];
    const exact = uniqueIds.filter((id) => interestIds.includes(id));
    const other = uniqueIds.filter((id) => !interestIds.includes(id));
    if (!uniqueIds.length) return { resolved, ranked: [], complete: false };
    if (!interestIds.length) return { resolved, ranked: [], complete: false };
    const exactRanked = exact.map((entityId) => ({ entityId, contributingInterestIds: [entityId] }));
    if (!other.length) return { resolved, ranked: exactRanked, complete: !incompleteResolution };
    try {
      const response = providerData(insightsSchema, await this.http.json('/v2/insights', {
        'filter.type': type, 'filter.results.entities': uniqueIds.join(','),
        'signal.interests.entities': interestIds, 'feature.explainability': true, take: Math.min(uniqueIds.length, 50),
      }));
      if (response.success === false) return { resolved, ranked: exactRanked, complete: false };
      const others = (response.results.entities ?? []).filter((item) => other.includes(item.entity_id) && typeOf(item) === type &&
        item.query?.affinity !== undefined && item.query.affinity >= 0 && item.query.affinity <= 1);
      const uniqueOthers = [...new Map(others.map((item) => [item.entity_id, item])).values()];
      const complete = !incompleteResolution && other.every((id) => uniqueOthers.some((item) => item.entity_id === id));
      const ranked = [
        ...exactRanked,
        ...uniqueOthers.sort((a, b) => b.query!.affinity! - a.query!.affinity!).map((item) => ({
          entityId: item.entity_id, affinity: item.query!.affinity,
          contributingInterestIds: [...new Set(item.query?.explainability?.['signal.interests.entities']?.filter((entry) =>
            interestIds.includes(entry.entity_id) && entry.score >= 0.1).map((entry) => entry.entity_id) ?? [])],
        })),
      ];
      return { resolved, ranked, complete };
    } catch { return { resolved, ranked: exactRanked, complete: false }; }
  }
  async rankEvent(visible: VisionEntity[], interests: TasteEntity[]): Promise<EventRanking> {
    const resolved: ResolvedEntity[] = [];
    for (let offset = 0; offset < visible.length; offset += 8) resolved.push(...await this.resolveEntities(visible.slice(offset, offset + 8)));
    return this.rerankEvent(resolved, interests);
  }
  async rerankEvent(resolved: ResolvedEntity[], interests: TasteEntity[]): Promise<EventRanking> {
    const interestIds = [...new Set(interests.map((item) => item.id))];
    const groups = new Map<string, ResolvedEntity[]>();
    for (const item of resolved) {
      if (!item.qlooId || !item.qlooType || item.matchConfidence === undefined || item.matchConfidence < 0.75) continue;
      groups.set(item.qlooType, [...(groups.get(item.qlooType) ?? []), item]);
    }
    const ranked: EventRanking['ranked'] = [];
    for (const [type, items] of groups) {
      const unique = [...new Map(items.map((item) => [item.qlooId!, item])).values()];
      for (const item of unique.filter((entry) => interestIds.includes(entry.qlooId!))) ranked.push({
        entityId: item.qlooId!, name: item.detectedName, exactInterest: true, contributingInterestIds: [item.qlooId!],
      });
      const others = unique.filter((item) => !interestIds.includes(item.qlooId!));
      if (!others.length || !interestIds.length) continue;
      try {
        const response = providerData(insightsSchema, await this.http.json('/v2/insights', {
          'filter.type': type, 'filter.results.entities': unique.map((item) => item.qlooId).join(','),
          'signal.interests.entities': interestIds, 'feature.explainability': true, take: unique.length,
        }));
        if (response.success === false) continue;
        const allowed = new Set(others.map((item) => item.qlooId));
        for (const entity of response.results.entities ?? []) {
          if (!allowed.has(entity.entity_id) || typeOf(entity) !== type || entity.query?.affinity === undefined) continue;
          if (entity.query.affinity < 0 || entity.query.affinity > 1) continue;
          const visibleItem = others.find((item) => item.qlooId === entity.entity_id)!;
          ranked.push({ entityId: entity.entity_id, name: visibleItem.detectedName, affinity: entity.query.affinity,
            exactInterest: false, contributingInterestIds: [...new Set(entity.query.explainability?.['signal.interests.entities']?.filter((entry) =>
              interestIds.includes(entry.entity_id) && entry.score >= 0.1).sort((a, b) => b.score - a.score).map((entry) => entry.entity_id) ?? [])] });
        }
      } catch { /* A failed type batch does not erase visible event information or other ranked types. */ }
    }
    ranked.sort((a, b) => Number(b.exactInterest) - Number(a.exactInterest) || (b.affinity ?? -1) - (a.affinity ?? -1));
    return { resolved, ranked };
  }
  async sharedEventTag(performerId: string, contributingInterestIds: string[]): Promise<string | undefined> {
    const ids = [...new Set([performerId, ...contributingInterestIds])];
    if (ids.length < 2 || ids.length > 3) return undefined;
    await this.lookup(ids.filter((id) => !this.facts.get(id)?.tags.length));
    const facts = ids.map((id) => this.facts.get(id));
    if (facts.some((fact) => !fact?.tags.length)) return undefined;
    const shared = facts[0]!.tags.filter((tag) => facts.slice(1).every((fact) => fact!.tags.some((other) => normalized(other) === normalized(tag))));
    return shared.find((tag) => tag.length >= 2 && !/^(music|artist|person|live|performance|entertainment|popular|contemporary)$/i.test(tag));
  }
  private placeCandidates(entities: QlooEntity[], interestIds: string[], radiusMeters: number): PlaceRecommendation[] {
    return [...new Map(entities.flatMap((entity): PlaceRecommendation[] => {
      const affinity = entity.query?.affinity;
      if (typeOf(entity) !== 'urn:entity:place' || affinity === undefined || affinity < 0 || affinity > 1) return [];
      const tagIds = (entity.tags ?? []).flatMap((tag) => tag.tag_id ?? tag.id ?? []);
      return [{ qlooId: entity.entity_id, name: entity.name, radiusMeters, affinity, tagIds,
        latitude: entity.location?.lat, longitude: entity.location?.lon,
        city: entity.properties?.geocode?.city,
        bucket: classifyQlooPlace(tagIds),
        cuisineTags: (entity.tags ?? []).filter((tag) => /^urn:tag:genre:restaurant:/i.test(tag.tag_id ?? tag.id ?? '')).map((tag) => tag.name).slice(0, 5),
        contributingInterestIds: [...new Set(entity.query?.explainability?.['signal.interests.entities']?.filter((entry) =>
          interestIds.includes(entry.entity_id) && entry.score >= 0.1).sort((a, b) => b.score - a.score).map((entry) => entry.entity_id) ?? [])] }];
    }).map((item) => [item.qlooId, item])).values()];
  }
  async recommendDining(position: { latitude: number; longitude: number }, interests: TasteEntity[],
    options: { device?: boolean; extraSignalId?: string; weekday?: string } = {}): Promise<DiningRecommendation[]> {
    const interestIds = [...new Set(interests.map((item) => item.id))];
    if (!interestIds.length || !Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)
      || Math.abs(position.latitude) > 90 || Math.abs(position.longitude) > 180) return [];
    const point = `POINT(${options.device ? Number(position.longitude.toFixed(3)) : position.longitude} ${options.device ? Number(position.latitude.toFixed(3)) : position.latitude})`;
    for (const radiusMeters of [2000, 5000] as const) {
      const response = providerData(insightsSchema, await this.http.json('/v2/insights', {
        'filter.type': 'urn:entity:place', 'filter.tags': QLOO_PLACE_TAGS.restaurant,
        'filter.location': point, 'filter.location.radius': radiusMeters,
        'signal.interests.entities': [...interestIds, ...(options.extraSignalId ? [options.extraSignalId] : [])],
        'feature.explainability': true, sort_by: 'affinity', take: 8,
        ...(options.weekday ? { 'filter.hours': options.weekday } : {}),
      }));
      if (response.success === false) continue;
      const candidates = this.placeCandidates(response.results.entities ?? [], interestIds, radiusMeters)
        .filter((item) => item.tagIds?.includes(QLOO_PLACE_TAGS.restaurant));
      if (candidates.length) return candidates;
    }
    return [];
  }
  async discoverArea(position: { latitude: number; longitude: number }, interests: TasteEntity[],
    options: { device?: boolean; radiusMeters?: 800 | 2000; bucket?: CulturalPlaceBucket; take?: number } = {}): Promise<PlaceRecommendation[]> {
    const interestIds = [...new Set(interests.map((item) => item.id))];
    if (!interestIds.length) return [];
    const tags = options.bucket && options.bucket !== 'other' ? QLOO_PLACE_TAGS[options.bucket] :
      Object.values(QLOO_PLACE_TAGS).flatMap((item) => Array.isArray(item) ? item : []);
    const longitude = options.device ? Number(position.longitude.toFixed(3)) : position.longitude;
    const latitude = options.device ? Number(position.latitude.toFixed(3)) : position.latitude;
    const radiusMeters = options.radiusMeters ?? 800;
    const response = providerData(insightsSchema, await this.http.json('/v2/insights', {
      'filter.type': 'urn:entity:place', 'filter.tags': tags.join(','), 'operator.filter.tags': 'union',
      'filter.location': `POINT(${longitude} ${latitude})`, 'filter.location.radius': radiusMeters,
      'signal.interests.entities': interestIds, 'feature.explainability': true,
      sort_by: 'affinity', take: options.take ?? (options.bucket ? 5 : 30),
    }));
    return response.success === false ? [] : this.placeCandidates(response.results.entities ?? [], interestIds, radiusMeters);
  }
  async rankBoundedPlaces(ids: string[], interests: TasteEntity[]): Promise<PlaceRecommendation[]> {
    const unique = [...new Set(ids)].slice(0, 12);
    const interestIds = [...new Set(interests.map((item) => item.id))];
    if (!unique.length || !interestIds.length) return [];
    const response = providerData(insightsSchema, await this.http.json('/v2/insights', {
      'filter.type': 'urn:entity:place', 'filter.results.entities': unique.join(','),
      'signal.interests.entities': interestIds, 'feature.explainability': true,
      sort_by: 'affinity', take: unique.length,
    }));
    return response.success === false ? [] : this.placeCandidates((response.results.entities ?? []).filter((item) => unique.includes(item.entity_id)), interestIds, 0);
  }
  async resolvePlaceCandidates(items: { name: string; latitude: number; longitude: number; city?: string }[]) {
    const resolved: { name: string; qlooId: string; latitude: number; longitude: number }[] = [];
    for (const item of items.slice(0, 12)) {
      try {
        const result = providerData(lookupSchema, await this.search({ query: item.name, types: 'urn:entity:place', take: '8' }));
        const candidates = Array.isArray(result.results) ? result.results : result.results.entities;
        const matching = candidates.filter((candidate) => typeOf(candidate) === 'urn:entity:place'
          && normalized(candidate.name) === normalized(item.name)
          && candidate.location?.lat !== undefined && candidate.location.lon !== undefined
          && metersBetween(item, { latitude: candidate.location.lat, longitude: candidate.location.lon }) <= 300
          && (!item.city || !candidate.properties?.geocode?.city
            || normalized(candidate.properties.geocode.city) === normalized(item.city)));
        if (matching.length === 1) resolved.push({ name: item.name, qlooId: matching[0].entity_id,
          latitude: item.latitude, longitude: item.longitude });
      } catch { /* A failed lookup does not invalidate other mapped businesses. */ }
    }
    return resolved;
  }
  async getEntityFact(entityId: string): Promise<Fact | undefined> {
    if (!this.facts.has(entityId)) await this.lookup([entityId]);
    return this.facts.get(entityId);
  }
  async resolveEntities(detections: VisionEntity[], locality?: Locality) {
    const results: ResolvedEntity[] = [];
    // Process two at a time to avoid bursts against hackathon quotas.
    for (let offset = 0; offset < Math.min(detections.length, 8); offset += 2) {
      results.push(...await Promise.all(detections.slice(offset, offset + 2).map(async (detected) => {
        const directType = categoryTypes[normalized(detected.category).replace(/ /g, '_')];
        const relatedType = detected.relatedCategory ? categoryTypes[normalized(detected.relatedCategory).replace(/ /g, '_')] : undefined;
        const related = detected.category !== 'book_or_podcast' && !directType && detected.relatedName && relatedType;
        if (!directType && !related && !detected.allowBroadSearch && detected.category !== 'book_or_podcast') return { detectedName: detected.label, detectedCategory: detected.category, visionConfidence: detected.confidence, source: 'vision' as const,
          matchConfidence: 0, groundingBasis: 'direct' as const, ...(detected.carrier ? { carrier: detected.carrier } : {}), ...(detected.visualDescription ? { visualDescription: detected.visualDescription } : {}),
          ...(detected.visibleText ? { visibleText: detected.visibleText } : {}), ...(detected.relatedName ? { relatedName: detected.relatedName } : {}), ...(detected.position ? { position: detected.position } : {}) };
        const target = related ? { ...detected, label: detected.relatedName!, category: detected.relatedCategory! } : detected;
        const expectedType = related ? relatedType : directType;
        let candidates: QlooEntity[];
        try {
          if (target.category === 'book_or_podcast') {
            const results = await Promise.all(['urn:entity:book', 'urn:entity:podcast'].map((types) => this.search({ query: target.label, take: '8', types }).catch((error) => {
              if (error instanceof ApiError && error.code === 'QLOO_NOT_FOUND') return { results: [] };
              throw error;
            })));
            candidates = results.flatMap((value) => {
              const result = providerData(lookupSchema, value);
              return Array.isArray(result.results) ? result.results : result.results.entities;
            });
          } else {
            const result = providerData(lookupSchema, await this.search({ query: target.label, take: expectedType === 'urn:entity:book' ? '8' : '5', ...(expectedType ? { types: expectedType } : {}) }));
            candidates = Array.isArray(result.results) ? result.results : result.results.entities;
          }
        } catch (error) {
          if (error instanceof ApiError && error.code === 'QLOO_NOT_FOUND') candidates = [];
          else return { detectedName: detected.label, detectedCategory: detected.category, visionConfidence: detected.confidence,
            source: 'vision' as const, resolutionPending: true, relatedName: detected.relatedName, position: detected.position };
        }
        const match = selectQlooMatch(target, candidates, locality);
        const result = related ? { ...match, detectedName: detected.label, detectedCategory: detected.category, groundingBasis: 'related' as const,
          carrier: detected.carrier, visualDescription: detected.visualDescription, visibleText: detected.visibleText, relatedName: detected.relatedName, position: detected.position } : match;
        if (match.qlooId) {
          const entity = candidates.find((candidate) => candidate.entity_id === match.qlooId)!;
          this.facts.set(match.qlooId, factOf(entity));
        }
        return result;
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
    const considered = interests.slice(0, 6);
    const nonExact = selected.filter((reference) => !considered.some((interest) => interest.id === reference.id));
    if (!nonExact.length) return { connections, warnings: references.length > selected.length || interests.length > considered.length ? ['Interest connections use a limited set of Qloo checks.'] : [] };
    const ids = [...new Set([...considered.map((item) => item.id), ...nonExact.map((item) => item.id)])];
    await this.lookup(ids.filter((id) => !this.facts.has(id)));
    const groups = new Map<string, TasteEntity[]>();
    nonExact.forEach((reference) => { if (reference.type.startsWith('urn:entity:') && reference.type !== 'urn:entity:unknown' && considered.some((interest) => this.facts.get(interest.id)?.tags.some((tag) => this.facts.get(reference.id)?.tags.includes(tag)))) groups.set(reference.type, [...(groups.get(reference.type) ?? []), reference]); });
    let requests = 0;
    let incomplete = references.length > selected.length || interests.length > considered.length;
    // Query each anchor separately so the explanation can name a real supported connection.
    for (const interest of considered) for (const [type, targets] of groups) {
      const candidates = targets.filter((target) => target.id !== interest.id && this.facts.get(interest.id)?.tags.some((tag) => this.facts.get(target.id)?.tags.includes(tag)));
      if (!candidates.length) continue;
      if (requests >= 6) { incomplete = true; continue; }
      requests++;
      const result = await this.insights({ 'filter.type': type, 'signal.interests.entities': interest.id, 'filter.results.entities': candidates.map((target) => target.id).join(','), take: String(candidates.length) });
      for (const item of result.results.entities ?? []) {
        if (!candidates.some((target) => target.id === item.entity_id)) continue;
        const score = item.query?.affinity;
        if (score === undefined || score < 0 || score > 1) continue;
        const sharedTags = this.facts.get(interest.id)?.tags.filter((tag) => this.facts.get(item.entity_id)?.tags.includes(tag)).slice(0, 3) ?? [];
        if (!sharedTags.length) continue;
        connections.push({ referenceId: item.entity_id, interestId: interest.id, kind: 'affinity', strength: score, sharedTags, evidenceSource: 'qloo',
          description: `Qloo returned an aggregate cultural affinity between ${item.name} and the stated interest ${interest.name}. This supports a qualified cultural connection, not an assumption about the user's knowledge or a structural analogy.` });
      }
    }
    return { connections, warnings: incomplete ? ['Interest connections use a limited set of Qloo checks. Unchecked references remain available; no overlap is not proof of unfamiliarity.'] : [] };
  }

  async analyzeConnections(entities: ResolvedEntity[], options?: { includeAffinity?: boolean }): Promise<CulturalEvidence> {
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
    for (const [source, target] of (options?.includeAffinity === false ? [] : pairs.slice(0, 4))) {
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
