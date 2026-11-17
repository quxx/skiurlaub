import { expect, it, vi } from 'vitest';
import { modelSnowProvider } from './provider';

it('behält Quelle und Aktualität bei und erfindet keine Berg-/Talmesswerte', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2027-01-11T00:30:00+01:00'));
  const snow = modelSnowProvider.fromWeather({
    data: {
      current: {
        temperatureCelsius: -2,
        apparentTemperatureCelsius: -4,
        snowDepthCentimeters: 40,
        weatherCode: 71,
        windSpeedKmh: 10,
        windGustsKmh: 15,
        isDay: false,
      },
      forecast: [
        {
          date: '2027-01-10',
          weatherCode: 71,
          temperatureMinCelsius: -5,
          temperatureMaxCelsius: -1,
          snowfallCentimeters: 8,
          precipitationProbabilityPercent: 30,
          sunrise: '',
          sunset: '',
        },
      ],
      hourly: [],
    },
    kind: 'model-forecast',
    sourceName: 'Open-Meteo',
    sourceUrl: 'https://open-meteo.com/',
    observedAt: '2027-01-10T12:00:00Z',
    fetchedAt: '2027-01-10T12:01:00Z',
    freshness: 'stale',
  });
  expect(snow.freshness).toBe('stale');
  expect(snow.data).toMatchObject({
    modelDepthCentimeters: 40,
    forecastSnowfallCentimeters: null,
    mountainCentimeters: null,
    valleyCentimeters: null,
  });
  vi.useRealTimers();
});
