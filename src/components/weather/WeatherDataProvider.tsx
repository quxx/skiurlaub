import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';

import { tripConfig } from '@/app/trip-config';
import { openMeteoProvider } from '@/data/weather/open-meteo-provider';
import type { WeatherData } from '@/data/weather/provider';
import { useTripMode } from '@/hooks/useTripMode';
import type { AsyncResource, DataEnvelope } from '@/types/data';

type WeatherResource = AsyncResource<DataEnvelope<WeatherData>>;

type WeatherContextValue = {
  resource: WeatherResource;
  reload: () => void;
};

const WeatherContext = createContext<WeatherContextValue | null>(null);

export function WeatherDataProvider({ children }: PropsWithChildren) {
  const tripMode = useTripMode(tripConfig);
  const [resource, setResource] = useState<WeatherResource>({ status: 'idle', data: null, error: null });
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setResource((current) => ({ status: 'loading', data: current.data, error: null }));

    void openMeteoProvider.getWeather(controller.signal).then(
      (data) => setResource({ status: 'success', data, error: null }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setResource((current) => ({
          status: 'error',
          data: current.data,
          error: error instanceof Error ? error : new Error('Wetterdaten konnten nicht geladen werden.'),
        }));
      },
    );

    return () => controller.abort();
  }, [reloadToken]);

  useEffect(() => {
    if (tripMode === 'afterTrip') return;
    const interval = window.setInterval(reload, 30 * 60 * 1_000);
    const handleOnline = () => reload();
    window.addEventListener('online', handleOnline);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', handleOnline);
    };
  }, [reload, tripMode]);

  return <WeatherContext.Provider value={{ resource, reload }}>{children}</WeatherContext.Provider>;
}

export function useWeatherData(): WeatherContextValue {
  const context = useContext(WeatherContext);
  if (!context) throw new Error('useWeatherData must be used inside WeatherDataProvider.');
  return context;
}
