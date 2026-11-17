import { z } from 'zod';
import type { ResortProvider } from '@/data/resort/provider';
import type { DataEnvelope } from '@/types/data';
import type {
  LiftOperationalStatus,
  OperationalStatus,
  PisteLevel,
  ResortStatus,
} from '@/types/resort';
import { createRemoteProvider, sourceFreshness } from '@/data/remote';

const https = z.url().refine((value) => new URL(value).protocol === 'https:');
const counts = z
  .object({
    open: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  })
  .refine((value) => value.open <= value.total);
const runCounts = z
  .object({
    open_km: z.number().nonnegative(),
    total_km: z.number().nonnegative(),
    open: z.number().int().nonnegative().optional(),
    total: z.number().int().nonnegative().optional(),
  })
  .refine(
    (value) =>
      value.open_km <= value.total_km &&
      (value.open === undefined ||
        value.total === undefined ||
        value.open <= value.total),
  );
export const statusLiveSchema = z.object({
  lifts: z.object({
    state: z.literal('reported'),
    as_of: z.iso.datetime({ offset: true }),
    stale: z.boolean(),
    counts,
    items: z
      .array(z.object({ name: z.string().min(1), status: z.string() }))
      .max(1000),
    runs: z.object({
      counts: runCounts,
      items: z
        .array(
          z.object({
            name: z.string().min(1),
            status: z.string(),
            level: z.string(),
            km: z.number().nonnegative().nullable(),
          }),
        )
        .max(3000),
    }),
  }),
  webcams: z
    .object({
      resort: z
        .array(
          z.object({
            name: z.string(),
            image_url: https,
            thumb_url: z.union([https, z.literal('')]).optional(),
            player_url: https,
            source_url: https,
            credit: z.string(),
            location: z.object({
              lat: z.number().min(-90).max(90),
              lon: z.number().min(-180).max(180),
            }),
          }),
        )
        .optional(),
    })
    .optional(),
});
type StatusLiveResponse = z.infer<typeof statusLiveSchema>;
const sourceUrl = 'https://status.live/ski/zillertal-arena';
function operationalStatus(open: number, total: number): OperationalStatus {
  if (total <= 0) return 'unknown';
  if (open <= 0) return 'closed';
  if (open >= total) return 'open';
  return 'partial';
}

function liftOperationalStatus(value: string): LiftOperationalStatus {
  if (
    value === 'open' ||
    value === 'closed' ||
    value === 'hold' ||
    value === 'scheduled'
  )
    return value;
  return 'unknown';
}

function pisteLevel(value: string): PisteLevel {
  if (
    value === 'blue' ||
    value === 'red' ||
    value === 'black' ||
    value === 'route'
  )
    return value;
  return 'unknown';
}

function pisteReference(name: string): string | null {
  const numbered = name.match(/\bNr\.\s*(\d+[a-z]?)\b/i);
  if (numbered?.[1]) return numbered[1].toLocaleLowerCase('de-DE');
  const leading = name.match(/^(?:Skipiste\s+)?(\d+[a-z]?)\b/i);
  return leading?.[1]?.toLocaleLowerCase('de-DE') ?? null;
}

function normalize(
  response: StatusLiveResponse,
  fetchedAt: string,
): DataEnvelope<ResortStatus> {
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
      pisteCount: {
        open: pisteCounts.open ?? null,
        total: pisteCounts.total ?? null,
        status:
          pisteCounts.open === undefined || pisteCounts.total === undefined
            ? 'unknown'
            : operationalStatus(pisteCounts.open, pisteCounts.total),
      },
      snowMountainCentimeters: null,
      snowValleyCentimeters: null,
      newSnowCentimeters: null,
    },
    kind: 'live-report',
    sourceName: 'status.live',
    sourceUrl,
    observedAt: response.lifts.as_of,
    fetchedAt,
    freshness: response.lifts.stale
      ? 'stale'
      : sourceFreshness(response.lifts.as_of, 2 * 60 * 60_000),
  };
}

export const statusLiveProvider: ResortProvider = {
  getStatus: createRemoteProvider({
    key: 'skiurlaub:resort:zillertal-arena:v5',
    url: () => 'https://status.live/api/v1/ski/resorts/zillertal-arena',
    schema: statusLiveSchema,
    ttl: 15 * 60_000,
    maxCacheAge: 24 * 60 * 60_000,
    normalize,
  }),
};
