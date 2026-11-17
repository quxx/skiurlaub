const dailyDates = Array.from(
  { length: 7 },
  (_, i) => `2027-01-${String(i + 10).padStart(2, '0')}`,
);
const values = (length: number, value: number) =>
  Array.from({ length }, () => value);
export function weatherResponse() {
  return {
    utc_offset_seconds: 3600,
    current: {
      time: Date.parse('2027-01-10T12:00:00+01:00') / 1000,
      temperature_2m: -3,
      apparent_temperature: -5,
      snow_depth: 0.4,
      weather_code: 71,
      wind_speed_10m: 10,
      wind_gusts_10m: 15,
      is_day: 1,
    },
    daily: {
      time: dailyDates.map(
        (date) => Date.parse(`${date}T00:00:00+01:00`) / 1000,
      ),
      weather_code: values(7, 71),
      temperature_2m_max: values(7, -1),
      temperature_2m_min: values(7, -6),
      snowfall_sum: values(7, 2),
      precipitation_probability_max: values(7, 50),
      sunrise: dailyDates.map((d) => Date.parse(`${d}T08:00:00+01:00`) / 1000),
      sunset: dailyDates.map((d) => Date.parse(`${d}T17:00:00+01:00`) / 1000),
    },
    hourly: {
      time: Array.from(
        { length: 24 },
        (_, i) => Date.parse('2027-01-10T00:00:00+01:00') / 1000 + i * 3600,
      ),
      temperature_2m: values(24, -3),
      apparent_temperature: values(24, -5),
      weather_code: values(24, 71),
      snowfall: values(24, 0.2),
      precipitation_probability: values(24, 50),
      wind_speed_10m: values(24, 10),
    },
  };
}
export const resortResponse = () => ({
  lifts: {
    state: 'reported',
    as_of: '2027-01-10T12:00:00Z',
    stale: false,
    counts: { open: 1, total: 2 },
    items: [{ name: 'Testlift', status: 'open' }],
    runs: {
      counts: { open_km: 1, total_km: 2, open: 1, total: 2 },
      items: [
        { name: 'Nr. 78 Testpiste', status: 'open', level: 'blue', km: 1 },
      ],
    },
  },
});
