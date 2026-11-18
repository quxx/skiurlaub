import { describe, expect, it } from 'vitest';
import { analyzeTrack, matchLifts, skiDayLegs, synthesizeTrack } from './index';
import type { LiftRef } from './index';

const M_PER_DEG = 111_320;
const shiftNorth = (p: [number, number], meters: number): [number, number] => [
  p[0] + meters / M_PER_DEG,
  p[1],
];

function scenario() {
  const analysis = analyzeTrack(
    synthesizeTrack(skiDayLegs(2), { withBaro: true, seed: 4 }),
  );
  const lifts = analysis.segments.filter((s) => s.kind === 'lift');
  expect(lifts).toHaveLength(2);
  const first = lifts[0];
  const a = analysis.points[first.startIndex];
  const b = analysis.points[first.endIndex];
  const real: LiftRef = {
    id: 'real',
    name: 'Echter Lift',
    type: 'gondola',
    a: [a.lat, a.lon],
    b: [b.lat, b.lon],
  };
  return { analysis, real };
}

describe('matchLifts', () => {
  it('ordnet eine Liftfahrt dem richtigen Lift zu (hohe Sicherheit)', () => {
    const { analysis, real } = scenario();
    const far: LiftRef = {
      id: 'far',
      name: 'Weit weg',
      type: 'chair_lift',
      a: shiftNorth(real.a, 3000),
      b: shiftNorth(real.b, 3000),
    };
    const parallel: LiftRef = {
      id: 'parallel',
      name: 'Parallel',
      type: 'chair_lift',
      a: shiftNorth(real.a, 450),
      b: shiftNorth(real.b, 450),
    };
    const result = matchLifts(analysis.points, analysis.segments, [
      far,
      parallel,
      real,
    ]);
    const index = analysis.segments.findIndex((s) => s.kind === 'lift');
    expect(result[index]).toMatchObject({
      liftId: 'real',
      name: 'Echter Lift',
      confidence: 'high',
      alternatives: [],
    });
    // Abfahrten und Pausen bekommen keine Liftzuordnung.
    analysis.segments.forEach((s, i) => {
      if (s.kind !== 'lift') expect(result[i]).toBeNull();
    });
  });

  it('erkennt den Lift unabhängig von der Reihenfolge der Endstationen', () => {
    const { analysis, real } = scenario();
    const flipped: LiftRef = { ...real, a: real.b, b: real.a };
    const index = analysis.segments.findIndex((s) => s.kind === 'lift');
    expect(
      matchLifts(analysis.points, analysis.segments, [flipped])[index]?.liftId,
    ).toBe('real');
  });

  it('meldet bei zwei fast gleichen Liften nur mittlere Sicherheit samt Alternative', () => {
    const { analysis, real } = scenario();
    const twin: LiftRef = {
      id: 'twin',
      name: 'Zwilling',
      type: 'gondola',
      a: shiftNorth(real.a, 40),
      b: shiftNorth(real.b, 40),
    };
    const index = analysis.segments.findIndex((s) => s.kind === 'lift');
    const match = matchLifts(analysis.points, analysis.segments, [real, twin])[
      index
    ];
    expect(match?.confidence).toBe('medium');
    expect(match?.alternatives.length).toBe(1);
  });

  it('liefert keine Zuordnung, wenn kein Lift in der Nähe ist', () => {
    const { analysis, real } = scenario();
    const faraway: LiftRef = {
      id: 'x',
      name: null,
      type: 'chair_lift',
      a: shiftNorth(real.a, 2000),
      b: shiftNorth(real.b, 2000),
    };
    expect(
      matchLifts(analysis.points, analysis.segments, [faraway]).every(
        (m) => m === null,
      ),
    ).toBe(true);
    expect(
      matchLifts(analysis.points, analysis.segments, []).every(
        (m) => m === null,
      ),
    ).toBe(true);
  });

  it('weist einen Lift mit nur einer passenden Station ab', () => {
    const { analysis, real } = scenario();
    const half: LiftRef = {
      ...real,
      id: 'half',
      b: shiftNorth(real.b, 900),
    };
    const index = analysis.segments.findIndex((s) => s.kind === 'lift');
    expect(
      matchLifts(analysis.points, analysis.segments, [half])[index],
    ).toBeNull();
  });
});
