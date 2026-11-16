import type { DataEnvelope } from '@/types/data';
import type { ResortStatus } from '@/types/resort';

export interface ResortProvider {
  getStatus(signal?: AbortSignal): Promise<DataEnvelope<ResortStatus>>;
}
