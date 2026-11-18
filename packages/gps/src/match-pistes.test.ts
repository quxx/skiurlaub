import { describe, expect, it } from 'vitest';
import {
  analyzeTrack,
  matchPistes,
  skiDayLegs,
  synthesizeTrack,
} from './index';
import type { PisteRef } from './index';

const M_PER_DEG = 111_320;
const shift = (p: [number, number], north: number): [number, number] => [
  p[0] + north / M_PER_DEG,
  p[1],
];

function scenario() {
  const analysis = analyzeTrack(
    synthesizeTrack(skiDayLegs(2), { withBaro: true, seed: 6 }),
  );
  const runIndex = analysis.segments.findIndex((s) => s.kind === 'run');
  const run = analysis.segments[runIndex];
  const at = (index: number): [number, number] => [
    analysis.points[index].lat,
    analysis.points[index].lon,
  ];
  const mid = Math.round((run.startIndex + run.endIndex) / 2);
  const piste = (
    id: string,
    ref: string | null,
    name: string | null,
    path: Array<[number, number]>,
    difficulty = 'intermediate',
  ): PisteRef => ({ id, ref, name, difficulty, paths: [path] });
  return { analysis, runIndex, run, at, mid, piste };
}

describe('matchPistes', () => {
  it('nennt zwei aufeinanderfolgende Pisten in der richtigen Reihenfolge', () => {
    const { analysis, runIndex, run, at, mid, piste } = scenario();
    const upper = piste(
      'p1',
      '8',
      'Isskogel',
      [at(run.startIndex), at(mid)],
      'easy',
    );
    const lower = piste('p2', '12', null, [at(mid), at(run.endIndex)]);
    const far = piste('far', '99', 'Weit weg', [
      shift(at(mid), 3000),
      shift(at(mid), 3500),
    ]);
    const result = matchPistes(analysis.points, analysis.segments, [
      far,
      lower,
      upper,
    ]);
    const stretches = result[runIndex]!;
    expect(stretches.map((s) => s.ref)).toEqual(['8', '12']);
    expect(stretches[0]).toMatchObject({
      name: 'Isskogel',
      difficulty: 'easy',
      confidence: 'high',
    });
    expect(stretches[0].startIndex).toBe(run.startIndex);
    expect(stretches[1].endIndex).toBe(run.endIndex);
    // Reihenfolge und Zeiten sind konsistent.
    expect(stretches[0].endT).toBeLessThanOrEqual(stretches[1].startT + 20_000);
    // Nur Abfahrten werden ausgewertet.
    analysis.segments.forEach((s, i) => {
      if (s.kind !== 'run') expect(result[i]).toBeNull();
    });
  });

  it('fasst mehrere OSM-Wege derselben Piste zu einem Abschnitt zusammen', () => {
    const { analysis, runIndex, run, at, mid, piste } = scenario();
    const a = piste('way1', '8', 'Isskogel', [at(run.startIndex), at(mid)]);
    const b = piste('way2', '8', 'Isskogel', [at(mid), at(run.endIndex)]);
    const stretches = matchPistes(analysis.points, analysis.segments, [a, b])[
      runIndex
    ]!;
    expect(stretches).toHaveLength(1);
    expect(stretches[0]).toMatchObject({
      ref: '8',
      startIndex: run.startIndex,
      endIndex: run.endIndex,
    });
  });

  it('meldet bei übereinanderliegenden Pisten mittlere Sicherheit samt Alternative', () => {
    const { analysis, runIndex, run, at, piste } = scenario();
    const one = piste('a', '8', 'Isskogel', [
      at(run.startIndex),
      at(run.endIndex),
    ]);
    const two = piste('b', '9', 'Zwilling', [
      shift(at(run.startIndex), 5),
      shift(at(run.endIndex), 5),
    ]);
    const stretches = matchPistes(analysis.points, analysis.segments, [
      one,
      two,
    ])[runIndex]!;
    expect(stretches).toHaveLength(1);
    expect(stretches[0].confidence).toBe('medium');
    expect(stretches[0].alternatives.length).toBe(1);
  });

  it('liefert einen Abschnitt ohne Piste, wenn keine bekannte Piste in der Nähe ist', () => {
    const { analysis, runIndex, run, at, piste } = scenario();
    const offset = piste('off', '5', 'Daneben', [
      shift(at(run.startIndex), 400),
      shift(at(run.endIndex), 400),
    ]);
    for (const list of [[offset], []]) {
      const stretches = matchPistes(analysis.points, analysis.segments, list)[
        runIndex
      ]!;
      expect(stretches).toHaveLength(1);
      expect(stretches[0]).toMatchObject({
        pisteId: null,
        confidence: 'none',
        alternatives: [],
      });
    }
  });

  it('toleriert eine Pistenmittellinie etwas neben dem Track, aber keine 100 m', () => {
    const { analysis, runIndex, run, at, piste } = scenario();
    const near = piste('near', '1', null, [
      shift(at(run.startIndex), 25),
      shift(at(run.endIndex), 25),
    ]);
    const wide = piste('wide', '2', null, [
      shift(at(run.startIndex), 150),
      shift(at(run.endIndex), 150),
    ]);
    expect(
      matchPistes(analysis.points, analysis.segments, [near])[runIndex]![0].ref,
    ).toBe('1');
    expect(
      matchPistes(analysis.points, analysis.segments, [wide])[runIndex]![0]
        .pisteId,
    ).toBeNull();
  });
});
