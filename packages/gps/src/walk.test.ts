import { describe, expect, it } from 'vitest';
import {
  analyzeTrack,
  decodeTrack,
  encodeTrack,
  skiDayLegs,
  synthesizeTrack,
} from './index';

// Real-world finding (18.11.2026): a 20 minute walk with the phone in a trouser pocket and the
// display off. Accuracy around 10 m with outliers, walking speed 0.8-1.5 m/s. The first version
// rated almost all of it as "pause" because the accuracy radius was subtracted from the
// displacement. These tests keep that case working.
describe('langsames Gehen mit schlechter Genauigkeit (Hosentasche)', () => {
  const walk = () =>
    synthesizeTrack(
      [
        { kind: 'pause', durationS: 240 },
        { kind: 'walk', durationS: 780, speedMs: 1.1 },
        { kind: 'pause', durationS: 240 },
      ],
      { accM: 15, intervalS: 10, withBaro: true, withSpeed: true, seed: 21 },
    );

  it('erkennt Gehen als Bewegung und zählt die Strecke', () => {
    const { stats, segments } = analyzeTrack(walk());
    // 780 s * 1.1 m/s = 858 m
    expect(stats.distanceM).toBeGreaterThan(700);
    expect(stats.distanceM).toBeLessThan(1100);
    expect(stats.movingS).toBeGreaterThan(9 * 60);
    expect(stats.liftCount + stats.runCount).toBe(0);
    expect(segments.some((s) => s.kind === 'flat')).toBe(true);
  });

  it('wertet Stillstand mit Doppler-Rauschen weiterhin als Pause', () => {
    const still = synthesizeTrack([{ kind: 'pause', durationS: 1200 }], {
      accM: 15,
      intervalS: 10,
      withSpeed: true,
      seed: 5,
    });
    const { stats, segments } = analyzeTrack(still);
    expect(stats.distanceM).toBe(0);
    expect(segments.every((s) => s.kind === 'pause')).toBe(true);
  });

  it('bleibt auch ohne gemeldete Geschwindigkeit bei einer vernünftigen Strecke', () => {
    const noSpeed = synthesizeTrack(
      [{ kind: 'walk', durationS: 600, speedMs: 1.4 }],
      { accM: 6, intervalS: 8, seed: 9 },
    );
    expect(analyzeTrack(noSpeed).stats.distanceM).toBeGreaterThan(600);
  });
});

describe('Höhenreferenz', () => {
  it('nutzt die Ellipsoid-Höhe, wenn keine Höhe über Meer vorliegt', () => {
    const points = synthesizeTrack(skiDayLegs(2), {
      ellipsoidOnly: true,
      seed: 3,
    });
    expect(points.every((p) => p.alt == null && p.altE != null)).toBe(true);
    const result = analyzeTrack(points);
    expect(result.altitudeSource).toBe('gps');
    expect(result.stats.liftCount).toBe(2);
    expect(result.stats.liftAscentM).toBeGreaterThan(500);
  });

  it('mischt die beiden Höhenreferenzen nicht innerhalb eines Tracks', () => {
    // Every second fix only has the ellipsoid altitude (+47 m). Neither reference reaches
    // 80 %, so only the mean-sea-level values count; the +47 m values must not cause jumps.
    const points = synthesizeTrack(skiDayLegs(2), { seed: 3 }).map((p, i) =>
      i % 2 ? { ...p, alt: null, altE: (p.alt ?? 0) + 47 } : p,
    );
    const { stats } = analyzeTrack(points);
    // True climb: 2 laps x 300 m. Alternating +47 m jumps would add far more than that.
    expect(stats.liftAscentM).toBeGreaterThan(450);
    expect(stats.liftAscentM).toBeLessThan(750);
  });

  it('speichert altE im kompakten Format verlustarm', () => {
    const points = synthesizeTrack(skiDayLegs(1), {
      ellipsoidOnly: true,
      withSpeed: true,
      seed: 4,
    });
    const back = decodeTrack(encodeTrack(points));
    back.forEach((p, i) => {
      expect(p.alt).toBeUndefined();
      expect(
        Math.abs((p.altE ?? 0) - (points[i].altE ?? 0)),
      ).toBeLessThanOrEqual(0.05 + 1e-9);
    });
  });
});
