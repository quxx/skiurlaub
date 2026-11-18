import { describe, expect, it } from 'vitest';
import { MAX_DAY_DATA_CHARS, parseSkiingDayData } from './api-schemas';
import { syntheticExport } from './fixtures';
import { normalizeExport, toLocalDate } from './normalize';
import { classifyRefresh } from './results';

const valid = {
  verticalMeters: 1000,
  liftCount: 5,
  slopeDistance: 20000,
};
const options = { defaultTimeZone: 'Europe/Vienna' };
const day = (over: Record<string, unknown> = {}, data: unknown = valid) => ({
  id: 'x1',
  date: '2027-01-10',
  data: typeof data === 'string' ? data : JSON.stringify(data),
  ...over,
});

describe('parseSkiingDayData (verschachtelter JSON-String)', () => {
  it('parst gültige Daten inklusive optionaler Profilfelder', () => {
    const result = parseSkiingDayData(
      JSON.stringify({
        ...valid,
        graphData: [[0, 1]],
        minX: 0,
        maxX: 9,
        minY: 1,
        maxY: 2,
      }),
    );
    expect(result.ok).toBe(true);
  });
  it.each([
    ['kein JSON', 'nicht json', 'data_invalid_json'],
    ['leer', '', 'data_invalid_json'],
    ['null', 'null', 'data_invalid_shape'],
    ['Array', '[]', 'data_invalid_shape'],
    ['fehlendes Feld', JSON.stringify({ liftCount: 1 }), 'data_invalid_shape'],
    [
      'negativ',
      JSON.stringify({ ...valid, verticalMeters: -1 }),
      'data_invalid_shape',
    ],
    [
      'unendlich (1e999)',
      '{"verticalMeters":1e999,"liftCount":1,"slopeDistance":1}',
      'data_invalid_shape',
    ],
    [
      'als String statt Zahl',
      JSON.stringify({ ...valid, liftCount: '5' }),
      'data_invalid_shape',
    ],
    [
      'Bruchteil bei Liftfahrten',
      JSON.stringify({ ...valid, liftCount: 2.5 }),
      'data_invalid_shape',
    ],
    [
      'minX > maxX',
      JSON.stringify({ ...valid, minX: 9, maxX: 1 }),
      'data_invalid_shape',
    ],
    [
      'zu viele Profilpunkte',
      JSON.stringify({ ...valid, graphData: new Array(20001).fill(0) }),
      'data_invalid_shape',
    ],
  ])('weist ab: %s', (_name, raw, reason) => {
    expect(parseSkiingDayData(raw)).toEqual({ ok: false, reason });
  });
  it('begrenzt die Größe vor dem Parsen', () => {
    expect(parseSkiingDayData('x'.repeat(MAX_DAY_DATA_CHARS + 1))).toEqual({
      ok: false,
      reason: 'data_too_large',
    });
  });
  it('lässt __proto__-Schlüssel nicht in Objekt-Prototypen gelangen', () => {
    const raw =
      '{"verticalMeters":1,"liftCount":1,"slopeDistance":1,"__proto__":{"polluted":true}}';
    parseSkiingDayData(raw);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('toLocalDate', () => {
  it('übernimmt reine Daten und prüft den Kalender', () => {
    expect(toLocalDate('2027-01-10', 'Europe/Vienna')).toBe('2027-01-10');
    expect(toLocalDate('2027-02-30', 'Europe/Vienna')).toBeNull();
    expect(toLocalDate('2027-13-01', 'Europe/Vienna')).toBeNull();
  });
  it('rechnet Zeitpunkte mit Zone in den lokalen Tag um', () => {
    // 23:30 UTC am 10.1. ist in Wien bereits der 11.1.
    expect(toLocalDate('2027-01-10T23:30:00Z', 'Europe/Vienna')).toBe(
      '2027-01-11',
    );
    expect(toLocalDate('2027-01-10T23:30:00Z', 'UTC')).toBe('2027-01-10');
    expect(toLocalDate('2027-01-10T08:00:00+01:00', 'Europe/Vienna')).toBe(
      '2027-01-10',
    );
  });
  it('rät keine Zone und lehnt Unbrauchbares ab', () => {
    expect(toLocalDate('2027-01-10T08:00:00', 'Europe/Vienna')).toBeNull();
    expect(toLocalDate('morgen', 'Europe/Vienna')).toBeNull();
    expect(toLocalDate('', 'Europe/Vienna')).toBeNull();
  });
});

describe('normalizeExport', () => {
  it('normalisiert die synthetischen Beispieldaten', () => {
    const result = normalizeExport(syntheticExport(), options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.days.map((d) => d.localDate)).toEqual([
      '2027-01-10',
      '2027-01-11',
      '2027-01-12',
    ]);
    expect(result.report.rejected).toEqual([]);
    expect(result.report.resorts).toHaveLength(2);
    expect(result.report.days[0]).toMatchObject({
      externalId: 'd-1',
      verticalMeters: 12450,
      liftCount: 18,
      slopeDistanceRaw: 42300,
      slopeDistanceUnit: 'unknown',
      resortExternalId: '9001',
    });
  });
  it('akzeptiert numerische IDs und ein nacktes Array', () => {
    const result = normalizeExport([day({ id: 42, resortId: 7 })], options);
    expect(result.ok && result.report.days[0]).toMatchObject({
      externalId: '42',
      resortExternalId: '7',
    });
  });
  it('weist einzelne kaputte Datensätze ab, ohne den Rest zu verlieren', () => {
    const result = normalizeExport(
      {
        skiingDays: [
          day({ id: 'ok' }),
          'kein Objekt',
          day({ id: 'b', date: '2027-02-30' }),
          day({ id: 'c' }, 'kaputt'),
          { id: 'd', date: '2027-01-10' },
          day({ id: 'e' }, { ...valid, verticalMeters: -5 }),
        ],
      },
      options,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.days.map((d) => d.externalId)).toEqual(['ok']);
    expect(result.report.rejected).toEqual([
      { index: 1, reason: 'invalid_record' },
      { index: 2, reason: 'invalid_date' },
      { index: 3, reason: 'data_invalid_json' },
      { index: 4, reason: 'invalid_record' },
      { index: 5, reason: 'data_invalid_shape' },
    ]);
  });
  it('dedupliziert gleiche IDs innerhalb einer Datei (letzter Stand gewinnt)', () => {
    const result = normalizeExport(
      [day({ id: 'same' }), day({ id: 'same' }, { ...valid, liftCount: 9 })],
      options,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.days).toHaveLength(1);
    expect(result.report.days[0].liftCount).toBe(9);
    expect(result.report.duplicatesInPayload).toBe(1);
  });
  it.each([
    ['null', null],
    ['String', 'hallo'],
    ['Zahl', 5],
    ['Objekt ohne skiingDays', { resorts: [] }],
    ['skiingDays kein Array', { skiingDays: {} }],
  ])('weist eine ungültige Hülle ab: %s', (_name, input) => {
    expect(normalizeExport(input, options)).toEqual({
      ok: false,
      reason: 'invalid_export',
    });
  });
  it('begrenzt die Anzahl der Tage', () => {
    const days = Array.from({ length: 2001 }, (_, i) => day({ id: `d${i}` }));
    expect(normalizeExport(days, options)).toEqual({
      ok: false,
      reason: 'too_many_days',
    });
  });
});

describe('classifyRefresh (konservativ, nicht gegen Live geprüft)', () => {
  it.each([
    [
      'alles null/leer wie beobachtet -> unknown, nie Erfolg',
      {
        matchingTicketCount: null,
        refreshedCount: null,
        refreshedTickets: [],
        skippedFastRefreshCount: null,
      },
      'unknown',
    ],
    ['leeres Objekt', {}, 'unknown'],
    ['kein Objekt', 'x', 'unknown'],
    [
      'kein Treffer',
      { matchingTicketCount: 0, refreshedCount: 0 },
      'not_found',
    ],
    [
      'aktualisiert',
      { matchingTicketCount: 1, refreshedCount: 1, refreshedTickets: [{}] },
      'refreshed',
    ],
    [
      'übersprungen',
      {
        matchingTicketCount: 1,
        refreshedCount: 0,
        skippedFastRefreshCount: 1,
      },
      'skipped',
    ],
    [
      'unverändert',
      {
        matchingTicketCount: 1,
        refreshedCount: 0,
        skippedFastRefreshCount: 0,
      },
      'unchanged',
    ],
    [
      'widersprüchlich',
      { matchingTicketCount: null, refreshedCount: 0 },
      'unknown',
    ],
    [
      'negative Zahl',
      { matchingTicketCount: -1, refreshedCount: 0 },
      'unknown',
    ],
  ])('%s', (_name, input, status) => {
    expect(classifyRefresh(input).status).toBe(status);
  });
});
