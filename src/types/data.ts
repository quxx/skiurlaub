export type DataKind = 'live-report' | 'model-forecast' | 'static';

export type Freshness = 'fresh' | 'stale' | 'unavailable';

export type DataEnvelope<T> = {
  data: T | null;
  kind: DataKind;
  sourceName: string;
  sourceUrl: string;
  observedAt: string | null;
  fetchedAt: string | null;
  freshness: Freshness;
};

export type AsyncResource<T> =
  | { status: 'idle'; data: null; error: null }
  | { status: 'loading'; data: T | null; error: null }
  | { status: 'success'; data: T; error: null }
  | { status: 'error'; data: T | null; error: Error };
