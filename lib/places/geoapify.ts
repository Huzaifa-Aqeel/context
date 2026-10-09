import { z } from 'zod';
import { ProviderHttp, providerData, type ProviderFetch } from '@/lib/server/http';
import type { PlaceDetails } from '@/types/context';
import { metersBetween } from '@/lib/location/distance';

export type Coordinates = { latitude: number; longitude: number };
export type PlaceAnchor = Coordinates & {
  kind: 'device' | 'venue' | 'named'; name: string | null;
  timezone: string | null; source: 'foreground_location' | 'event_scene' | 'geoapify_geocode';
  confidence: number | null; placeId?: string;
};
export type MatchOutcome = { status: 'confirmed'; details: PlaceDetails } |
  { status: 'unverified' | 'ambiguous_or_contradictory'; details?: never };

const properties = z.object({
  place_id: z.string().optional(), name: z.string().optional(), formatted: z.string().optional(),
  address_line1: z.string().optional(), city: z.string().optional(), suburb: z.string().optional(),
  street: z.string().optional(), lat: z.number().optional(), lon: z.number().optional(),
  result_type: z.string().optional(), categories: z.array(z.string()).optional(),
  rank: z.object({ confidence: z.number().optional(), confidence_city_level: z.number().optional(),
    confidence_building_level: z.number().optional() }).optional(),
  timezone: z.object({ name: z.string().optional() }).optional(),
  phone: z.string().optional(), website: z.string().optional(), opening_hours: z.string().optional(),
  payment: z.unknown().optional(), payment_options: z.unknown().optional(),
  reservation: z.string().optional(), feature_type: z.string().optional(),
}).passthrough();
const feature = z.object({ type: z.literal('Feature'), properties,
  geometry: z.object({ type: z.string(), coordinates: z.unknown() }).optional() }).passthrough();
const collection = z.object({ features: z.array(feature).default([]) });
const geocoding = z.object({ results: z.array(properties).default([]) });
const normalize = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const nameMatches = (a: string, b: string) => normalize(a) === normalize(b);
const coordinates = (item: z.infer<typeof properties>): Coordinates | undefined =>
  item.lat !== undefined && item.lon !== undefined ? { latitude: item.lat, longitude: item.lon } : undefined;
const pointOf = (item: z.infer<typeof feature>): Coordinates | undefined => {
  const direct = coordinates(item.properties);
  if (direct) return direct;
  const point = item.geometry?.type === 'Point' ? item.geometry.coordinates : undefined;
  return Array.isArray(point) && typeof point[0] === 'number' && typeof point[1] === 'number'
    ? { longitude: point[0], latitude: point[1] } : undefined;
};
const detailsOf = (item: z.infer<typeof feature>): PlaceDetails | undefined => {
  const p = item.properties;
  if (!p.place_id || !p.name) return undefined;
  const point = pointOf(item);
  const website = p.website && /^https?:\/\//i.test(p.website) ? p.website : undefined;
  return { name: p.name, placeId: p.place_id, checkedAt: new Date().toISOString(),
    address: p.formatted, phone: p.phone, website, openingHours: p.opening_hours,
    timezone: p.timezone?.name, categories: p.categories,
    paymentOptions: p.payment_options ?? p.payment,
    reservation: p.reservation === 'required' || p.reservation === 'recommended' ? p.reservation : 'unknown',
    ...(point ?? {}) };
};

export interface PlacesService {
  findExact(name: string, options?: { locality?: string; position?: Coordinates; requireDining?: boolean;
    maxDistanceMeters?: number }): Promise<PlaceDetails | undefined>;
  resolveAnchor?(name: string, locality?: string, kind?: 'venue' | 'named'): Promise<PlaceAnchor | undefined>;
  matchCandidate?(candidate: { name: string; position?: Coordinates; city?: string }, categories: string[]): Promise<MatchOutcome>;
  reverse?(position: Coordinates): Promise<{ street: string | null; neighborhood: string | null; city: string | null; timezone: string | null }>;
  details?(placeId: string): Promise<PlaceDetails | undefined>;
  walk10?(position: Coordinates): Promise<unknown | null>;
  buildingPlaces?(placeId: string): Promise<{ name: string; placeId: string; position: Coordinates; categories: string[] }[]>;
  practicalLookup?(position: Coordinates, category: string): Promise<PlaceDetails[]>;
}

