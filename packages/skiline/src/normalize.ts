import {
  MAX_DAYS_PER_IMPORT,
  parseSkiingDayData,
  skilineDayRecordSchema,
  skilineGetDataSchema,
  skilineResortRecordSchema,
} from './api-schemas';
import type { DayDataFailure } from './api-schemas';

export type RejectReason = 'invalid_record' | 'invalid_date' | DayDataFailure;

// Provider-independent skiing day. Raw and calculated values stay separate:
// `rawData` is the untouched inner JSON string (bounded), the numbers are parsed.
export type NormalizedSkiDay = {
  externalId: string;
  localDate: string; // YYYY-MM-DD in the resort's time zone
  resortExternalId: string | null;
  ticketExternalId: string | null;
  verticalMeters: number;
  liftCount: number;
  slopeDistanceRaw: number;
  slopeDistanceUnit: 'unknown';
  rawData: string;
};
export type NormalizedResort = { externalId: string; name: string | null };
export type NormalizeReport = {
  days: NormalizedSkiDay[];
  resorts: NormalizedResort[];
  rejected: { index: number; reason: RejectReason }[];
  duplicatesInPayload: number;
};
export type NormalizeFailure = 'invalid_export' | 'too_many_days';

const zoneDesignator = /(Z|[+-]\d{2}:?\d{2})$/;

function isCalendarDate(value: string): boolean {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

// Plain dates are taken as already local. Date-times must carry a zone and are
// converted to the resort's local day; anything else is rejected, never guessed.
export function toLocalDate(value: string, timeZone: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value))
    return isCalendarDate(value) ? value : null;
  if (!zoneDesignator.test(value) || !Number.isFinite(Date.parse(value)))
    return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// Accepts a getData-shaped object or a bare array of skiing days.
export function normalizeExport(
  input: unknown,
  options: { defaultTimeZone: string },
):
  | { ok: true; report: NormalizeReport }
  | { ok: false; reason: NormalizeFailure } {
  const envelope = Array.isArray(input) ? { skiingDays: input } : input;
  const outer = skilineGetDataSchema.safeParse(envelope);
  if (!outer.success) {
    const tooMany = outer.error.issues.some(
      (issue) =>
        issue.path[0] === 'skiingDays' &&
        issue.code === 'too_big' &&
        'maximum' in issue &&
        issue.maximum === MAX_DAYS_PER_IMPORT,
    );
    return { ok: false, reason: tooMany ? 'too_many_days' : 'invalid_export' };
  }
  const byId = new Map<string, NormalizedSkiDay>();
  const rejected: NormalizeReport['rejected'] = [];
  let duplicates = 0;
  outer.data.skiingDays.forEach((raw, index) => {
    const record = skilineDayRecordSchema.safeParse(raw);
    if (!record.success) {
      rejected.push({ index, reason: 'invalid_record' });
      return;
    }
    const localDate = toLocalDate(record.data.date, options.defaultTimeZone);
    if (!localDate) {
      rejected.push({ index, reason: 'invalid_date' });
      return;
    }
    const data = parseSkiingDayData(record.data.data);
    if (!data.ok) {
      rejected.push({ index, reason: data.reason });
      return;
    }
    if (byId.has(record.data.id)) duplicates++;
    byId.set(record.data.id, {
      externalId: record.data.id,
      localDate,
      resortExternalId: record.data.resortId ?? null,
      ticketExternalId: record.data.ticketId ?? null,
      verticalMeters: data.value.verticalMeters,
      liftCount: data.value.liftCount,
      slopeDistanceRaw: data.value.slopeDistance,
      slopeDistanceUnit: 'unknown',
      rawData: record.data.data,
    });
  });
  const resorts = new Map<string, NormalizedResort>();
  for (const raw of outer.data.resorts ?? []) {
    const parsed = skilineResortRecordSchema.safeParse(raw);
    if (parsed.success)
      resorts.set(parsed.data.id, {
        externalId: parsed.data.id,
        name: parsed.data.name ?? null,
      });
  }
  return {
    ok: true,
    report: {
      days: [...byId.values()],
      resorts: [...resorts.values()],
      rejected,
      duplicatesInPayload: duplicates,
    },
  };
}
