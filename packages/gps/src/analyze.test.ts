import { describe, expect, it } from 'vitest';
import {
  analyzeTrack,
  cleanPoints,
  haversine,
  skiDayLegs,
  synthesizeTrack,
} from './index';
import type { Leg, RawPoint } from './index';

const near = (actual: number, expected: number, tolerance: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(expected * tolerance);

describe('analyzeTrack: typischer Skitag', () => {
  for (const withBaro of [true, false]) {
    it(`zählt Lifte, Abfahrten und Höhenmeter (${withBaro ? 'mit Barometer' : 'nur GPS'})`, () => {
      const points = synthesizeTrack(skiDayLegs(3), { withBaro, seed: 3 });
      const result = analyzeTrack(points);
      const { stats } = result;
      expect(result.altitudeSource).toBe(withBaro ? 'baro' : 'gps');
      expect(stats.liftCount).toBe(3);
      expect(stats.runCount).toBe(3);
      near(stats.liftAscentM, 900, withBaro ? 0.08 : 0.15);
      near(stats.runDescentM, 900, withBaro ? 0.08 : 0.15);
      // 3 x (1200 m Lift + 1680 m Abfahrt)
      near(stats.distanceM, 8640, 0.1);
      near(stats.runDistanceM, 5040, 0.1);
      near(stats.maxSpeedMs, 7, 0.25);
      expect(stats.pauseS).toBeGreaterThan(600);
      expect(result.warnings).toEqual([]);
    });
  }

  it('ist deterministisch', () => {
    const points = synthesizeTrack(skiDayLegs(2), { seed: 9, withBaro: true });
    expect(analyzeTrack(points)).toEqual(analyzeTrack(points));
  });

  it('erzeugt zusammenhängende, lückenlose Segmente', () => {
    const result = analyzeTrack(
      synthesizeTrack(skiDayLegs(2), { withBaro: true }),
    );
    const segments = result.segments;
    for (let i = 1; i < segments.length; i++)
      expect(segments[i].startIndex).toBe(segments[i - 1].endIndex);
    expect(segments[0].startIndex).toBe(0);
    expect(segments.at(-1)!.endIndex).toBe(result.points.length - 1);
    expect(segments.map((s) => s.kind)).toEqual(
      expect.arrayContaining(['pause', 'lift', 'run']),
    );
  });
});

describe('analyzeTrack: Störungen', () => {
  const base = () =>
    synthesizeTrack(skiDayLegs(3), { withBaro: true, seed: 5 });

  it('verwirft einzelne GPS-Sprünge, ohne das Ergebnis zu verändern', () => {
    const clean = analyzeTrack(base());
    const noisy = base();
    for (const i of [40, 120, 200, 310]) {
      noisy[i] = {
        ...noisy[i],
        lat: noisy[i].lat + 0.02,
        lon: noisy[i].lon - 0.02,
      };
    }
    const result = analyzeTrack(noisy);
    expect(result.dropped.speed_jump).toBe(4);
    expect(result.stats.liftCount).toBe(clean.stats.liftCount);
    expect(result.stats.runCount).toBe(clean.stats.runCount);
    near(result.stats.distanceM, clean.stats.distanceM, 0.03);
  });

  it('übernimmt eine dauerhaft verschobene Position als neuen Ausgangspunkt', () => {
    const points = base();
    const shift = points.map((p, i) =>
      i >= 100 ? { ...p, lat: p.lat + 0.05 } : p,
    );
    const { points: kept, resyncs, dropped } = cleanPoints(shift);
    expect(resyncs).toBe(1);
    expect(dropped.speed_jump).toBe(4);
    expect(kept.length).toBe(points.length - 4);
  });

  it('entfernt ungenaue, doppelte, rückwärtige und ungültige Punkte', () => {
    const points: RawPoint[] = [
      { t: 1000, lat: 47, lon: 12, acc: 5 },
      { t: 1000, lat: 47, lon: 12, acc: 5 },
      { t: 500, lat: 47, lon: 12, acc: 5 },
      { t: 6000, lat: 47.00001, lon: 12, acc: 120 },
      { t: 7000, lat: Number.NaN, lon: 12 },
      { t: 8000, lat: 91, lon: 12 },
      { t: 9000, lat: 0, lon: 0 },
      { t: 10000, lat: 47.00002, lon: 12, acc: 5 },
    ];
    const result = cleanPoints(points);
    expect(result.points).toHaveLength(2);
    expect(result.dropped).toEqual({
      invalid_coordinates: 2,
      null_island: 1,
      duplicate_time: 1,
      non_monotonic_time: 1,
      low_accuracy: 1,
      speed_jump: 0,
    });
  });

  it('zählt Stillstand mit GPS-Rauschen weder als Strecke noch als Fahrt', () => {
    const points = synthesizeTrack([{ kind: 'pause', durationS: 3600 }], {
      accM: 15,
      seed: 11,
    });
    const { stats, segments } = analyzeTrack(points);
    expect(stats.distanceM).toBe(0);
    expect(stats.liftCount + stats.runCount).toBe(0);
    expect(segments.every((s) => s.kind === 'pause')).toBe(true);
  });

  it('erkennt Gehen auf flachem Gelände nicht als Lift oder Abfahrt', () => {
    const points = synthesizeTrack(
      [
        { kind: 'pause', durationS: 120 },
        { kind: 'walk', durationS: 600 },
      ],
      { withBaro: true },
    );
    const { stats, segments } = analyzeTrack(points);
    expect(stats.liftCount + stats.runCount).toBe(0);
    expect(segments.some((s) => s.kind === 'flat')).toBe(true);
  });

  it('wertet kurze Höhenänderungen (Buckel) nicht als Abfahrt', () => {
    const points = synthesizeTrack(
      [
        { kind: 'pause', durationS: 120 },
        { kind: 'run', durationS: 25, dropM: 10, speedMs: 6 },
        { kind: 'pause', durationS: 120 },
      ],
      { withBaro: true },
    );
    expect(analyzeTrack(points).stats.runCount).toBe(0);
  });

  it('trennt bei Signalverlust und rechnet über die Lücke keine Strecke', () => {
    const legs: Leg[] = [
      { kind: 'pause', durationS: 120 },
      { kind: 'lift', durationS: 150, climbM: 150 },
      { kind: 'gap', durationS: 240 },
      { kind: 'lift', durationS: 150, climbM: 150 },
      { kind: 'pause', durationS: 120 },
    ];
    const result = analyzeTrack(synthesizeTrack(legs, { withBaro: true }));
    expect(result.stats.gapS).toBeGreaterThanOrEqual(240);
    // Die Lücke trennt die Fahrt; die Teilstücke sind kein Lift von 300 m am Stück.
    near(result.stats.liftDistanceM, 2 * 150 * 4, 0.2);
    expect(result.warnings).not.toContain('too_few_points');
  });

  it('meldet zu wenige Punkte statt Werte zu erfinden', () => {
    const result = analyzeTrack(
      synthesizeTrack([{ kind: 'lift', durationS: 30, climbM: 30 }]),
    );
    expect(result.warnings).toContain('too_few_points');
    expect(result.segments).toEqual([]);
    expect(result.stats.liftAscentM).toBe(0);
  });

  it('meldet fehlende Höhen und zählt dann keine Höhenmeter', () => {
    const points = synthesizeTrack(skiDayLegs(2)).map((p) => ({
      ...p,
      alt: null,
    }));
    const result = analyzeTrack(points);
    expect(result.altitudeSource).toBe('none');
    expect(result.warnings).toContain('no_altitude');
    expect(result.stats.liftAscentM).toBe(0);
    expect(result.stats.minAltM).toBeNull();
  });

  it('hält die Position zwischen Eingabe und Ergebnis konsistent', () => {
    const points = synthesizeTrack(skiDayLegs(1), { accM: 4, withBaro: true });
    const result = analyzeTrack(points);
    for (const [i, p] of result.points.entries())
      expect(
        haversine(p.lat, p.lon, points[i].lat, points[i].lon),
      ).toBeLessThan(10);
  });
});
