import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';

import { tripConfig } from '@/app/trip-config';
import { statusLiveProvider } from '@/data/resort/status-live-provider';
import { useTripMode } from '@/hooks/useTripMode';
import type { AsyncResource, DataEnvelope } from '@/types/data';
import type { ResortStatus } from '@/types/resort';

type ResortResource = AsyncResource<DataEnvelope<ResortStatus>>;

type ResortContextValue = {
  resource: ResortResource;
  reload: () => void;
};

const ResortContext = createContext<ResortContextValue | null>(null);

export function ResortDataProvider({ children }: PropsWithChildren) {
  const tripMode = useTripMode(tripConfig);
  const [resource, setResource] = useState<ResortResource>({ status: 'idle', data: null, error: null });
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setResource((current) => ({ status: 'loading', data: current.data, error: null }));
    void statusLiveProvider.getStatus(controller.signal).then(
      (data) => setResource({ status: 'success', data, error: null }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setResource((current) => ({
          status: 'error',
          data: current.data,
          error: error instanceof Error ? error : new Error('Resortdaten konnten nicht geladen werden.'),
        }));
      },
    );
    return () => controller.abort();
  }, [reloadToken]);

  useEffect(() => {
    if (tripMode === 'afterTrip') return;
    const interval = window.setInterval(reload, 15 * 60 * 1_000);
    const handleOnline = () => reload();
    window.addEventListener('online', handleOnline);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', handleOnline);
    };
  }, [reload, tripMode]);

  return <ResortContext.Provider value={{ resource, reload }}>{children}</ResortContext.Provider>;
}

export function useResortData(): ResortContextValue {
  const context = useContext(ResortContext);
  if (!context) throw new Error('useResortData must be used inside ResortDataProvider.');
  return context;
}
