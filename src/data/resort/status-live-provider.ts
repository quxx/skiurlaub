import type { ResortProvider } from '@/data/resort/provider';
import type { DataEnvelope } from '@/types/data';
import type { LiftOperationalStatus, OperationalStatus, PisteLevel, ResortStatus } from '@/types/resort';

const endpoint = 'https://status.live/api/v1/ski/resorts/zillertal-arena';
const sourceUrl = 'https://status.live/ski/zillertal-arena';
const cacheKey = 'skitrip:status-live:zillertal-arena:v4';
const cacheDurationMilliseconds = 15 * 60 * 1_000;

type StatusLiveResponse = {
  lifts: {
    state: string;
    as_of: string;
    stale: boolean;
    counts: {
      open: number;
      total: number;
    };
    items: Array<{
      name: string;
      status: string;
    }>;
    runs: {
      counts: {
        open_km: number;
        total_km: number;
      };
      items: Array<{
        name: string;
        status: string;
        level: string;
        km: number | null;
      }>;
    };
  };
  webcams?: {
    resort?: Array<{
      name: string;
      image_url: string;
      thumb_url: string;
      player_url: string;
      source_url: string;
      credit: string;
      location: { lat: number; lon: number };
    }>;
  };
};

type CachedStatus = {
  envelope: DataEnvelope<ResortStatus>;
  storedAt: number;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseResponse(value: unknown): StatusLiveResponse {
  const response = value as Partial<StatusLiveResponse>;
  const lifts = response.lifts;
  const liftCounts = lifts?.counts;
  const runCounts = lifts?.runs?.counts;

  if (!lifts || lifts.state !== 'reported' || typeof lifts.as_of !== 'string' || typeof lifts.stale !== 'boolean') {
    throw new Error('status.live meldet derzeit keinen belastbaren Resortstatus.');
  }
  if (!liftCounts || !runCounts || ![liftCounts.open, liftCounts.total, runCounts.open_km, runCounts.total_km].every(isFiniteNumber)) {
    throw new Error('Die Resortdaten von status.live sind unvollständig.');
  }
  if (!Array.isArray(lifts.items) || lifts.items.some((item) => typeof item?.name !== 'string' || typeof item?.status !== 'string')) {
    throw new Error('status.live liefert keine gültigen Einzelstatus der Lifte.');
  }
  if (!Array.isArray(lifts.runs.items) || lifts.runs.items.some((item) =>
    typeof item?.name !== 'string' || typeof item?.status !== 'string' || typeof item?.level !== 'string' || (item.km !== null && !isFiniteNumber(item.km)))) {
    throw new Error('status.live liefert keine gültigen Einzelstatus der Pisten.');
  }
  const webcams = response.webcams?.resort;
  if (webcams !== undefined && (!Array.isArray(webcams) || webcams.some((webcam) =>
    typeof webcam?.name !== 'string' || typeof webcam?.image_url !== 'string' ||
    typeof webcam?.player_url !== 'string' || typeof webcam?.source_url !== 'string' ||
    typeof webcam?.credit !== 'string' || !isFiniteNumber(webcam?.location?.lat) ||
    !isFiniteNumber(webcam?.location?.lon)))) {
    throw new Error('status.live liefert keine gültigen Webcam-Daten.');
  }
  return response as StatusLiveResponse;
}

function operationalStatus(open: number, total: number): OperationalStatus {
  if (total <= 0) return 'unknown';
  if (open <= 0) return 'closed';
  if (open >= total) return 'open';
  return 'partial';
}

function liftOperationalStatus(value: string): LiftOperationalStatus {
  if (value === 'open' || value === 'closed' || value === 'hold' || value === 'scheduled') return value;
  return 'unknown';
}

function pisteLevel(value: string): PisteLevel {
  if (value === 'blue' || value === 'red' || value === 'black' || value === 'route') return value;
  return 'unknown';
}

function pisteReference(name: string): string | null {
  const numbered = name.match(/\bNr\.\s*(\d+[a-z]?)\b/i);
  if (numbered?.[1]) return numbered[1].toLocaleLowerCase('de-DE');
  const leading = name.match(/^(?:Skipiste\s+)?(\d+[a-z]?)\b/i);
  return leading?.[1]?.toLocaleLowerCase('de-DE') ?? null;
}

function normalize(response: StatusLiveResponse): DataEnvelope<ResortStatus> {
  const liftCounts = response.lifts.counts;
  const pisteCounts = response.lifts.runs.counts;

  return {
    data: {
      area: 'zillertal-arena',
      lifts: {
        open: liftCounts.open,
        total: liftCounts.total,
        status: operationalStatus(liftCounts.open, liftCounts.total),
      },
      liftItems: response.lifts.items.map((lift) => ({
        name: lift.name,
        status: liftOperationalStatus(lift.status),
      })),
      pisteItems: response.lifts.runs.items.map((piste) => ({
        name: piste.name,
        ref: pisteReference(piste.name),
        status: liftOperationalStatus(piste.status),
        level: pisteLevel(piste.level),
        kilometers: piste.km,
      })),
      webcams: (response.webcams?.resort ?? []).map((webcam) => ({
        name: webcam.name,
        imageUrl: webcam.thumb_url || webcam.image_url,
        playerUrl: webcam.player_url,
        sourceUrl: webcam.source_url,
        credit: webcam.credit,
        latitude: webcam.location.lat,
        longitude: webcam.location.lon,
      })),
      pisteKilometers: {
        open: pisteCounts.open_km,
        total: pisteCounts.total_km,
        status: operationalStatus(pisteCounts.open_km, pisteCounts.total_km),
      },
      snowMountainCentimeters: null,
      snowValleyCentimeters: null,
      newSnowCentimeters: null,
    },
    kind: 'live-report',
    sourceName: 'status.live',
    sourceUrl,
    observedAt: response.lifts.as_of,
    fetchedAt: new Date().toISOString(),
    freshness: response.lifts.stale ? 'stale' : 'fresh',
  };
}

function readCache(): CachedStatus | null {
  try {
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedStatus;
    if (!cached.envelope?.data || !Number.isFinite(cached.storedAt)) return null;
    return cached;
  } catch {
    return null;
  }
}

function writeCache(envelope: DataEnvelope<ResortStatus>) {
  try {
    window.localStorage.setItem(cacheKey, JSON.stringify({ envelope, storedAt: Date.now() } satisfies CachedStatus));
  } catch {
    // Live status still works if storage is unavailable.
  }
}

export const statusLiveProvider: ResortProvider = {
  async getStatus(signal) {
    const cached = readCache();
    if (cached && Date.now() - cached.storedAt < cacheDurationMilliseconds) return cached.envelope;

    try {
      const response = await fetch(endpoint, { signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`status.live antwortet mit HTTP ${response.status}.`);
      const envelope = normalize(parseResponse(await response.json()));
      writeCache(envelope);
      return envelope;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (cached) return { ...cached.envelope, freshness: 'stale' };
      throw error instanceof Error ? error : new Error('Lift- und Pistendaten konnten nicht geladen werden.');
    }
  },
};
