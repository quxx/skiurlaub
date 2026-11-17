import { createContext, useContext } from 'react';
import type { PropsWithChildren } from 'react';
import { openMeteoProvider } from '@/data/weather/open-meteo-provider';
import { useRemoteResource } from '@/hooks/useRemoteResource';
import type { WeatherData } from '@/data/weather/provider';

type ContextValue = ReturnType<typeof useRemoteResource<WeatherData>>;
const WeatherContext = createContext<ContextValue | null>(null);
export function WeatherDataProvider({ children }: PropsWithChildren) {
  const value = useRemoteResource(
    'weather',
    openMeteoProvider.getWeather,
    30 * 60_000,
  );
  return (
    <WeatherContext.Provider value={value}>{children}</WeatherContext.Provider>
  );
}
export function useWeatherData(): ContextValue {
  const context = useContext(WeatherContext);
  if (!context) throw new Error('WeatherDataProvider missing');
  return context;
}
