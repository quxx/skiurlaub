import type { DataEnvelope } from '@/types/data';
import type { WeatherData } from '@/data/weather/provider';
import { tripConfig } from '@/app/trip-config';
import { localDateKey } from '@/data/date-time';

export const officialSnowReport =
  'https://www.zillertalarena.com/info-service/livecams-wetter/schneebericht/';
export type SnowData = {
  modelDepthCentimeters: number;
  forecastSnowfallCentimeters: number | null;
  elevation: number;
  mountainCentimeters: number | null;
  valleyCentimeters: number | null;
};
export interface SnowProvider {
  fromWeather(weather: DataEnvelope<WeatherData>): DataEnvelope<SnowData>;
}
// Shares the validated weather response rather than making a duplicate API call.
// Measured mountain/valley values stay unavailable until a permitted source exists.
export const modelSnowProvider: SnowProvider = {
  fromWeather: (weather) => ({
    ...weather,
    data: weather.data
      ? {
          modelDepthCentimeters: weather.data.current.snowDepthCentimeters,
          forecastSnowfallCentimeters:
            weather.data.forecast.find(
              (day) =>
                day.date === localDateKey(Date.now(), tripConfig.timeZone),
            )?.snowfallCentimeters ?? null,
          elevation: tripConfig.weatherLocation.elevation,
          mountainCentimeters: null,
          valleyCentimeters: null,
        }
      : null,
  }),
};
