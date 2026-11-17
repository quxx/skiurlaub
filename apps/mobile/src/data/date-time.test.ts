import { expect, it } from 'vitest';
import { formatSourceTime } from './date-time';

it('keeps the source date in the full label and uses the resort timezone in compact labels', () => {
  const value = '2027-01-10T12:00:00Z';
  expect(formatSourceTime(value, 'Europe/Vienna')).toBe('10.01.2027, 13:00');
  expect(formatSourceTime(value, 'Europe/Vienna', true)).toBe('13:00');
  expect(formatSourceTime(null, 'Europe/Vienna', true)).toBe('Unbekannt');
});
