import { haversine } from './geo';
import { defaultGpsConfig } from './types';
import type { DropReason, GpsConfig, RawPoint } from './types';

export type CleanResult = {
  points: RawPoint[];
  dropped: Record<DropReason, number>;
  resyncs: number;
};

const emptyDropped = (): Record<DropReason, number> => ({
  invalid_coordinates: 0,
  null_island: 0,
  duplicate_time: 0,
  non_monotonic_time: 0,
  low_accuracy: 0,
  speed_jump: 0,
});

// Removes unusable fixes. Never invents points. A persistent position change
// (e.g. after losing the signal) is accepted as the new baseline after
// `resyncAfterJumps` consecutive "jumps" instead of dropping the rest of the day.
export function cleanPoints(
  input: readonly RawPoint[],
  config: GpsConfig = defaultGpsConfig,
): CleanResult {
  const dropped = emptyDropped();
  const points: RawPoint[] = [];
  let jumps = 0;
  let resyncs = 0;
  for (const p of input) {
    if (
      !Number.isFinite(p.t) ||
      !Number.isFinite(p.lat) ||
      !Number.isFinite(p.lon) ||
      Math.abs(p.lat) > 90 ||
      Math.abs(p.lon) > 180
    ) {
      dropped.invalid_coordinates++;
      continue;
    }
    if (Math.abs(p.lat) < 1e-6 && Math.abs(p.lon) < 1e-6) {
      dropped.null_island++;
      continue;
    }
    const last = points[points.length - 1];
    if (last) {
      if (p.t === last.t) {
        dropped.duplicate_time++;
        continue;
      }
      if (p.t < last.t) {
        dropped.non_monotonic_time++;
        continue;
      }
    }
    if (
      p.acc != null &&
      (!Number.isFinite(p.acc) || p.acc < 0 || p.acc > config.maxAccuracyM)
    ) {
      dropped.low_accuracy++;
      continue;
    }
    if (last) {
      const seconds = (p.t - last.t) / 1000;
      const distance = haversine(last.lat, last.lon, p.lat, p.lon);
      // Positional uncertainty of both fixes is not real movement.
      const slack = (p.acc ?? 0) + (last.acc ?? 0);
      if (Math.max(0, distance - slack) / seconds > config.maxSpeedMs) {
        jumps++;
        if (jumps < config.resyncAfterJumps) {
          dropped.speed_jump++;
          continue;
        }
        resyncs++;
      }
      jumps = 0;
    }
    points.push(p);
  }
  return { points, dropped, resyncs };
}
