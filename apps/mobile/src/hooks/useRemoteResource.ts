import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { tripConfig } from '@/app/trip-config';
import { useTripMode } from '@/hooks/useTripMode';
import type { RefreshOptions } from '@/data/remote';
import { sourceFreshness } from '@/data/remote';
import type { AsyncResource, DataEnvelope } from '@/types/data';

export function useRemoteResource<T>(
  key: string,
  load: (
    signal?: AbortSignal,
    options?: RefreshOptions,
  ) => Promise<DataEnvelope<T>>,
  interval: number,
) {
  const mode = useTripMode(tripConfig);
  const force = useRef(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const query = useQuery({
    queryKey: ['dashboard', key],
    queryFn: ({ signal, client, queryKey }) => {
      const options = {
        force:
          force.current ||
          client.getQueryState(queryKey)?.isInvalidated === true,
      };
      force.current = false;
      return load(signal, options);
    },
    staleTime: interval,
    retry: false,
    networkMode: 'always',
    refetchInterval: mode === 'afterTrip' ? false : interval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: mode === 'afterTrip' ? false : 'always',
  });
  const lastAttempt = Math.max(query.dataUpdatedAt, query.errorUpdatedAt);
  const canReload = !query.isFetching && now >= lastAttempt + 60_000;
  const reload = () => {
    if (!canReload) return;
    force.current = true;
    void query.refetch();
  };
  let data = query.data ?? null;
  if (
    data &&
    (query.isError ||
      sourceFreshness(
        data.observedAt,
        key === 'weather' ? 3 * 60 * 60_000 : 2 * 60 * 60_000,
        now,
      ) === 'stale' ||
      (data.fetchedAt && now - Date.parse(data.fetchedAt) > interval))
  ) {
    data = { ...data, freshness: 'stale' };
  }
  const resource: AsyncResource<DataEnvelope<T>> = query.isError
    ? { status: 'error', data, error: query.error }
    : query.isFetching || !data
      ? { status: 'loading', data, error: null }
      : { status: 'success', data, error: null };
  return { resource, reload, canReload };
}
