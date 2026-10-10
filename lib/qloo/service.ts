import type { TasteEntity, TasteContext } from '@/types/taste';
import type { CulturalEvidence, Locality, LocationContext, ResolvedEntity, VisionEntity } from '@/types/context';
import type { ResolutionEntry } from './display-resolution-cache';
import type { DisplayKind } from '@/lib/display/categories';
import type { CulturalPlaceBucket } from '@/lib/places/qloo-tags';

export type ShelfRanking = {
  resolved: ResolvedEntity[];
  ranked: { entityId: string; affinity?: number; contributingInterestIds: string[] }[];
  complete: boolean;
};
export type EventRanking = { resolved: ResolvedEntity[]; ranked: { entityId: string; name: string; affinity?: number;
  exactInterest: boolean; contributingInterestIds: string[]; sharedTag?: string }[] };
export type PlaceRecommendation = { qlooId: string; name: string; radiusMeters: number;
  affinity?: number; contributingInterestIds: string[]; cuisineTags: string[];
  latitude?: number; longitude?: number; city?: string; tagIds?: string[];
  bucket?: CulturalPlaceBucket };
export type DiningRecommendation = PlaceRecommendation;

/** Server-only adapter boundary. Implement against verified Qloo endpoints. */
export interface QlooService {
  rankShelf?(kind: DisplayKind, visible: VisionEntity[], interests: TasteEntity[], cache?: ResolutionEntry[]): Promise<ShelfRanking>;
  rerankShelf?(kind: DisplayKind, resolved: ResolvedEntity[], interests: TasteEntity[], incompleteResolution?: boolean): Promise<ShelfRanking>;
  rankEvent?(visible: VisionEntity[], interests: TasteEntity[], cache?: ResolutionEntry[], printedLocality?: Locality): Promise<EventRanking>;
  rerankEvent?(resolved: ResolvedEntity[], interests: TasteEntity[]): Promise<EventRanking>;
  recommendDining?(position: { latitude: number; longitude: number }, interests: TasteEntity[],
    options?: { device?: boolean; extraSignalId?: string; weekday?: string }): Promise<DiningRecommendation[]>;
  discoverArea?(position: { latitude: number; longitude: number }, interests: TasteEntity[],
    options?: { device?: boolean; radiusMeters?: 800 | 2000; bucket?: CulturalPlaceBucket; take?: number }): Promise<PlaceRecommendation[]>;
  rankBoundedPlaces?(ids: string[], interests: TasteEntity[]): Promise<PlaceRecommendation[]>;
  resolvePlaceCandidates?(items: { name: string; latitude: number; longitude: number; city?: string }[]): Promise<
    { name: string; qlooId: string; latitude: number; longitude: number }[]>;
  analyzeTaste(interests: TasteEntity[], references: TasteEntity[]): Promise<Pick<TasteContext, 'connections' | 'warnings'>>;
  getEntityFact(entityId: string): Promise<NonNullable<CulturalEvidence['facts']>[number] | undefined>;
  resolveEntities(entities: VisionEntity[], locality?: Locality): Promise<ResolvedEntity[]>;
  analyzeConnections(entities: ResolvedEntity[], options?: { includeAffinity?: boolean }): Promise<CulturalEvidence>;
  exploreReference(entityId: string): Promise<CulturalEvidence>;
  getLocationContext(locality: Locality): Promise<LocationContext>;
}
