import { describe, expect, it } from 'vitest';
import { calculateCountdown } from './useCountdown';
import { resolveTripMode } from './useTripMode';

describe('Reisezeit und Countdown', () => {
  const start = '2027-01-10T00:00:00+01:00';
  it('zählt bis zur exakten Startgrenze und wird nie negativ', () => {
    expect(
      calculateCountdown(start, Date.parse(start) - 90_061_000),
    ).toMatchObject({ days: 1, hours: 1, minutes: 1, seconds: 1 });
    expect(calculateCountdown(start, Date.parse(start))).toMatchObject({
      totalMilliseconds: 0,
      isComplete: true,
    });
    expect(
      calculateCountdown(start, Date.parse(start) + 1).totalMilliseconds,
    ).toBe(0);
  });
  it('berechnet absolute Zeit über den Sommerzeitwechsel', () => {
    expect(
      calculateCountdown(
        '2027-03-28T04:00:00+02:00',
        Date.parse('2027-03-28T01:00:00+01:00'),
      ).hours,
    ).toBe(2);
  });
  it('unterstützt ein unbekanntes Reiseende und exakte Grenzen', () => {
    expect(resolveTripMode(start, null, Date.parse(start) - 1)).toBe(
      'anticipation',
    );
    expect(resolveTripMode(start, null, Date.parse(start))).toBe('onTrip');
    expect(resolveTripMode(start, null, Date.parse('2028-01-01'))).toBe(
      'onTrip',
    );
    expect(
      resolveTripMode(
        start,
        '2027-01-11T00:00:00+01:00',
        Date.parse('2027-01-11T00:00:00+01:00'),
      ),
    ).toBe('afterTrip');
  });
  it('weist ungültige und rückwärts laufende Reisen zurück', () => {
    expect(() => calculateCountdown('invalid')).toThrow();
    expect(() => resolveTripMode('invalid', null)).toThrow();
    expect(() =>
      resolveTripMode(start, '2027-01-09', Date.parse(start)),
    ).toThrow();
  });
});
