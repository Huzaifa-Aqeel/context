import type { TasteEntity, TasteContext } from '@/types/taste';
import type { CulturalEvidence, Locality, LocationContext, ResolvedEntity, VisionEntity } from '@/types/context';

/** Server-only adapter boundary. Implement against verified Qloo endpoints. */
export interface QlooService {
  analyzeTaste(interests: TasteEntity[], references: TasteEntity[]): Promise<Pick<TasteContext, 'connections' | 'warnings'>>;
  resolveEntities(entities: VisionEntity[]): Promise<ResolvedEntity[]>;
  analyzeConnections(entities: ResolvedEntity[], locality?: Locality): Promise<CulturalEvidence>;
  exploreReference(entityId: string): Promise<CulturalEvidence>;
  getLocationContext(locality: Locality): Promise<LocationContext>;
}
