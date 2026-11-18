import { z } from 'zod';

// Battery log of a recording, written by the native recorder in debug builds only (for the
// battery acceptance test, see docs/gps-battery-test.md). Not part of the release.
export const batterySampleSchema = z.object({
  t: z.number(),
  pct: z.number().min(0).max(100),
  charging: z.boolean(),
  tempC: z.number().optional(),
  reason: z.string(),
});
export type BatterySample = z.infer<typeof batterySampleSchema>;

export type BatterySummary = {
  startPct: number;
  endPct: number;
  /** Percentage points lost (negative if the phone charged). */
  dropPoints: number;
  minutes: number;
  /** Percentage points per hour; null for very short recordings (1 % resolution). */
  perHour: number | null;
  /** True if the phone was on a charger at any sample: the measurement is not meaningful. */
  charged: boolean;
  maxTempC: number | null;
};

export function summarizeBattery(
  samples: readonly BatterySample[],
): BatterySummary | null {
  if (samples.length < 2) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const minutes = (last.t - first.t) / 60_000;
  if (minutes <= 0) return null;
  const dropPoints = first.pct - last.pct;
  const temps = samples.flatMap((s) => (s.tempC == null ? [] : [s.tempC]));
  return {
    startPct: first.pct,
    endPct: last.pct,
    dropPoints,
    minutes,
    perHour: minutes >= 10 ? dropPoints / (minutes / 60) : null,
    charged: samples.some((s) => s.charging),
    maxTempC: temps.length ? Math.max(...temps) : null,
  };
}
