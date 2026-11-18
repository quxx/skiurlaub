import { EARTH_RADIUS_M } from './geo';
import type { RawPoint } from './types';

// Synthetic ski tracks for tests and demos. Everything here is invented.
export type Leg =
  | { kind: 'pause'; durationS: number }
  | { kind: 'lift'; durationS: number; climbM: number; speedMs?: number }
  | { kind: 'run'; durationS: number; dropM: number; speedMs?: number }
  | { kind: 'walk'; durationS: number; speedMs?: number }
  | { kind: 'gap'; durationS: number };

export type SynthOptions = {
  seed?: number;
  intervalS?: number;
  accM?: number;
  altNoiseM?: number;
  withBaro?: boolean;
  startT?: number;
  lat?: number;
  lon?: number;
  alt?: number;
  bearingDeg?: number;
};

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function synthesizeTrack(
  legs: readonly Leg[],
  options: SynthOptions = {},
): RawPoint[] {
  const random = rng(options.seed ?? 1);
  const gauss = () =>
    Math.sqrt(-2 * Math.log(random() || 1e-9)) *
    Math.cos(2 * Math.PI * random());
  const interval = options.intervalS ?? 5;
  const acc = options.accM ?? 8;
  const altNoise = options.altNoiseM ?? 3;
  const bearing = ((options.bearingDeg ?? 60) * Math.PI) / 180;
  let t = options.startT ?? Date.UTC(2027, 0, 10, 8, 0, 0);
  let north = 0;
  let east = 0;
  let alt = options.alt ?? 1700;
  const lat0 = options.lat ?? 47.2367;
  const lon0 = options.lon ?? 12.1268;
  const metersPerDegree = (Math.PI / 180) * EARTH_RADIUS_M;
  const points: RawPoint[] = [];

  const emit = () => {
    const p: RawPoint = {
      t,
      lat: lat0 + (north + (gauss() * acc) / 2) / metersPerDegree,
      lon:
        lon0 +
        (east + (gauss() * acc) / 2) /
          (metersPerDegree * Math.cos((lat0 * Math.PI) / 180)),
      alt: alt + gauss() * altNoise,
      acc,
      vacc: altNoise * 2,
    };
    if (options.withBaro)
      p.pressureHpa = 1013.25 * (1 - alt / 44330) ** 5.255 + gauss() * 0.03;
    points.push(p);
  };

  emit();
  for (const leg of legs) {
    const steps = Math.max(1, Math.floor(leg.durationS / interval));
    if (leg.kind === 'gap') {
      t += leg.durationS * 1000;
      continue;
    }
    for (let i = 0; i < steps; i++) {
      t += interval * 1000;
      let heading = bearing;
      let speed = 0;
      let dAlt = 0;
      if (leg.kind === 'lift') {
        speed = leg.speedMs ?? 4;
        dAlt = leg.climbM / steps;
      } else if (leg.kind === 'run') {
        heading = bearing + Math.PI;
        speed = leg.speedMs ?? 7;
        dAlt = -leg.dropM / steps;
      } else if (leg.kind === 'walk') {
        heading = bearing + Math.PI / 2;
        speed = leg.speedMs ?? 1.3;
      }
      north += Math.cos(heading) * speed * interval;
      east += Math.sin(heading) * speed * interval;
      alt += dAlt;
      emit();
    }
  }
  return points;
}

// A typical lap pattern: lift up, short pause at the top, run down.
export function skiDayLegs(laps = 3): Leg[] {
  const legs: Leg[] = [{ kind: 'pause', durationS: 300 }];
  for (let i = 0; i < laps; i++)
    legs.push(
      { kind: 'lift', durationS: 300, climbM: 300 },
      { kind: 'pause', durationS: 120 },
      { kind: 'run', durationS: 240, dropM: 300 },
      { kind: 'pause', durationS: 60 },
    );
  return legs;
}
