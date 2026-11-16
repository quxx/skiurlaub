export type TripConfig = {
  destination: string;
  region: string;
  country: string;
  startsAt: string;
  endsAt: string | null;
  timeZone: string;
  weatherLocation: {
    latitude: number;
    longitude: number;
    elevation: number;
  };
};

function numberFromEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const tripConfig = {
  destination: 'Hochkrimml',
  region: 'Zillertal Arena',
  country: 'Österreich',
  startsAt: import.meta.env.VITE_TRIP_START ?? '2027-01-10T00:00:00+01:00',
  endsAt: import.meta.env.VITE_TRIP_END || null,
  timeZone: import.meta.env.VITE_TRIP_TIME_ZONE ?? 'Europe/Vienna',
  weatherLocation: {
    latitude: numberFromEnv(import.meta.env.VITE_OPEN_METEO_LATITUDE, 47.23678),
    longitude: numberFromEnv(import.meta.env.VITE_OPEN_METEO_LONGITUDE, 12.12685),
    elevation: numberFromEnv(import.meta.env.VITE_OPEN_METEO_ELEVATION, 1694),
  },
} satisfies TripConfig;
