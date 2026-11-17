import { expect, it } from 'vitest';
import { tripConfig, tripConfigSchema } from './trip-config';

it('validiert Reisegrenzen, Zeitzone und geografische Koordinaten', () => {
  expect(
    tripConfigSchema.safeParse({ ...tripConfig, endsAt: null }).success,
  ).toBe(true);
  for (const patch of [
    { startsAt: 'invalid' },
    { endsAt: tripConfig.startsAt },
    { timeZone: 'unknown/zone' },
    { weatherLocation: { ...tripConfig.weatherLocation, latitude: 91 } },
    {
      weatherLocation: { ...tripConfig.weatherLocation, longitude: Number.NaN },
    },
  ])
    expect(
      tripConfigSchema.safeParse({ ...tripConfig, ...patch }).success,
    ).toBe(false);
});
