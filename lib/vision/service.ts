import type { VisionEntity } from '@/types/context';

export interface VisionService {
  inspectScene(image: string): Promise<VisionEntity[]>;
}
