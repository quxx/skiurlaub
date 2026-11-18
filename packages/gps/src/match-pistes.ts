import type { AnalyzedPoint, Segment } from './types';

// A piste as known from map data. Each path is a polyline of [lat, lon].
export type PisteRef = {
  id: string;
  name: string | null;
  ref: string | null;
  difficulty: string;
  paths: Array<Array<[number, number]>>;
};

export type PisteMatchConfig = {
  /** Largest distance between a GPS fix and a piste line that still counts as "on the piste". */
  maxDistM: number;
  /** A second piste within this many meters of the best one makes the fix ambiguous. */
  ambiguityM: number;
  /** Stretches with fewer fixes are absorbed into a neighbouring stretch. */
  minStretchPoints: number;
};
// EXPERIMENTAL: pistes are mapped as centre lines (often 20-60 m wide) and GPS is good to
// roughly 5-20 m, so 45 m is a deliberately generous corridor.
export const defaultPisteConfig: PisteMatchConfig = {
  maxDistM: 45,
  ambiguityM: 12,
  minStretchPoints: 4,
};

export type PisteStretch = {
  /** null: the fixes were not near any known piste (e.g. a connecting track or off-piste). */
  pisteId: string | null;
  name: string | null;
  ref: string | null;
  difficulty: string | null;
  startIndex: number;
  endIndex: number;
  startT: number;
  endT: number;
  meanDistM: number;
  confidence: 'high' | 'medium' | 'none';
  /** Other pistes that fit about as well (crossing, parallel or overlapping pistes). */
  alternatives: string[];
};

type XY = [number, number];
type Candidate = {
  piste: PisteRef;
  key: string;
  label: string;
  paths: XY[][];
  box: [number, number, number, number];
};
const M_PER_DEG = 111_320;

const labelOf = (piste: PisteRef) =>
  piste.ref && piste.name
    ? `Piste ${piste.ref} · ${piste.name}`
    : piste.ref
      ? `Piste ${piste.ref}`
      : (piste.name ?? 'Piste');
// Several OSM ways form one piste: they share ref and name, so they count as one.
const keyOf = (piste: PisteRef) =>
  piste.ref || piste.name ? `${piste.ref ?? ''}|${piste.name ?? ''}` : piste.id;

function distanceToPath(p: XY, path: XY[]): number {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1];
    const [bx, by] = path[i];
    const dx = bx - ax;
    const dy = by - ay;
    const length2 = dx * dx + dy * dy;
    const t =
      length2 === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / length2),
          );
    const d = Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy));
    if (d < best) best = d;
  }
  return best;
}

