import type { DataEnvelope } from '@/types/data';
import type { RefreshOptions } from '@/data/remote';
import type { ResortStatus } from '@/types/resort';

export interface ResortProvider {
  getStatus(
    signal?: AbortSignal,
    options?: RefreshOptions,
  ): Promise<DataEnvelope<ResortStatus>>;
}
