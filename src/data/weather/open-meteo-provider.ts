import { tripConfig } from '@/app/trip-config';
import type { WeatherData, WeatherProvider } from '@/data/weather/provider';
import type { DataEnvelope } from '@/types/data';

const endpoint = 'https://api.open-meteo.com/v1/forecast';
const sourceUrl = 'https://open-meteo.com/';
const cacheDurationMilliseconds = 30 * 60 * 1_000;
const cacheKey = `skitrip:open-meteo:v3:${tripConfig.weatherLocation.latitude}:${tripConfig.weatherLocation.longitude}`;

type OpenMeteoResponse = {
  utc_offset_seconds: number;
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    snow_depth: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_gusts_10m: number;
    is_day: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    snowfall_sum: number[];
    precipitation_probability_max: number[];
    sunrise: string[];
    sunset: string[];
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    apparent_temperature: number[];
    weather_code: number[];
    snowfall: number[];
    precipitation_probability: number[];
    wind_speed_10m: number[];
  };
};

type CachedWeather = {
  envelope: DataEnvelope<WeatherData>;
  storedAt: number;
};

function buildUrl(): string {
  const url = new URL(endpoint);
  const { latitude, longitude, elevation } = tripConfig.weatherLocation;
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('elevation', String(elevation));
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,snow_depth,weather_code,wind_speed_10m,wind_gusts_10m,is_day');
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,snowfall_sum,precipitation_probability_max,sunrise,sunset');
  url.searchParams.set('hourly', 'temperature_2m,apparent_temperature,weather_code,snowfall,precipitation_probability,wind_speed_10m');
  url.searchParams.set('timezone', tripConfig.timeZone);
  url.searchParams.set('forecast_days', '7');
  return url.toString();
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseResponse(value: unknown): OpenMeteoResponse {
  const response = value as Partial<OpenMeteoResponse>;
  const current = response.current;
  const daily = response.daily;
  const hourly = response.hourly;

  if (!current || !daily || !hourly || typeof current.time !== 'string' || !isFiniteNumber(response.utc_offset_seconds)) throw new Error('Open-Meteo-Antwort ist unvollständig.');
  const currentValues = [current.temperature_2m, current.apparent_temperature, current.snow_depth, current.weather_code, current.wind_speed_10m, current.wind_gusts_10m, current.is_day];
  if (!currentValues.every(isFiniteNumber)) throw new Error('Open-Meteo liefert ungültige aktuelle Wetterwerte.');

  const dailyArrays = [daily.time, daily.weather_code, daily.temperature_2m_max, daily.temperature_2m_min, daily.snowfall_sum, daily.precipitation_probability_max, daily.sunrise, daily.sunset];
  if (!dailyArrays.every(Array.isArray) || daily.time.length !== 7 || dailyArrays.some((entries) => entries.length !== daily.time.length)) {
    throw new Error('Open-Meteo liefert keine vollständige 7-Tage-Prognose.');
  }
  if (![daily.weather_code, daily.temperature_2m_max, daily.temperature_2m_min, daily.snowfall_sum, daily.precipitation_probability_max].flat().every(isFiniteNumber)) {
    throw new Error('Open-Meteo liefert ungültige Prognosewerte.');
  }

  const hourlyArrays = [hourly.time, hourly.temperature_2m, hourly.apparent_temperature, hourly.weather_code, hourly.snowfall, hourly.precipitation_probability, hourly.wind_speed_10m];
  if (!hourlyArrays.every(Array.isArray) || hourly.time.length < 24 || hourlyArrays.some((entries) => entries.length !== hourly.time.length)) {
    throw new Error('Open-Meteo liefert keine vollständige Stundenprognose.');
  }
  if (![hourly.temperature_2m, hourly.apparent_temperature, hourly.weather_code, hourly.snowfall, hourly.precipitation_probability, hourly.wind_speed_10m].flat().every(isFiniteNumber)) {
    throw new Error('Open-Meteo liefert ungültige Stundenwerte.');
  }
  return response as OpenMeteoResponse;
}

function normalize(response: OpenMeteoResponse): DataEnvelope<WeatherData> {
  const fetchedAt = new Date().toISOString();
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
      forecast: response.daily.time.map((date, index) => ({
        date,
        weatherCode: response.daily.weather_code[index],
        temperatureMinCelsius: response.daily.temperature_2m_min[index],
        temperatureMaxCelsius: response.daily.temperature_2m_max[index],
        snowfallCentimeters: response.daily.snowfall_sum[index],
        precipitationProbabilityPercent: response.daily.precipitation_probability_max[index],
        sunrise: response.daily.sunrise[index],
        sunset: response.daily.sunset[index],
      })),
      hourly: response.hourly.time.map((time, index) => ({
        time: withUtcOffset(time, response.utc_offset_seconds),
        temperatureCelsius: response.hourly.temperature_2m[index],
        apparentTemperatureCelsius: response.hourly.apparent_temperature[index],
        weatherCode: response.hourly.weather_code[index],
        snowfallCentimeters: response.hourly.snowfall[index],
        precipitationProbabilityPercent: response.hourly.precipitation_probability[index],
        windSpeedKmh: response.hourly.wind_speed_10m[index],
      })),
    },
    kind: 'model-forecast',
    sourceName: 'Open-Meteo',
    sourceUrl,
    observedAt: withUtcOffset(response.current.time, response.utc_offset_seconds),
    fetchedAt,
    freshness: 'fresh',
  };
}

function withUtcOffset(value: string, offsetSeconds: number): string {
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(value)) return value;
  const absoluteMinutes = Math.abs(Math.round(offsetSeconds / 60));
  const sign = offsetSeconds < 0 ? '-' : '+';
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, '0');
  const minutes = String(absoluteMinutes % 60).padStart(2, '0');
  return `${value}${sign}${hours}:${minutes}`;
}

function readCache(): CachedWeather | null {
  try {
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedWeather;
    if (!cached.envelope?.data || !Number.isFinite(cached.storedAt)) return null;
    return cached;
  } catch {
    return null;
  }
}

function writeCache(envelope: DataEnvelope<WeatherData>) {
  try {
    window.localStorage.setItem(cacheKey, JSON.stringify({ envelope, storedAt: Date.now() } satisfies CachedWeather));
  } catch {
    // Weather still works when storage is unavailable or full.
  }
}

export const openMeteoProvider: WeatherProvider = {
  async getWeather(signal) {
    const cached = readCache();
    if (cached && Date.now() - cached.storedAt < cacheDurationMilliseconds) return cached.envelope;

    try {
      const response = await fetch(buildUrl(), { signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Open-Meteo antwortet mit HTTP ${response.status}.`);
      const envelope = normalize(parseResponse(await response.json()));
      writeCache(envelope);
      return envelope;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (cached) return { ...cached.envelope, freshness: 'stale' };
      throw error instanceof Error ? error : new Error('Wetterdaten konnten nicht geladen werden.');
    }
  },
};
