import type { VisionEntity } from '@/types/context';
import type { z } from 'zod';
import type { eventVisualSchema } from '@/schemas/context';

export type VisionFrame = { sceneType: string; entities: VisionEntity[]; event?: z.infer<typeof eventVisualSchema> };
export interface VisionService {
  inspectScene(image: string): Promise<VisionFrame | VisionEntity[]>;
}
