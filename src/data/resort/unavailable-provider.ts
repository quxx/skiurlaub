import type { ResortProvider } from '@/data/resort/provider';
import type { DataEnvelope } from '@/types/data';
import type { ResortStatus } from '@/types/resort';

const officialReportUrl =
  'https://www.zillertalarena.com/info-service/livecams-wetter/schneebericht/';

export const unavailableResortProvider: ResortProvider = {
  async getStatus(): Promise<DataEnvelope<ResortStatus>> {
    return {
      data: null,
      kind: 'live-report',
      sourceName: 'Zillertal Arena',
      sourceUrl: officialReportUrl,
      observedAt: null,
      fetchedAt: new Date().toISOString(),
      freshness: 'unavailable',
    };
  },
};
