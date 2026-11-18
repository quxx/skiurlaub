import { accumulateVertical, fuseAltitude } from './altitude';
import type { AltitudeSource } from './altitude';
import { cleanPoints } from './clean';
import { haversine } from './geo';
import { defaultGpsConfig } from './types';
import type {
  AnalyzedPoint,
  DropReason,
  GpsConfig,
  Quality,
  RawPoint,
  Segment,
  SegmentKind,
} from './types';

// Bump when thresholds or the algorithm change so stored results can be recomputed.
export const ALGORITHM_VERSION = 1;

export type TrackStats = {
  startT: number | null;
  endT: number | null;
  durationS: number;
  movingS: number;
  pauseS: number;
  gapS: number;
  distanceM: number;
  runDistanceM: number;
  liftDistanceM: number;
  /** Sum of climbs during lift segments: the Skiline-like "Höhenmeter". */
  liftAscentM: number;
  /** Sum of descents during runs. */
  runDescentM: number;
  liftCount: number;
  runCount: number;
  maxSpeedMs: number;
  avgRunSpeedMs: number;
  minAltM: number | null;
  maxAltM: number | null;
  pointCount: number;
  droppedCount: number;
  quality: Quality;
};

export type TrackAnalysis = {
  algorithmVersion: number;
  points: AnalyzedPoint[];
  segments: Segment[];
  stats: TrackStats;
  dropped: Record<DropReason, number>;
  resyncs: number;
  altitudeSource: AltitudeSource;
  warnings: string[];
};

type Step = { kind: SegmentKind; a: number; b: number }; // step range, inclusive

