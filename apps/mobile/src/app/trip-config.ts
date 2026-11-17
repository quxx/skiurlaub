import { z } from 'zod';

export const tripConfigSchema = z
  .object({
    destination: z.string().min(1),
    region: z.string().min(1),
    country: z.string().min(1),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }).nullable(),
    timeZone: z.string().refine((value) => {
      try {
        new Intl.DateTimeFormat('de', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, 'Ungültige Zeitzone'),
    weatherLocation: z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      elevation: z.number().finite(),
    }),
  })
  .refine(
    (value) =>
      value.endsAt === null ||
      Date.parse(value.endsAt) > Date.parse(value.startsAt),
    'Reiseende muss nach Reisebeginn liegen',
  );

export type TripConfig = z.infer<typeof tripConfigSchema>;

function numberFromEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;

  const parsed = Number(value);
  return parsed;
}

export const tripConfig = tripConfigSchema.parse({
  destination: 'Hochkrimml',
  region: 'Zillertal Arena',
  country: 'Österreich',
  startsAt: import.meta.env.VITE_TRIP_START ?? '2027-01-10T00:00:00+01:00',
  endsAt: import.meta.env.VITE_TRIP_END || null,
  timeZone: import.meta.env.VITE_TRIP_TIME_ZONE ?? 'Europe/Vienna',
  weatherLocation: {
    latitude: numberFromEnv(import.meta.env.VITE_OPEN_METEO_LATITUDE, 47.23678),
    longitude: numberFromEnv(
      import.meta.env.VITE_OPEN_METEO_LONGITUDE,
      12.12685,
    ),
    elevation: numberFromEnv(import.meta.env.VITE_OPEN_METEO_ELEVATION, 1694),
  },
} satisfies TripConfig);