// Names the pistes a run followed, in order. Returns one list per segment: a list of stretches
// for runs and null for every other kind. A run can use several pistes one after another.
export function matchPistes(
  points: readonly AnalyzedPoint[],
  segments: readonly Segment[],
  pistes: readonly PisteRef[],
  config: PisteMatchConfig = defaultPisteConfig,
): Array<PisteStretch[] | null> {
  if (!points.length) return segments.map(() => null);
  const lat0 = points[0].lat;
  const lon0 = points[0].lon;
  const kx = Math.cos((lat0 * Math.PI) / 180) * M_PER_DEG;
  const toXY = (lat: number, lon: number): XY => [
    (lon - lon0) * kx,
    (lat - lat0) * M_PER_DEG,
  ];
  const xy = points.map((p) => toXY(p.lat, p.lon));

  // Only pistes near the recording are projected.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of xy) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const margin = config.maxDistM + 5;
  const candidates: Candidate[] = [];
  for (const piste of pistes) {
    const paths = piste.paths
      .filter((path) => path.length >= 2)
      .map((path) => path.map(([lat, lon]) => toXY(lat, lon)));
    if (!paths.length) continue;
    const flat = paths.flat();
    const box: Candidate['box'] = [
      Math.min(...flat.map((p) => p[0])) - margin,
      Math.min(...flat.map((p) => p[1])) - margin,
      Math.max(...flat.map((p) => p[0])) + margin,
      Math.max(...flat.map((p) => p[1])) + margin,
    ];
    if (box[2] < minX || box[0] > maxX || box[3] < minY || box[1] > maxY)
      continue;
    candidates.push({
      piste,
      key: keyOf(piste),
      label: labelOf(piste),
      paths,
      box,
    });
  }

  return segments.map((segment) => {
    if (segment.kind !== 'run') return null;
    const first = segment.startIndex;
    const last = segment.endIndex;
    type Fix = { key: string | null; dist: number; second: string | null };
    const fixes: Fix[] = [];
    let current: string | null = null;
    for (let i = first; i <= last; i++) {
      const p = xy[i];
      const best = new Map<string, number>();
      for (const c of candidates) {
        if (
          p[0] < c.box[0] ||
          p[0] > c.box[2] ||
          p[1] < c.box[1] ||
          p[1] > c.box[3]
        )
          continue;
        const d = Math.min(...c.paths.map((path) => distanceToPath(p, path)));
        if (d <= config.maxDistM && d < (best.get(c.key) ?? Infinity))
          best.set(c.key, d);
      }
      const ranked = [...best.entries()].sort((a, b) => a[1] - b[1]);
      const top = ranked[0];
      // Stickiness: stay on the current piste while it fits about as well as the best one.
      // Without it, two overlapping pistes would flip back and forth with every GPS wobble.
      const keep: string | null =
        current !== null &&
        top &&
        (best.get(current) ?? Infinity) - top[1] <= config.ambiguityM
          ? current
          : null;
      const chosen: string | null = keep ?? (top ? top[0] : null);
      current = chosen;
      const other = ranked.find(
        ([key, d]) =>
          key !== chosen &&
          d - (best.get(chosen as string) ?? 0) <= config.ambiguityM,
      );
      fixes.push({
        key: chosen,
        dist: chosen ? (best.get(chosen) ?? 0) : 0,
        second: other ? other[0] : null,
      });
    }
    // Mode filter (window 5) removes one-fix flips at crossings.
    const smooth = fixes.map((_, i) => {
      const counts = new Map<string | null, number>();
      for (
        let j = Math.max(0, i - 2);
        j <= Math.min(fixes.length - 1, i + 2);
        j++
      )
        counts.set(fixes[j].key, (counts.get(fixes[j].key) ?? 0) + 1);
      let winner = fixes[i].key;
      let max = counts.get(winner) ?? 0;
      for (const [key, n] of counts)
        if (n > max) {
          winner = key;
          max = n;
        }
      return winner;
    });
    type Run = { key: string | null; a: number; b: number };
    let runs: Run[] = [];
    smooth.forEach((key, i) => {
      const last = runs[runs.length - 1];
      if (last && last.key === key) last.b = i;
      else runs.push({ key, a: i, b: i });
    });
    const size = (r: Run) => r.b - r.a + 1;
    while (runs.length > 1) {
      const small = runs
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => size(r) < config.minStretchPoints)
        .sort((x, y) => size(x.r) - size(y.r))[0];
      if (!small) break;
      const prev = runs[small.i - 1];
      const next = runs[small.i + 1];
      const target = !prev
        ? next
        : !next
          ? prev
          : size(prev) >= size(next)
            ? prev
            : next;
      small.r.key = target.key;
      const merged: Run[] = [];
      for (const r of runs) {
        const l = merged[merged.length - 1];
        if (l && l.key === r.key) l.b = r.b;
        else merged.push({ ...r });
      }
      runs = merged;
    }

    return runs.map((r) => {
      const slice = fixes.slice(r.a, r.b + 1);
      const candidate = r.key ? candidates.find((c) => c.key === r.key) : null;
      const matched = slice.filter((f) => f.key === r.key && f.key !== null);
      const meanDist = matched.length
        ? matched.reduce((sum, f) => sum + f.dist, 0) / matched.length
        : 0;
      const ambiguous = matched.filter((f) => f.second !== null);
      const share = matched.length ? ambiguous.length / matched.length : 0;
      const counts = new Map<string, number>();
      for (const f of ambiguous)
        if (f.second) counts.set(f.second, (counts.get(f.second) ?? 0) + 1);
      const alternatives = [...counts.entries()]
        .sort((x, y) => y[1] - x[1])
        .map(([key]) => candidates.find((c) => c.key === key)?.label)
        .filter((label): label is string => !!label);
      const p = candidate?.piste;
      return {
        pisteId: p ? p.id : null,
        name: p?.name ?? null,
        ref: p?.ref ?? null,
        difficulty: p ? p.difficulty : null,
        startIndex: first + r.a,
        endIndex: first + r.b,
        startT: points[first + r.a].t,
        endT: points[first + r.b].t,
        meanDistM: meanDist,
        confidence: !p
          ? 'none'
          : meanDist <= 20 && share < 0.3
            ? 'high'
            : 'medium',
        alternatives,
      } satisfies PisteStretch;
    });
  });
}
