import { z } from 'zod';
import { tripConfig } from '@/app/trip-config';
import type { WeatherData, WeatherProvider } from '@/data/weather/provider';
import type { DataEnvelope } from '@/types/data';
import {
  createRemoteProvider,
  ProviderError,
  sourceFreshness,
} from '@/data/remote';
import { localDateKey } from '@/data/date-time';

const timestamp = z.number().int().min(0).max(253402300799);
const weatherCode = z.number().int().min(0).max(99);
const percentage = z.number().min(0).max(100);
const nonnegative = z.number().nonnegative();
const dailySchema = z
  .object({
    time: z.array(timestamp).length(7),
    weather_code: z.array(weatherCode),
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
    snowfall_sum: z.array(nonnegative),
    precipitation_probability_max: z.array(percentage),
    sunrise: z.array(timestamp),
    sunset: z.array(timestamp),
  })
  .refine(
    (value) =>
      Object.values(value).every((array) => array.length === value.time.length),
    'Tagesreihen haben unterschiedliche Längen',
  );
const hourlySchema = z
  .object({
    time: z.array(timestamp).min(24).max(200),
    temperature_2m: z.array(z.number()),
    apparent_temperature: z.array(z.number()),
    weather_code: z.array(weatherCode),
    snowfall: z.array(nonnegative),
    precipitation_probability: z.array(percentage),
    wind_speed_10m: z.array(nonnegative),
  })
  .refine(
    (value) =>
      Object.values(value).every((array) => array.length === value.time.length),
    'Stundenreihen haben unterschiedliche Längen',
  )
  .refine(
    (value) =>
      value.time.every((time, i) => i === 0 || time > value.time[i - 1]),
    'Stunden sind nicht aufsteigend',
  );
export const openMeteoSchema = z
  .object({
    utc_offset_seconds: z.number().int().min(-50400).max(50400),
    current: z.object({
      time: timestamp,
      temperature_2m: z.number(),
      apparent_temperature: z.number(),
      snow_depth: nonnegative,
      weather_code: weatherCode,
      wind_speed_10m: nonnegative,
      wind_gusts_10m: nonnegative,
      is_day: z.union([z.literal(0), z.literal(1)]),
    }),
    daily: dailySchema,
    hourly: hourlySchema,
  })
  .refine(
    (value) =>
      value.daily.time.every(
        (time, i) =>
          (i === 0 || time > value.daily.time[i - 1]) &&
          value.daily.temperature_2m_min[i] <=
            value.daily.temperature_2m_max[i],
      ),
    'Ungültige Tageswerte',
  );
type OpenMeteoResponse = z.infer<typeof openMeteoSchema>;

export function buildWeatherUrl(model?: string): string {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  const { latitude, longitude, elevation } = tripConfig.weatherLocation;
  for (const [key, value] of Object.entries({
    latitude,
    longitude,
    elevation,
    timezone: tripConfig.timeZone,
    forecast_days: 7,
    timeformat: 'unixtime',
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
    ...(model ? { models: model } : {}),
    current:
      'temperature_2m,apparent_temperature,snow_depth,weather_code,wind_speed_10m,wind_gusts_10m,is_day',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,snowfall_sum,precipitation_probability_max,sunrise,sunset',
    hourly:
      'temperature_2m,apparent_temperature,weather_code,snowfall,precipitation_probability,wind_speed_10m',
  }))
    url.searchParams.set(key, String(value));
  return url.toString();
}
const iso = (time: number) => new Date(time * 1000).toISOString();

function normalize(
  response: OpenMeteoResponse,
  fetchedAt: string,
): DataEnvelope<WeatherData> {
  const observedAt = iso(response.current.time);
  return {
    data: {
      current: {
        temperatureCelsius: response.current.temperature_2m,
        apparentTemperatureCelsius: response.current.apparent_temperature,
        snowDepthCentimeters: response.current.snow_depth * 100,
        weatherCode: response.current.weather_code,
        windSpeedKmh: response.current.wind_speed_10m,
        windGustsKmh: response.current.wind_gusts_10m,
        isDay: response.current.is_day === 1,
      },
      forecast: response.daily.time.map((time, i) => ({
        // Daily boundaries in this API use the fixed request offset; hourly timestamps are absolute.
        date: new Date((time + response.utc_offset_seconds) * 1000)
          .toISOString()
          .slice(0, 10),
        weatherCode: response.daily.weather_code[i],
        temperatureMinCelsius: response.daily.temperature_2m_min[i],
        temperatureMaxCelsius: response.daily.temperature_2m_max[i],
        snowfallCentimeters: response.daily.snowfall_sum[i],
        precipitationProbabilityPercent:
          response.daily.precipitation_probability_max[i],
        sunrise: iso(response.daily.sunrise[i]),
        sunset: iso(response.daily.sunset[i]),
      })),
      hourly: response.hourly.time.map((time, i) => ({
        time: iso(time),
        temperatureCelsius: response.hourly.temperature_2m[i],
        apparentTemperatureCelsius: response.hourly.apparent_temperature[i],
        weatherCode: response.hourly.weather_code[i],
        snowfallCentimeters: response.hourly.snowfall[i],
        precipitationProbabilityPercent:
          response.hourly.precipitation_probability[i],
        windSpeedKmh: response.hourly.wind_speed_10m[i],
      })),
    },
    kind: 'model-forecast',
    sourceName: 'Open-Meteo',
    sourceUrl: 'https://open-meteo.com/',
    observedAt,
    fetchedAt,
    freshness: sourceFreshness(observedAt, 3 * 60 * 60_000),
  };
}

const cacheBase = `${tripConfig.weatherLocation.latitude}:${tripConfig.weatherLocation.longitude}:${tripConfig.weatherLocation.elevation}:${tripConfig.timeZone}`;
const shared = {
  schema: openMeteoSchema,
  ttl: 30 * 60_000,
  maxCacheAge: 48 * 60 * 60_000,
  normalize,
};

// GeoSphere Austria (the national weather service; 1 km model for the first days, then ECMWF)
// was clearly closer to the measurements at the Krimml station than Open-Meteo's default
// model in a 48 h check (see docs/phase-5-wetterdaten.md). Open-Meteo's default model is the
// fallback if the GeoSphere request fails.
const GEOSPHERE_MODEL = 'geosphere_seamless';
const geosphere = createRemoteProvider({
  ...shared,
  key: `skiurlaub:weather:geosphere:v1:${cacheBase}`,
  url: () => buildWeatherUrl(GEOSPHERE_MODEL),
});
const defaultModel = createRemoteProvider({
  ...shared,
  key: `skiurlaub:weather:v4:${cacheBase}`,
  url: () => buildWeatherUrl(),
});

export const openMeteoProvider: WeatherProvider = {
  getWeather: async (signal, options) => {
    try {
      return await geosphere(signal, options);
    } catch (error) {
      // Rate limits and cancellations must not trigger a second request.
      if (signal?.aborted || (error instanceof ProviderError && error.retryAt))
        throw error;
      return defaultModel(signal, options);
    }
  },
};
export function weatherLocalDate(time: string) {
  return localDateKey(time, tripConfig.timeZone);
}
