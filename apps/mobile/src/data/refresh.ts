import type { QueryClient } from '@tanstack/react-query';

export async function refreshActiveData(client: QueryClient): Promise<string> {
  if (!navigator.onLine)
    throw new Error('Du bist offline. Gespeicherte Daten bleiben verfügbar.');
  const queries = client.getQueryCache().findAll({
    type: 'active',
    predicate: (query) =>
      ['dashboard', 'private', 'auth'].includes(String(query.queryKey[0])),
  });
  if (!queries.length)
    return 'Hier sind noch keine Daten zum Aktualisieren verfügbar.';
  const now = Date.now();
  const ready = queries.filter(
    (query) =>
      query.queryKey[0] !== 'dashboard' ||
      now >=
        Math.max(query.state.dataUpdatedAt, query.state.errorUpdatedAt) +
          60_000,
  );
  if (!ready.length) {
    const seconds = Math.max(
      1,
      Math.ceil(
        Math.min(
          ...queries.map(
            (query) =>
              Math.max(query.state.dataUpdatedAt, query.state.errorUpdatedAt) +
              60_000 -
              now,
          ),
        ) / 1000,
      ),
    );
    return `Daten sind gerade geladen. Erneut aktualisieren in ${seconds} Sekunden.`;
  }
  await client.invalidateQueries(
    { predicate: (query) => ready.includes(query), refetchType: 'active' },
    { cancelRefetch: false },
  );
  const failed = ready.some(
    (query) =>
      query.state.status === 'error' ||
      (query.state.data as { refreshError?: string } | undefined)?.refreshError,
  );
  if (failed)
    throw new Error(
      'Nicht alle Daten konnten aktualisiert werden. Gespeicherte Werte bleiben sichtbar.',
    );
  return ready.length < queries.length
    ? 'Daten aktualisiert. Kürzlich geladene Quellen wurden übersprungen.'
    : 'Daten aktualisiert.';
}
