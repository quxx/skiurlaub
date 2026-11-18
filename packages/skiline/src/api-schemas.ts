import { z } from 'zod';
import {
  numericTicketIdSchema,
  resortIdSchema,
  skiingDayIdSchema,
} from './ids';

// IMPORTANT: Only the structure documented in the project brief is encoded here:
// the top-level keys of `getData`, and that a SkiingDay carries a JSON-encoded
// string in `data`. The names of other fields on days/resorts/tickets (id, date,
// resortId, ticketId, name) are ASSUMPTIONS that must be confirmed against a real
// anonymised export before live use. Unknown fields are tolerated and ignored.

export const MAX_DAYS_PER_IMPORT = 2000;
export const MAX_DAY_DATA_CHARS = 512 * 1024;

export const skilineDayRecordSchema = z.looseObject({
  id: skiingDayIdSchema,
  date: z.string().min(8).max(40),
  resortId: resortIdSchema.nullish(),
  ticketId: numericTicketIdSchema.nullish(),
  data: z.string(),
});
export const skilineResortRecordSchema = z.looseObject({
  id: resortIdSchema,
  name: z.string().trim().min(1).max(120).nullish(),
});

// Outer envelope. Days are kept as `unknown` here so that one bad record is
// rejected on its own instead of failing the whole import.
export const skilineGetDataSchema = z.looseObject({
  items: z.array(z.unknown()).max(10_000).optional(),
  tickets: z.array(z.unknown()).max(1_000).optional(),
  resorts: z.array(z.unknown()).max(1_000).optional(),
  skiingDays: z.array(z.unknown()).max(MAX_DAYS_PER_IMPORT),
  seasonStatistic: z.unknown().optional(),
  user: z.unknown().optional(),
});
export type SkilineGetData = z.infer<typeof skilineGetDataSchema>;

const nonNegative = (max: number) => z.number().finite().nonnegative().max(max);
// Inner, JSON-encoded `SkiingDay.data`. Units are not verified (see docs):
// verticalMeters is taken as meters from its name; slopeDistance's unit is unknown.
export const skiingDayDataSchema = z
  .looseObject({
    verticalMeters: nonNegative(1_000_000),
    liftCount: z.number().int().nonnegative().max(1_000),
    slopeDistance: nonNegative(10_000_000),
    graphData: z.array(z.unknown()).max(20_000).nullish(),
    minX: z.number().finite().nullish(),
    maxX: z.number().finite().nullish(),
    minY: z.number().finite().nullish(),
    maxY: z.number().finite().nullish(),
  })
  .refine(
    (v) => v.minX == null || v.maxX == null || v.minX <= v.maxX,
    'minX > maxX',
  )
  .refine(
    (v) => v.minY == null || v.maxY == null || v.minY <= v.maxY,
    'minY > maxY',
  );
export type SkiingDayData = z.infer<typeof skiingDayDataSchema>;

export type DayDataFailure =
  'data_too_large' | 'data_invalid_json' | 'data_invalid_shape';
// Never echoes the payload (it may contain personal movement data).
export function parseSkiingDayData(
  raw: string,
): { ok: true; value: SkiingDayData } | { ok: false; reason: DayDataFailure } {
  if (raw.length > MAX_DAY_DATA_CHARS)
    return { ok: false, reason: 'data_too_large' };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'data_invalid_json' };
  }
  const parsed = skiingDayDataSchema.safeParse(json);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, reason: 'data_invalid_shape' };
}
