import type { AnalyzedPoint, Segment } from './types';

// A lift as known from map data: its two terminals as [lat, lon]. The order is not
// meaningful; the matcher decides which terminal a ride started at.
export type LiftRef = {
  id: string;
  name: string | null;
  type: string;
  a: [number, number];
  b: [number, number];
};

export type MatchConfidence = 'high' | 'medium';
export type LiftMatch = {
  liftId: string;
  name: string | null;
  type: string;
  confidence: MatchConfidence;
  /** Mean distance between the ride and the lift line in meters (lower is better). */
  scoreM: number;
  /** Other lifts that fit almost as well (parallel or shared-station lifts). */
  alternatives: string[];
};

export type MatchConfig = {
  maxTerminalM: number;
  maxCorridorM: number;
  highScoreM: number;
  /** Lifts scoring within this many meters of the best one count as alternatives. A side offset counts twice in the score (terminals and corridor), so 90 means about 45 m apart. */
  ambiguityM: number;
};
// EXPERIMENTAL thresholds; GPS positions are good to roughly 5-20 m, and a recording may
// start or stop a little before or after the station.
export const defaultMatchConfig: MatchConfig = {
  maxTerminalM: 200,
  maxCorridorM: 100,
  highScoreM: 80,
  ambiguityM: 90,
};

type XY = [number, number];
const M_PER_DEG = 111_320;

function project(lat: number, lon: number, lat0: number, lon0: number): XY {
  return [
    (lon - lon0) * Math.cos((lat0 * Math.PI) / 180) * M_PER_DEG,
    (lat - lat0) * M_PER_DEG,
  ];
}
const dist = (p: XY, q: XY) => Math.hypot(p[0] - q[0], p[1] - q[1]);
function distanceToLine(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  if (length2 === 0) return dist(p, a);
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2),
  );
  return dist(p, [a[0] + t * dx, a[1] + t * dy]);
}

// Assigns an ascending ride (segment of kind "lift") to the most likely lift.
// Returns one entry per segment (null for anything that is not a clear match).
export function matchLifts(
  points: readonly AnalyzedPoint[],
  segments: readonly Segment[],
  lifts: readonly LiftRef[],
  config: MatchConfig = defaultMatchConfig,
): Array<LiftMatch | null> {
  return segments.map((segment) => {
    if (segment.kind !== 'lift') return null;
    const slice = points.slice(segment.startIndex, segment.endIndex + 1);
    if (slice.length < 2) return null;
    const lat0 = slice[0].lat;
    const lon0 = slice[0].lon;
    const track = slice.map((p) => project(p.lat, p.lon, lat0, lon0));
    const start = track[0];
    const end = track[track.length - 1];
    const step = Math.max(1, Math.floor(track.length / 30));

    const scored: Array<{ lift: LiftRef; score: number }> = [];
    for (const lift of lifts) {
      const a = project(lift.a[0], lift.a[1], lat0, lon0);
      const b = project(lift.b[0], lift.b[1], lat0, lon0);
      const forward = Math.max(dist(start, a), dist(end, b));
      const reverse = Math.max(dist(start, b), dist(end, a));
      const terminals = Math.min(forward, reverse);
      if (terminals > config.maxTerminalM) continue;
      const assign =
        forward <= reverse
          ? (dist(start, a) + dist(end, b)) / 2
          : (dist(start, b) + dist(end, a)) / 2;
      let sum = 0;
      let count = 0;
      for (let i = 0; i < track.length; i += step) {
        sum += distanceToLine(track[i], a, b);
        count++;
      }
      const corridor = sum / count;
      if (corridor > config.maxCorridorM) continue;
      scored.push({ lift, score: assign + corridor });
    }
    if (!scored.length) return null;
    scored.sort((x, y) => x.score - y.score);
    const best = scored[0];
    const close = scored
      .slice(1)
      .filter((s) => s.score <= best.score + config.ambiguityM);
    return {
      liftId: best.lift.id,
      name: best.lift.name,
      type: best.lift.type,
      confidence:
        best.score <= config.highScoreM && close.length === 0
          ? 'high'
          : 'medium',
      scoreM: best.score,
      alternatives: close.map((s) => s.lift.name ?? s.lift.id),
    };
  });
}
