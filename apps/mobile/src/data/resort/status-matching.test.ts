import { describe, expect, it } from 'vitest';
import {
  createLiftStatusIndex,
  createPisteStatusIndex,
  pisteStatusFor,
  pisteStatusForRef,
  statusFor,
} from './status-matching';
import type { GeographicLift } from './zillertal-arena-lifts';
import type { PisteStatus } from '@/types/resort';

const lift: GeographicLift = {
  id: 'test-lift',
  name: 'Speedy Filzsteinbahn',
  type: 'chair_lift',
  points: [
    [47, 12],
    [47.01, 12.01],
  ],
};
const report = (
  status: PisteStatus['status'],
  level: PisteStatus['level'] = 'blue',
): PisteStatus => ({
  name: '78 Testpiste',
  ref: '78',
  status,
  level,
  kilometers: 1,
});
describe('Kartenstatus', () => {
  it('ordnet bekannte Aliasnamen zu, unbekannte bleiben neutral', () => {
    expect(
      statusFor(
        lift,
        createLiftStatusIndex([
          { name: '4er Filzsteinbahn Speedy', status: 'open' },
        ]),
      ),
    ).toBe('open');
    expect(statusFor(lift, new Map())).toBe('unknown');
  });
  it('zeigt bei widersprüchlichen Liftmeldungen keinen offenen Status', () => {
    expect(
      statusFor(
        lift,
        createLiftStatusIndex([
          { name: lift.name!, status: 'open' },
          { name: lift.name!, status: 'closed' },
        ]),
      ),
    ).toBe('unknown');
    expect(
      statusFor(
        lift,
        createLiftStatusIndex([
          { name: lift.name!, status: 'open' },
          { name: '4er Filzsteinbahn Speedy', status: 'closed' },
        ]),
      ),
    ).toBe('unknown');
  });
  it('verwendet Pistennummer und Schwierigkeit und behandelt Konflikte neutral', () => {
    const geometry = {
      id: 'test',
      ref: '78',
      name: null,
      difficulty: 'easy' as const,
      paths: [],
      isArea: false,
    };
    expect(
      pisteStatusFor(
        geometry,
        createPisteStatusIndex([report('closed', 'red'), report('open')]),
      )?.status,
    ).toBe('open');
    expect(
      pisteStatusFor(
        geometry,
        createPisteStatusIndex([report('closed'), report('open')]),
      )?.status,
    ).toBe('unknown');
    expect(pisteStatusFor(geometry, new Map())).toBeNull();
    expect(pisteStatusForRef('78', [report('closed'), report('open')])).toBe(
      'unknown',
    );
  });
});
