import type { DataEnvelope } from '@/types/data';
import type { DailyForecast, HourlyForecast, WeatherSnapshot } from '@/types/weather';

export type WeatherData = {
  current: WeatherSnapshot;
  forecast: DailyForecast[];
  hourly: HourlyForecast[];
};

export interface WeatherProvider {
  getWeather(signal?: AbortSignal): Promise<DataEnvelope<WeatherData>>;
}