/** Geoapify provides physical evidence only. It never creates a taste recommendation. */
export class GeoapifyClient implements PlacesService {
  private http: ProviderHttp;
  constructor(private apiKey: string, fetcher?: ProviderFetch) {
    this.http = new ProviderHttp('https://api.geoapify.com', {}, 'PLACES', fetcher);
  }
  private get(path: string, params: Record<string, string | number>) {
    const query = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])), apiKey: this.apiKey });
    const url = `${path}?${query}`;
    // Scene/session state owns caching. A process-wide cache would keep hours and POI identities stale.
    return this.http.request(url);
  }
  private async geocode(name: string, locality?: string) {
    const query = [name.trim(), locality?.trim()].filter(Boolean).join(', ');
    if (!query || query.length > 300) return [];
    return providerData(geocoding, await this.get('/v1/geocode/search', { text: query, format: 'json', limit: 5 })).results;
  }
  async resolveAnchor(name: string, locality?: string, kind: 'venue' | 'named' = 'named'): Promise<PlaceAnchor | undefined> {
    const candidates = await this.geocode(name, locality);
    const plausible = candidates.filter((item) => {
      const match = nameMatches(item.name ?? '', name) || normalize(item.formatted ?? '').includes(normalize(name));
      const correctCity = !locality || normalize(item.formatted ?? '').includes(normalize(locality));
      return match && correctCity && Boolean(coordinates(item)) && Boolean(item.place_id);
    });
    // Confidence thresholds for venue names need calibration. A unique exact name with a matching
    // locality is safer than accepting a geocoder's top hit by score alone.
    let item = plausible.length === 1 ? plausible[0] : undefined;
    if (!item && locality) {
      const area = (await this.geocode(locality)).find((result) => result.place_id
        && ['city', 'district', 'suburb', 'county'].includes(result.result_type ?? ''));
      if (area?.place_id) {
        const data = providerData(collection, await this.get('/v2/places', {
          categories: 'catering,entertainment,commercial,tourism,accommodation,activity',
          filter: `place:${area.place_id}`, name, limit: 10 }));
        const matches = data.features.filter((feature) => nameMatches(feature.properties.name ?? '', name));
        if (matches.length === 1) {
          const found = matches[0].properties;
          item = { ...found, rank: { confidence: 1 },
            timezone: area.timezone ?? found.timezone };
        }
      }
    }
    if (!item || (kind === 'named' && ['city', 'state', 'country'].includes(item.result_type ?? ''))) return undefined;
    return { ...coordinates(item)!, kind, name: item.name ?? name, timezone: item.timezone?.name ?? null,
      source: 'geoapify_geocode', confidence: item.rank?.confidence ?? null, placeId: item.place_id };
  }
  async findExact(name: string, options: { locality?: string; position?: Coordinates; requireDining?: boolean;
    maxDistanceMeters?: number } = {}): Promise<PlaceDetails | undefined> {
    if (options.position) {
      const matched = await this.matchCandidate({ name, position: options.position },
        options.requireDining ? ['catering'] : ['catering', 'entertainment', 'commercial', 'tourism', 'accommodation', 'activity']);
      return matched.status === 'confirmed' ? matched.details : undefined;
    }
    const anchor = await this.resolveAnchor(name, options.locality, 'venue');
    if (!anchor?.placeId) return undefined;
    const checked = await this.details(anchor.placeId);
    return checked ?? { name: anchor.name ?? name, placeId: anchor.placeId, checkedAt: new Date().toISOString(),
      latitude: anchor.latitude, longitude: anchor.longitude, timezone: anchor.timezone ?? undefined };
  }
  async matchCandidate(candidate: { name: string; position?: Coordinates; city?: string }, categories: string[]): Promise<MatchOutcome> {
    if (!candidate.position) return { status: 'unverified' };
    const radius = Number(process.env.QLOO_GEOAPIFY_MATCH_RADIUS_METERS ?? 350);
    const boundedRadius = Number.isFinite(radius) ? Math.min(1500, Math.max(100, radius)) : 350;
    const { latitude, longitude } = candidate.position;
    const data = providerData(collection, await this.get('/v2/places', { categories: categories.join(','),
      filter: `circle:${longitude},${latitude},${boundedRadius}`,
      bias: `proximity:${longitude},${latitude}`, name: candidate.name, limit: 10 }));
    const sameName = data.features.filter((item) => nameMatches(item.properties.name ?? '', candidate.name));
    const acceptable = sameName.filter((item) => {
      const p = item.properties;
      const point = pointOf(item);
      return Boolean(p.place_id && point && metersBetween(point, candidate.position!) <= boundedRadius + 100)
        && (!candidate.city || !p.city || normalize(p.city) === normalize(candidate.city))
        && (p.categories ?? []).some((category) => categories.some((allowed) => category === allowed || category.startsWith(`${allowed}.`)));
    });
    if (!sameName.length) return { status: 'unverified' };
    if (acceptable.length !== 1) return { status: 'ambiguous_or_contradictory' };
    const summary = detailsOf(acceptable[0]);
    if (!summary) return { status: 'unverified' };
    const details = await this.details(summary.placeId).catch(() => undefined);
    return { status: 'confirmed', details: details ?? summary };
  }
  async details(placeId: string): Promise<PlaceDetails | undefined> {
    const data = providerData(collection, await this.get('/v2/place-details', { id: placeId, features: 'details' }));
    const found = data.features.find((item) => item.properties.feature_type === 'details');
    return found ? detailsOf(found) : undefined;
  }
  async reverse(position: Coordinates) {
    const data = providerData(geocoding, await this.get('/v1/geocode/reverse', {
      lat: position.latitude, lon: position.longitude, format: 'json', limit: 1 }));
    const first = data.results[0];
    return { street: first?.street ?? null, neighborhood: first?.suburb ?? null,
      city: first?.city ?? null, timezone: first?.timezone?.name ?? null };
  }
  async walk10(position: Coordinates): Promise<unknown | null> {
    const data = providerData(collection, await this.get('/v2/place-details', {
      lat: position.latitude, lon: position.longitude, features: 'walk_10' }));
    return data.features.find((item) => item.properties.feature_type === 'walk_10')?.geometry ?? null;
  }
  async buildingPlaces(placeId: string) {
    const data = providerData(collection, await this.get('/v2/place-details', { id: placeId, features: 'building.places' }));
    return data.features.filter((item) => item.properties.feature_type === 'building.places').flatMap((item) => {
      const p = item.properties; const position = pointOf(item);
      return p.name && p.place_id && position ? [{ name: p.name, placeId: p.place_id, position, categories: p.categories ?? [] }] : [];
    });
  }
  async practicalLookup(position: Coordinates, category: string): Promise<PlaceDetails[]> {
    const data = providerData(collection, await this.get('/v2/places', { categories: category,
      filter: `circle:${position.longitude},${position.latitude},1000`,
      bias: `proximity:${position.longitude},${position.latitude}`, limit: 5 }));
    const categoryName: Record<string, string> = {
      'amenity.toilet': 'Restroom', 'service.financial.atm': 'ATM', 'healthcare.pharmacy': 'Pharmacy',
    };
    return data.features.flatMap((item) => detailsOf({ ...item,
      properties: { ...item.properties, name: item.properties.name ?? categoryName[category] } }) ?? []);
  }
}