function smoothPositions(points: readonly RawPoint[], maxStepSec: number) {
  const lat = points.map((p) => p.lat);
  const lon = points.map((p) => p.lon);
  for (let i = 1; i < points.length - 1; i++) {
    const near =
      points[i].t - points[i - 1].t <= maxStepSec * 1000 &&
      points[i + 1].t - points[i].t <= maxStepSec * 1000;
    if (!near) continue;
    lat[i] = (points[i - 1].lat + 2 * points[i].lat + points[i + 1].lat) / 4;
    lon[i] = (points[i - 1].lon + 2 * points[i].lon + points[i + 1].lon) / 4;
  }
  return { lat, lon };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function classify(vh: number, vv: number, config: GpsConfig): SegmentKind {
  if (vh < config.pauseSpeedMs) return 'pause';
  if (
    vv >= config.liftMinVerticalMs &&
    vh >= config.liftMinHorizontalMs &&
    vh <= config.liftMaxHorizontalMs
  )
    return 'lift';
  if (vv <= -config.runMinDescentMs && vh >= config.runMinHorizontalMs)
    return 'run';
  if (vh >= config.flatMinHorizontalMs) return 'flat';
  return 'pause';
}

function coalesce(steps: Step[]): Step[] {
  const out: Step[] = [];
  for (const step of steps) {
    const last = out[out.length - 1];
    if (last && last.kind === step.kind) last.b = step.b;
    else out.push({ ...step });
  }
  return out;
}

export function analyzeTrack(
  input: readonly RawPoint[],
  config: GpsConfig = defaultGpsConfig,
): TrackAnalysis {
  const cleaned = cleanPoints(input, config);
  const raw = cleaned.points;
  const { alt, source } = fuseAltitude(raw, config);
  const { lat, lon } = smoothPositions(raw, config.maxStepSec);
  const t = raw.map((p) => p.t);
  const droppedCount = Object.values(cleaned.dropped).reduce(
    (sum, n) => sum + n,
    0,
  );
  const points: AnalyzedPoint[] = raw.map((p, i) => ({
    t: p.t,
    lat: lat[i],
    lon: lon[i],
    alt: alt[i],
  }));

  const empty: TrackStats = {
    startT: raw.length ? t[0] : null,
    endT: raw.length ? t[raw.length - 1] : null,
    durationS: raw.length ? (t[raw.length - 1] - t[0]) / 1000 : 0,
    movingS: 0,
    pauseS: 0,
    gapS: 0,
    distanceM: 0,
    runDistanceM: 0,
    liftDistanceM: 0,
    liftAscentM: 0,
    runDescentM: 0,
    liftCount: 0,
    runCount: 0,
    maxSpeedMs: 0,
    avgRunSpeedMs: 0,
    minAltM: source === 'none' || !raw.length ? null : Math.min(...alt),
    maxAltM: source === 'none' || !raw.length ? null : Math.max(...alt),
    pointCount: raw.length,
    droppedCount,
    quality: 'low',
  };
  const warnings: string[] = [];
  if (droppedCount > 0.2 * (raw.length + droppedCount) && droppedCount > 5)
    warnings.push('many_points_dropped');
  if (source === 'none') warnings.push('no_altitude');
  if (raw.length < config.minPointsForStats) {
    warnings.push('too_few_points');
    return {
      algorithmVersion: ALGORITHM_VERSION,
      points,
      segments: [],
      stats: empty,
      dropped: cleaned.dropped,
      resyncs: cleaned.resyncs,
      altitudeSource: source,
      warnings,
    };
  }

  // Split at signal gaps so no window, speed or distance spans missing data.
  const chunks: Array<[number, number]> = [];
  let start = 0;
  let gapS = 0;
  for (let i = 1; i < raw.length; i++) {
    const seconds = (t[i] - t[i - 1]) / 1000;
    if (seconds > config.gapSec) {
      chunks.push([start, i - 1]);
      gapS += seconds;
      start = i;
    }
  }
  chunks.push([start, raw.length - 1]);

  const segments: Segment[] = [];
  const half = (config.windowSec * 1000) / 2;
  for (const [first, last] of chunks) {
    if (last - first < 2) continue;
    const stepKinds: SegmentKind[] = [];
    let lo = first;
    let hi = first;
    for (let i = first; i < last; i++) {
      while (lo < i && t[lo] < t[i] - half) lo++;
      if (hi < i) hi = i;
      while (hi < last && t[hi] < t[i] + half) hi++;
      const seconds = (t[hi] - t[lo]) / 1000;
      if (hi === lo || seconds < 2) {
        stepKinds.push('pause');
        continue;
      }
      const distance = haversine(lat[lo], lon[lo], lat[hi], lon[hi]);
      // Standing still looks like movement within the accuracy radius.
      const slack = 0.5 * ((raw[lo].acc ?? 5) + (raw[hi].acc ?? 5));
      const vh = Math.max(0, distance - slack) / seconds;
      const vv = (alt[hi] - alt[lo]) / seconds;
      stepKinds.push(
        source === 'none' && vh >= 1 ? 'flat' : classify(vh, vv, config),
      );
    }

    const durationOf = (s: Step) =>
      (t[first + s.b + 1] - t[first + s.a]) / 1000;
    let steps = coalesce(stepKinds.map((kind, i) => ({ kind, a: i, b: i })));
    const merge = () => {
      while (steps.length > 1) {
        let index = -1;
        let shortest = Infinity;
        steps.forEach((s, i) => {
          const d = durationOf(s);
          if (d < config.minSegmentSec[s.kind] && d < shortest) {
            shortest = d;
            index = i;
          }
        });
        if (index < 0) break;
        const prev = steps[index - 1];
        const next = steps[index + 1];
        const target = !prev
          ? next
          : !next
            ? prev
            : durationOf(prev) >= durationOf(next)
              ? prev
              : next;
        steps[index].kind = target.kind;
        steps = coalesce(steps);
      }
    };
    merge();
    // A "lift" without real climb or a "run" without real descent is just movement.
    for (const s of steps) {
      const v = accumulateVertical(
        alt,
        first + s.a,
        first + s.b + 1,
        config.altitudeDeadbandM,
      );
      if (s.kind === 'lift' && v.up < config.minLiftAscentM) s.kind = 'flat';
      if (s.kind === 'run' && v.down < config.minRunDescentM) s.kind = 'flat';
    }
    steps = coalesce(steps);
    merge();

    for (const s of steps) {
      const a = first + s.a;
      const b = first + s.b + 1;
      let distance = 0;
      const speeds: number[] = [];
      for (let i = a; i < b; i++) {
        const seconds = (t[i + 1] - t[i]) / 1000;
        const d = haversine(lat[i], lon[i], lat[i + 1], lon[i + 1]);
        if (seconds <= config.maxStepSec) {
          if (s.kind !== 'pause') distance += d;
          speeds.push(d / seconds);
        }
      }
      // Median(5) removes single-fix speed spikes before taking the maximum.
      const smoothed = speeds.map((_, i) =>
        median(speeds.slice(Math.max(0, i - 2), i + 3)),
      );
      const vertical = accumulateVertical(alt, a, b, config.altitudeDeadbandM);
      const seconds = (t[b] - t[a]) / 1000;
      const accs = raw
        .slice(a, b + 1)
        .map((p) => p.acc)
        .filter((v): v is number => v != null);
      const accuracy = accs.length ? median(accs) : 15;
      const density = (b - a + 1) / Math.max(seconds / 60, 1 / 60);
      const quality: Quality =
        accuracy <= 10 && density >= 3
          ? 'high'
          : accuracy <= 20 && density >= 1.5
            ? 'medium'
            : 'low';
      segments.push({
        kind: s.kind,
        startIndex: a,
        endIndex: b,
        startT: t[a],
        endT: t[b],
        durationS: seconds,
        distanceM: distance,
        ascentM: s.kind === 'pause' ? 0 : vertical.up,
        descentM: s.kind === 'pause' ? 0 : vertical.down,
        avgSpeedMs: s.kind === 'pause' || seconds <= 0 ? 0 : distance / seconds,
        maxSpeedMs: Math.min(
          config.maxSpeedMs,
          s.kind === 'pause' ? 0 : Math.max(0, ...smoothed),
        ),
        quality,
      });
    }
  }

  const sum = (kind: SegmentKind, key: 'distanceM' | 'ascentM' | 'descentM') =>
    segments
      .filter((s) => s.kind === kind)
      .reduce((total, s) => total + s[key], 0);
  const runs = segments.filter((s) => s.kind === 'run');
  const lifts = segments.filter((s) => s.kind === 'lift');
  const seconds = (list: Segment[]) =>
    list.reduce((total, s) => total + s.durationS, 0);
  const runSeconds = seconds(runs);
  const total = seconds(segments);
  const lowShare = total
    ? seconds(segments.filter((s) => s.quality === 'low')) / total
    : 1;
  const highShare = total
    ? seconds(segments.filter((s) => s.quality === 'high')) / total
    : 0;
  const stats: TrackStats = {
    ...empty,
    movingS: seconds(segments.filter((s) => s.kind !== 'pause')),
    pauseS: seconds(segments.filter((s) => s.kind === 'pause')),
    gapS,
    distanceM: segments.reduce((n, s) => n + s.distanceM, 0),
    runDistanceM: sum('run', 'distanceM'),
    liftDistanceM: sum('lift', 'distanceM'),
    liftAscentM: source === 'none' ? 0 : sum('lift', 'ascentM'),
    runDescentM: source === 'none' ? 0 : sum('run', 'descentM'),
    liftCount: lifts.length,
    runCount: runs.length,
    maxSpeedMs: Math.max(0, ...segments.map((s) => s.maxSpeedMs)),
    avgRunSpeedMs: runSeconds ? sum('run', 'distanceM') / runSeconds : 0,
    quality: lowShare >= 0.3 ? 'low' : highShare >= 0.6 ? 'high' : 'medium',
  };
  if (gapS > 0.2 * empty.durationS && gapS > 120) warnings.push('large_gaps');
  return {
    algorithmVersion: ALGORITHM_VERSION,
    points,
    segments,
    stats,
    dropped: cleaned.dropped,
    resyncs: cleaned.resyncs,
    altitudeSource: source,
    warnings,
  };
}

// The subset of TrackStats that is uploaded and stored (see gpsStatsSchema in shared).
export function uploadStats(stats: TrackStats) {
  return {
    durationS: stats.durationS,
    movingS: stats.movingS,
    pauseS: stats.pauseS,
    gapS: stats.gapS,
    distanceM: stats.distanceM,
    runDistanceM: stats.runDistanceM,
    liftDistanceM: stats.liftDistanceM,
    liftAscentM: stats.liftAscentM,
    runDescentM: stats.runDescentM,
    liftCount: stats.liftCount,
    runCount: stats.runCount,
    maxSpeedMs: stats.maxSpeedMs,
    avgRunSpeedMs: stats.avgRunSpeedMs,
    minAltM: stats.minAltM,
    maxAltM: stats.maxAltM,
    pointCount: stats.pointCount,
    quality: stats.quality,
  };
}
