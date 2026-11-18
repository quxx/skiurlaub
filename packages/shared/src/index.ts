import { z } from 'zod';

export const emailSchema = z
  .email()
  .max(254)
  .transform((value) => value.trim().toLowerCase());
export const requestCodeSchema = z
  .object({ email: z.string().trim().pipe(emailSchema) })
  .strict();
export const verifyCodeSchema = z
  .object({ challengeId: z.uuid(), code: z.string().regex(/^\d{8}$/) })
  .strict();
export const googleVerifySchema = z
  .object({
    challengeId: z.uuid(),
    idToken: z.string().min(1).max(12000),
  })
  .strict();
export const profileUpdateSchema = z
  .object({ displayName: z.string().trim().min(1).max(60) })
  .strict();
export const userSchema = z.object({
  id: z.uuid(),
  email: emailSchema,
  displayName: z.string(),
  sessionExpiresAt: z.iso.datetime(),
});
export type AppUser = z.infer<typeof userSchema>;
export const authStatusSchema = z.object({
  skiline: z.literal('unavailable'),
  google: z.boolean().default(false),
  appEmailCode: z.boolean(),
  localTestMode: z.boolean(),
});
export type AuthStatus = z.infer<typeof authStatusSchema>;
export const challengeSchema = z.object({
  challengeId: z.uuid(),
  expiresIn: z.number().int(),
  message: z.string(),
});

// ---- Skiing days (Phase 4) -------------------------------------------------
// DTOs never contain provider ids, ticket numbers, raw payloads or other users' data.
export const importRejectReasonSchema = z.enum([
  'invalid_record',
  'invalid_date',
  'data_too_large',
  'data_invalid_json',
  'data_invalid_shape',
]);
export const importReportSchema = z.object({
  jobId: z.uuid(),
  total: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  duplicatesInPayload: z.number().int().nonnegative(),
  rejected: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      reason: importRejectReasonSchema,
    }),
  ),
});
export type ImportReport = z.infer<typeof importReportSchema>;
export const skiingDaySchema = z.object({
  id: z.uuid(),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.enum(['skiline', 'import']),
  resort: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  verticalMeters: z.number().nonnegative(),
  liftCount: z.number().int().nonnegative(),
  // The provider unit is not verified yet; consumers must not convert 'unknown'.
  slopeDistance: z.object({
    value: z.number().nonnegative(),
    unit: z.enum(['unknown', 'm', 'km']),
  }),
  syncedAt: z.iso.datetime(),
});
export type SkiingDay = z.infer<typeof skiingDaySchema>;
export const skiingDaysResponseSchema = z.object({
  days: z.array(skiingDaySchema),
  lastImport: z
    .object({
      at: z.iso.datetime(),
      state: z.enum(['queued', 'running', 'succeeded', 'failed']),
    })
    .nullable(),
});
export type SkiingDaysResponse = z.infer<typeof skiingDaysResponseSchema>;

// ---- GPS tracks (optional module) ------------------------------------------
const bounded = (max: number) => z.number().finite().nonnegative().max(max);
export const gpsStatsSchema = z
  .object({
    durationS: bounded(7 * 86_400),
    movingS: bounded(7 * 86_400),
    pauseS: bounded(7 * 86_400),
    gapS: bounded(7 * 86_400),
    distanceM: bounded(2_000_000),
    runDistanceM: bounded(2_000_000),
    liftDistanceM: bounded(2_000_000),
    liftAscentM: bounded(100_000),
    runDescentM: bounded(100_000),
    liftCount: z.number().int().nonnegative().max(1000),
    runCount: z.number().int().nonnegative().max(1000),
    maxSpeedMs: bounded(100),
    avgRunSpeedMs: bounded(100),
    minAltM: z.number().finite().min(-500).max(9000).nullable(),
    maxAltM: z.number().finite().min(-500).max(9000).nullable(),
    pointCount: z.number().int().nonnegative().max(200_000),
    quality: z.enum(['high', 'medium', 'low']),
  })
  .strict();
export type GpsStats = z.infer<typeof gpsStatsSchema>;
export const gpsTrackUploadSchema = z
  .object({
    startedAt: z.number().int().positive(),
    endedAt: z.number().int().positive().nullable(),
    pointCount: z.number().int().min(2).max(200_000),
    altRef: z.enum(['msl', 'ellipsoid']).nullable(),
    algorithmVersion: z.number().int().min(1).max(1000),
    stats: gpsStatsSchema,
    // gzip-compressed binary track (packages/gps codec), base64-encoded.
    data: z.string().min(1).max(1_400_000),
  })
  .strict();
export type GpsTrackUpload = z.infer<typeof gpsTrackUploadSchema>;
export const gpsTrackSummarySchema = z.object({
  id: z.uuid(),
  clientTrackId: z.uuid(),
  startedAt: z.number().int(),
  endedAt: z.number().int().nullable(),
  pointCount: z.number().int(),
  stats: gpsStatsSchema,
  createdAt: z.iso.datetime(),
  revision: z.number().int(),
});
export type GpsTrackSummary = z.infer<typeof gpsTrackSummarySchema>;
export const gpsTracksResponseSchema = z.object({
  tracks: z.array(gpsTrackSummarySchema),
});
