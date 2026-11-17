import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createRemoteProvider, sourceFreshness } from './remote';
import {
  openMeteoSchema,
  buildWeatherUrl,
} from './weather/open-meteo-provider';
import { statusLiveSchema } from './resort/status-live-provider';
import { weatherResponse, resortResponse } from '@/test/fixtures';
import { localDateKey, formatSourceTime } from './date-time';
import { skiTileSchema } from './resort/liftradar-pistes';

const schema = z.object({ value: z.number().nonnegative() });
function provider() {
  return createRemoteProvider({
    key: 'test:cache',
    url: () => 'https://example.invalid/data',
    schema,
    ttl: 60_000,
    maxCacheAge: 120_000,
    normalize: (raw, fetchedAt) => ({
      data: raw,
      kind: 'live-report',
      sourceName: 'Test',
      sourceUrl: 'https://example.invalid/',
      observedAt: fetchedAt,
      fetchedAt,
      freshness: 'fresh',
    }),
  });
}
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2027-01-10T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Netzwerk- und Cachegrenzen', () => {
  it.each([
    null,
    {},
    {
      version: 1,
      storedAt: Date.parse('2027-01-10T12:00Z'),
      raw: { value: -1 },
    },
    {
      version: 2,
      storedAt: Date.parse('2027-01-10T12:00Z'),
      raw: { value: 2 },
    },
    {
      version: 1,
      storedAt: Date.parse('2028-01-10T12:00Z'),
      raw: { value: 2 },
    },
  ])('ignoriert ungültigen Cache %j', async (cache) => {
    localStorage.setItem('test:cache', JSON.stringify(cache));
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ value: 3 })));
    vi.stubGlobal('fetch', fetchMock);
    expect((await provider()()).data?.value).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('umgeht beim expliziten Refresh den frischen Cache', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ value: fetchMock.mock.calls.length })),
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const load = provider();
    await load();
    await load();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await load(undefined, { force: true })).data?.value).toBe(2);
  });
  it('beachtet Retry-After und erhält den letzten Erfolg', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"value":3}'));
    vi.stubGlobal('fetch', fetchMock);
    const load = provider();
    const first = await load();
    vi.setSystemTime(Date.now() + 61_000);
    fetchMock.mockResolvedValue(
      new Response('', { status: 429, headers: { 'Retry-After': '120' } }),
    );
    const stale = await load();
    expect(stale).toMatchObject({
      freshness: 'stale',
      fetchedAt: first.fetchedAt,
    });
    expect(stale.refreshError).toContain('Zu viele Anfragen');
    await load(undefined, { force: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.now() + 121_000);
    fetchMock.mockResolvedValue(new Response('{"value":4}'));
    expect((await load()).data?.value).toBe(4);
  });
  it('verwendet zu alten Cache auch bei Ausfall nicht weiter', async () => {
    localStorage.setItem(
      'test:cache',
      JSON.stringify({
        version: 1,
        storedAt: Date.now() - 121_000,
        raw: { value: 2 },
      }),
    );
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(provider()()).rejects.toThrow('offline');
  });
  it('persistiert nach Abbruch keine verspätete Antwort', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"value":3}')),
    );
    await expect(provider()(controller.signal)).rejects.toBeDefined();
    expect(localStorage.getItem('test:cache')).toBeNull();
  });
  it('bleibt ohne Speicher funktionsfähig', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"value":3}')),
    );
    expect((await provider()()).data?.value).toBe(3);
  });
});

describe('Providerverträge', () => {
  it('validiert auch Kartenkoordinaten und meldet Timeout verständlich', async () => {
    expect(
      skiTileSchema.safeParse({
        areas: [],
        runs: [
          {
            c: [
              [12, 47],
              [12.1, 47.1],
            ],
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      skiTileSchema.safeParse({ areas: [], runs: [{ c: [[12, 147]] }] })
        .success,
    ).toBe(false);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError')),
    );
    await expect(provider()()).rejects.toThrow('nicht rechtzeitig');
  });
  it('weist null, ungültige Zeitstempel und unterschiedlich lange Reihen ab', () => {
    expect(openMeteoSchema.safeParse(null).success).toBe(false);
    const raw = weatherResponse();
    raw.hourly.temperature_2m.pop();
    expect(openMeteoSchema.safeParse(raw).success).toBe(false);
    expect(statusLiveSchema.safeParse(null).success).toBe(false);
    expect(
      statusLiveSchema.safeParse({
        lifts: { ...resortResponse().lifts, as_of: 'invalid' },
      }).success,
    ).toBe(false);
    const resort = resortResponse();
    resort.lifts.counts.open = 3;
    expect(statusLiveSchema.safeParse(resort).success).toBe(false);
  });
  it('fordert UTC-Zeitpunkte und festgelegte Einheiten an', () => {
    const url = new URL(buildWeatherUrl());
    expect(url.searchParams.get('timeformat')).toBe('unixtime');
    expect(url.searchParams.get('wind_speed_unit')).toBe('kmh');
  });
  it('markiert alte und unplausibel zukünftige Quellstände als veraltet', () => {
    expect(sourceFreshness('2027-01-10T11:59:00Z', 120_000)).toBe('fresh');
    expect(sourceFreshness('2027-01-09T11:59:00Z', 120_000)).toBe('stale');
    expect(sourceFreshness('2028-01-10T11:59:00Z', 120_000)).toBe('stale');
  });
  it('ordnet UTC-Stunden auch an Mitternacht und Sommerzeitwechseln korrekt zu', () => {
    expect(localDateKey('2027-01-10T23:30:00Z', 'Europe/Vienna')).toBe(
      '2027-01-11',
    );
    expect(formatSourceTime('2027-03-28T01:30:00Z', 'Europe/Vienna')).toContain(
      '03:30',
    );
    expect(formatSourceTime('2027-10-31T00:30:00Z', 'Europe/Vienna')).toContain(
      '02:30',
    );
    expect(formatSourceTime('2027-10-31T01:30:00Z', 'Europe/Vienna')).toContain(
      '02:30',
    );
    expect(formatSourceTime('invalid', 'Europe/Vienna')).toBe('Unbekannt');
  });
});
