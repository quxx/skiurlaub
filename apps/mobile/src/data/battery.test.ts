import { describe, expect, it } from 'vitest';
import { summarizeBattery } from './battery';
import type { BatterySample } from './battery';

const sample = (
  minutes: number,
  pct: number,
  over: Partial<BatterySample> = {},
): BatterySample => ({
  t: Date.UTC(2027, 0, 10, 9, 0) + minutes * 60_000,
  pct,
  charging: false,
  reason: 'interval',
  ...over,
});

describe('summarizeBattery', () => {
  it('rechnet Verbrauch und Punkte pro Stunde', () => {
    const summary = summarizeBattery([
      sample(0, 87, { reason: 'start' }),
      sample(30, 84),
      sample(60, 81, { reason: 'stop' }),
    ]);
    expect(summary).toMatchObject({
      startPct: 87,
      endPct: 81,
      dropPoints: 6,
      minutes: 60,
      perHour: 6,
      charged: false,
    });
  });

  it('gibt bei sehr kurzen Aufzeichnungen keine Stundenrate an', () => {
    const summary = summarizeBattery([sample(0, 90), sample(5, 89)]);
    expect(summary?.dropPoints).toBe(1);
    expect(summary?.perHour).toBeNull();
  });

  it('markiert Messungen, bei denen das Handy geladen hat', () => {
    const summary = summarizeBattery([
      sample(0, 50),
      sample(20, 52, { charging: true }),
      sample(40, 55, { charging: true }),
    ]);
    expect(summary?.charged).toBe(true);
    expect(summary?.dropPoints).toBe(-5);
  });

  it('übernimmt die höchste Akkutemperatur', () => {
    const summary = summarizeBattery([
      sample(0, 80, { tempC: 24.5 }),
      sample(20, 78, { tempC: 31.2 }),
      sample(40, 77),
    ]);
    expect(summary?.maxTempC).toBe(31.2);
  });

  it('braucht mindestens zwei Messpunkte mit wachsender Zeit', () => {
    expect(summarizeBattery([])).toBeNull();
    expect(summarizeBattery([sample(0, 80)])).toBeNull();
    expect(summarizeBattery([sample(0, 80), sample(0, 79)])).toBeNull();
  });
});
