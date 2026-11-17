import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { refreshActiveData } from './refresh';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
});
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  cleanups.push(() => client.clear());
  return client;
}
function active(
  client: QueryClient,
  key: string[],
  load = vi.fn(async () => ({})),
  updatedAt = Date.now() - 61_000,
) {
  const observer = new QueryObserver(client, {
    queryKey: key,
    queryFn: load,
    initialData: {},
    initialDataUpdatedAt: updatedAt,
    staleTime: Infinity,
  });
  cleanups.push(observer.subscribe(() => {}));
  return load;
}

it('aktualisiert Wetter, Liftstatus und aktive persönliche Statistiken, aber keine inaktiven Daten', async () => {
  const client = setup();
  const weather = active(client, ['dashboard', 'weather']);
  const lifts = active(client, ['dashboard', 'resort']);
  const statistics = active(client, ['private', 'statistics']);
  const inactive = vi.fn(async () => ({}));
  client.setQueryDefaults(['private', 'other'], { queryFn: inactive });
  client.setQueryData(['private', 'other'], {});
  await expect(refreshActiveData(client)).resolves.toBe('Daten aktualisiert.');
  [weather, lifts, statistics].forEach((load) =>
    expect(load).toHaveBeenCalledTimes(1),
  );
  expect(inactive).not.toHaveBeenCalled();
});

it('behält die Mindestpause pro Datenquelle bei und nennt die verbleibende Zeit', async () => {
  const client = setup();
  const weather = active(
    client,
    ['dashboard', 'weather'],
    undefined,
    Date.now(),
  );
  await expect(refreshActiveData(client)).resolves.toContain('Sekunden');
  expect(weather).not.toHaveBeenCalled();
});

it('meldet Cache-Rückfälle als unvollständige Aktualisierung', async () => {
  const client = setup();
  active(
    client,
    ['dashboard', 'weather'],
    vi.fn(async () => ({ refreshError: 'Quelle offline' })),
  );
  const lifts = active(client, ['dashboard', 'resort']);
  await expect(refreshActiveData(client)).rejects.toThrow('Nicht alle Daten');
  expect(lifts).toHaveBeenCalledTimes(1);
});

it('versucht offline keine Netzwerkaktualisierung', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  const client = setup();
  const load = active(client, ['dashboard', 'weather']);
  await expect(refreshActiveData(client)).rejects.toThrow('offline');
  expect(load).not.toHaveBeenCalled();
});
