import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openMeteoProvider } from './weather/open-meteo-provider';
import { statusLiveProvider } from './resort/status-live-provider';

import { weatherResponse, resortResponse } from '@/test/fixtures';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2027-01-10T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

it('normalisiert Modellschnee und Stundenprognose und verwendet den frischen Cache', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(weatherResponse())));
  vi.stubGlobal('fetch', fetchMock);
  const result = await openMeteoProvider.getWeather();
  expect(result.data?.current.snowDepthCentimeters).toBe(40);
  expect(result.data?.forecast).toHaveLength(7);
  expect(result.data?.hourly).toHaveLength(24);
  expect(result.observedAt).toBe('2027-01-10T11:00:00.000Z');
  await openMeteoProvider.getWeather();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('erhält Resort-Einzelmeldungen und markiert abgelaufenen Cache bei Netzausfall', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify(resortResponse()))),
  );
  const first = await statusLiveProvider.getStatus();
  expect(first.data?.pisteItems[0]).toMatchObject({
    ref: '78',
    status: 'open',
  });
  expect(first.data?.pisteCount).toMatchObject({ open: 1, total: 2 });
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 16 * 60_000);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  expect((await statusLiveProvider.getStatus()).freshness).toBe('stale');
  vi.useRealTimers();
});

it('kennzeichnet alten Wettercache als veraltet und erfindet ohne Cache keine Daten', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify(weatherResponse()))),
  );
  await openMeteoProvider.getWeather();
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 31 * 60_000);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  expect((await openMeteoProvider.getWeather()).freshness).toBe('stale');
  localStorage.clear();
  await expect(openMeteoProvider.getWeather()).rejects.toThrow('offline');
  await expect(statusLiveProvider.getStatus()).rejects.toThrow('offline');
  vi.useRealTimers();
});

it('weist unvollständige API-Antworten zurück', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
  await expect(openMeteoProvider.getWeather()).rejects.toThrow();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
  await expect(statusLiveProvider.getStatus()).rejects.toThrow();
});
