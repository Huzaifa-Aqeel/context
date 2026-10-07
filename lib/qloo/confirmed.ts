import type { ResolvedEntity } from '@/types/context';
export const isConfirmed = (entity: ResolvedEntity) => Boolean(entity.qlooId && (entity.matchConfidence ?? 0) >= 0.75 && (entity.source === 'user' || entity.source === 'qloo' || entity.visionConfidence >= 0.7));
