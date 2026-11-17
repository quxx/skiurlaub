import { act, renderHook } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useRemoteResource } from './useRemoteResource';
const mode = vi.hoisted(() => ({ value: 'afterTrip' }));
vi.mock('@/hooks/useTripMode', () => ({ useTripMode: () => mode.value }));
const envelope = () => ({
  data: { value: 1 },
  sourceName: 'Test',
  sourceUrl: 'https://example.invalid',
  kind: 'live-report' as const,
  freshness: 'fresh' as const,
  observedAt: new Date().toISOString(),
  fetchedAt: new Date().toISOString(),
});
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}
beforeEach(() => {
  vi.useFakeTimers();
  mode.value = 'afterTrip';
});
afterEach(() => vi.useRealTimers());
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
}
it('prüft beim Wiederverbinden auch einen gerade geladenen Cache-Rückfall erneut', async () => {
  mode.value = 'onTrip';
  onlineManager.setOnline(false);
  const { wrapper, client } = setup();
  const load = vi
    .fn()
    .mockImplementationOnce(async () => ({
      ...envelope(),
      freshness: 'stale',
      refreshError: 'offline',
    }))
    .mockImplementation(async () => envelope());
  const hook = renderHook(() => useRemoteResource('weather', load, 60_000), {
    wrapper,
  });
  await flush();
  expect(load).toHaveBeenCalledTimes(1);
  act(() => onlineManager.setOnline(true));
  await flush();
  expect(load).toHaveBeenCalledTimes(2);
  expect(hook.result.current.resource.data?.refreshError).toBeUndefined();
  hook.unmount();
  client.clear();
});
it('bündelt gleichzeitige Konsumenten und pausiert Polling nach Reiseende', async () => {
  const { wrapper, client } = setup();
  const load = vi.fn().mockImplementation(async () => envelope());
  const a = renderHook(() => useRemoteResource('weather', load, 60_000), {
    wrapper,
  });
  const b = renderHook(() => useRemoteResource('weather', load, 60_000), {
    wrapper,
  });
  await flush();
  expect(load).toHaveBeenCalledTimes(1);
  expect(a.result.current.canReload).toBe(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(61_000);
  });
  expect(load).toHaveBeenCalledTimes(1);
  expect(a.result.current.canReload).toBe(true);
  act(() => a.result.current.reload());
  await flush();
  expect(load).toHaveBeenCalledTimes(2);
  expect(load.mock.calls[1][1]).toEqual({ force: true });
  a.unmount();
  b.unmount();
  client.clear();
});
it('umgeht beim Invalidieren den Provider-Cache und wartet auf die neue Antwort', async () => {
  const { wrapper, client } = setup();
  const load = vi.fn().mockImplementation(async () => envelope());
  const hook = renderHook(() => useRemoteResource('weather', load, 60_000), {
    wrapper,
  });
  await flush();
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['dashboard'] });
  });
  await flush();
  expect(load).toHaveBeenCalledTimes(2);
  expect(load.mock.calls[1][1]).toEqual({ force: true });
  hook.unmount();
  client.clear();
});
it('aktualisiert vor Reiseende regelmäßig und bewahrt Daten bei Fehlern als veraltet', async () => {
  mode.value = 'onTrip';
  const { wrapper, client } = setup();
  const load = vi
    .fn()
    .mockImplementationOnce(async () => envelope())
    .mockRejectedValue(new Error('offline'));
  const hook = renderHook(() => useRemoteResource('weather', load, 60_000), {
    wrapper,
  });
  await flush();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_010);
  });
  expect(load).toHaveBeenCalledTimes(2);
  expect(hook.result.current.resource).toMatchObject({
    status: 'error',
    data: { freshness: 'stale' },
  });
  hook.unmount();
  client.clear();
});
