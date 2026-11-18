import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  MAX_TRACK_POINTS,
  TrackCodecError,
  compressTrack,
  decodeTrack,
  decompressTrack,
  encodeTrack,
  skiDayLegs,
  synthesizeTrack,
} from './index';

describe('Track-Format', () => {
  const sample = () =>
    synthesizeTrack(skiDayLegs(2), { withBaro: true, seed: 2 });

  it('kodiert verlustarm und stellt alle Felder wieder her', () => {
    const points = sample();
    const decoded = decodeTrack(encodeTrack(points));
    expect(decoded).toHaveLength(points.length);
    points.forEach((p, i) => {
      expect(decoded[i].t).toBe(p.t);
      expect(Math.abs(decoded[i].lat - p.lat)).toBeLessThan(1e-6);
      expect(Math.abs(decoded[i].lon - p.lon)).toBeLessThan(1e-6);
      expect(
        Math.abs((decoded[i].alt ?? 0) - (p.alt ?? 0)),
      ).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(
        Math.abs((decoded[i].pressureHpa ?? 0) - (p.pressureHpa ?? 0)),
      ).toBeLessThanOrEqual(0.005 + 1e-9);
      expect(decoded[i].acc).toBeCloseTo(p.acc ?? 0, 1);
    });
  });

  it('behält fehlende Felder als fehlend', () => {
    const decoded = decodeTrack(
      encodeTrack([
        { t: 1_700_000_000_000, lat: 47.1, lon: 12.2 },
        {
          t: 1_700_000_005_000,
          lat: 47.1001,
          lon: 12.2001,
          alt: -3.5,
          speed: 2.25,
        },
      ]),
    );
    expect(decoded[0]).toEqual({ t: 1_700_000_000_000, lat: 47.1, lon: 12.2 });
    expect(decoded[1]).toMatchObject({ alt: -3.5, speed: 2.25 });
    expect('acc' in decoded[1]).toBe(false);
  });

  it('komprimiert einen achtstündigen Skitag auf deutlich unter 1 MB', async () => {
    const eightHours = synthesizeTrack(
      [{ kind: 'pause', durationS: 8 * 3600 }],
      { intervalS: 10, withBaro: true },
    );
    expect(eightHours.length).toBeGreaterThan(2800);
    const packed = await compressTrack(eightHours);
    expect(packed.length).toBeLessThan(150_000);
    const back = await decompressTrack(packed);
    expect(back).toHaveLength(eightHours.length);
  });

  it('weist falsche Daten ab', async () => {
    expect(() => decodeTrack(new Uint8Array([1, 2, 3]))).toThrow(
      TrackCodecError,
    );
    expect(() =>
      decodeTrack(new Uint8Array([0x53, 0x4b, 0x47, 0x54, 9, 0])),
    ).toThrow(TrackCodecError);
    const valid = encodeTrack(sample());
    expect(() => decodeTrack(valid.slice(0, valid.length - 5))).toThrow(
      TrackCodecError,
    );
    await expect(
      decompressTrack(new Uint8Array([1, 2, 3, 4, 5])),
    ).rejects.toThrow(TrackCodecError);
  });

  it('begrenzt Punktzahl und entpackte Größe (Zip-Bombe)', async () => {
    expect(() =>
      encodeTrack(
        Array.from({ length: MAX_TRACK_POINTS + 1 }, (_, i) => ({
          t: i,
          lat: 1,
          lon: 1,
        })),
      ),
    ).toThrow(TrackCodecError);
    const bomb = new Uint8Array(gzipSync(Buffer.alloc(20_000_000)));
    expect(bomb.length).toBeLessThan(100_000);
    await expect(decompressTrack(bomb, 1_000_000)).rejects.toThrow(
      TrackCodecError,
    );
    const claimsMany = new Uint8Array([
      0x53, 0x4b, 0x47, 0x54, 1, 0xff, 0xff, 0xff, 0x7f,
    ]);
    expect(() => decodeTrack(claimsMany)).toThrow(TrackCodecError);
  });
});
