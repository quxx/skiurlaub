import { pressureToAltitude } from './geo';
import { defaultGpsConfig } from './types';
import type { GpsConfig, RawPoint } from './types';

export type AltitudeSource = 'baro' | 'gps' | 'none';

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const validAlt = (value: number | null | undefined): value is number =>
  value != null && Number.isFinite(value);

// Altitude per point. With a barometer (>= 80 % of points) the pressure changes
// drive the climb (low noise) and GPS slowly corrects drift (complementary
// filter). Without it GPS altitude is median-filtered and smoothed.
export function fuseAltitude(
  points: readonly RawPoint[],
  config: GpsConfig = defaultGpsConfig,
): { alt: number[]; source: AltitudeSource } {
  const count = points.length;
  const gps = points.map((p) => (validAlt(p.alt) ? p.alt : null));
  const baro = points.map((p) =>
    validAlt(p.pressureHpa) && p.pressureHpa > 300 && p.pressureHpa < 1100
      ? pressureToAltitude(p.pressureHpa)
      : null,
  );
  const baroShare = count ? baro.filter((v) => v != null).length / count : 0;
  const gpsShare = count ? gps.filter((v) => v != null).length / count : 0;

  if (baroShare >= 0.8) {
    const alt: number[] = [];
    let previousBaro: number | null = null;
    for (let i = 0; i < count; i++) {
      const b = baro[i];
      if (i === 0) {
        alt.push(gps[0] ?? b ?? 0);
        previousBaro = b;
        continue;
      }
      const seconds = (points[i].t - points[i - 1].t) / 1000;
      const climb = b != null && previousBaro != null ? b - previousBaro : 0;
      const predicted = alt[i - 1] + climb;
      const g = gps[i];
      const vacc = points[i].vacc;
      if (g != null && (vacc == null || vacc <= 30)) {
        const gain = Math.min(0.2, config.baroGpsGainPerSec * seconds);
        alt.push(predicted + gain * (g - predicted));
      } else alt.push(predicted);
      if (b != null) previousBaro = b;
    }
    return { alt, source: 'baro' };
  }

  if (gpsShare > 0) {
    // Fill gaps (carry forward, back-fill the start), then median(5) + EMA.
    const filled: number[] = [];
    let carry = gps.find((v) => v != null) ?? 0;
    for (const v of gps) {
      if (v != null) carry = v;
      filled.push(carry);
    }
    const med = filled.map((_, i) =>
      median(filled.slice(Math.max(0, i - 2), Math.min(count, i + 3))),
    );
    const alt: number[] = [];
    for (let i = 0; i < count; i++)
      alt.push(i === 0 ? med[0] : alt[i - 1] + 0.3 * (med[i] - alt[i - 1]));
    return { alt, source: 'gps' };
  }
  return { alt: new Array<number>(count).fill(0), source: 'none' };
}

// Sums climbs and descents while ignoring noise smaller than the deadband.
export function accumulateVertical(
  alt: readonly number[],
  from: number,
  to: number,
  deadband: number,
): { up: number; down: number } {
  let up = 0;
  let down = 0;
  let reference = alt[from];
  for (let i = from + 1; i <= to; i++) {
    const delta = alt[i] - reference;
    if (Math.abs(delta) >= deadband) {
      if (delta > 0) up += delta;
      else down += -delta;
      reference = alt[i];
    }
  }
  return { up, down };
}
