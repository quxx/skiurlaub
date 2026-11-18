import { describe, expect, it } from 'vitest';
import {
  decideRefresh,
  defaultSyncConfig as cfg,
  initialSyncState,
  recordResult,
  staleness,
} from './sync';
import type { SyncState } from './sync';

const noJitter = () => 0.5; // jitter term = 0
const T0 = 1_000_000;

describe('decideRefresh', () => {
  it('erlaubt den ersten Abruf und verbietet periodische Abrufe standardmäßig', () => {
    expect(decideRefresh(initialSyncState, T0, 'manual')).toEqual({
      allowed: true,
    });
    expect(decideRefresh(initialSyncState, T0, 'periodic')).toMatchObject({
      allowed: false,
      reason: 'periodic_disabled',
    });
    expect(
      decideRefresh(initialSyncState, T0, 'periodic', {
        ...cfg,
        periodicIntervalMs: 300_000,
      }),
    ).toEqual({ allowed: true });
  });
  it('erzwingt den Mindestabstand je Auslöser', () => {
    const state: SyncState = { ...initialSyncState, lastAttemptAt: T0 };
    expect(decideRefresh(state, T0 + 59_999, 'manual')).toMatchObject({
      allowed: false,
      reason: 'too_soon',
      retryAt: T0 + 60_000,
    });
    expect(decideRefresh(state, T0 + 60_000, 'manual').allowed).toBe(true);
    // Beim App-Öffnen gilt das längere Intervall.
    expect(decideRefresh(state, T0 + 120_000, 'open').allowed).toBe(false);
    expect(decideRefresh(state, T0 + 300_000, 'open').allowed).toBe(true);
  });
  it('sperrt bei abgelaufener Anmeldung bis zur Neuverbindung', () => {
    const state: SyncState = { ...initialSyncState, needsReauth: true };
    expect(decideRefresh(state, T0, 'manual')).toEqual({
      allowed: false,
      reason: 'needs_reauth',
      retryAt: null,
    });
  });
});

describe('recordResult', () => {
  it('führt letzten Versuch und letzten Erfolg getrennt', () => {
    let state = recordResult(
      initialSyncState,
      { status: 'refreshed', refreshedCount: 1 },
      T0,
      cfg,
      noJitter,
    );
    expect(state).toMatchObject({
      lastAttemptAt: T0,
      lastSuccessAt: T0,
      consecutiveFailures: 0,
    });
    state = recordResult(
      state,
      { status: 'unknown', reason: 'x' },
      T0 + 1000,
      cfg,
      noJitter,
    );
    expect(state.lastAttemptAt).toBe(T0 + 1000);
    expect(state.lastSuccessAt).toBe(T0);
    expect(state.consecutiveFailures).toBe(1);
  });
  it('verdoppelt den Backoff bis zur Obergrenze', () => {
    let state = initialSyncState;
    const waits: number[] = [];
    for (let i = 0; i < 12; i++) {
      state = recordResult(
        state,
        { status: 'unknown', reason: 'x' },
        T0,
        cfg,
        noJitter,
      );
      waits.push(state.nextAllowedAt! - T0);
    }
    expect(waits.slice(0, 4)).toEqual([30_000, 60_000, 120_000, 240_000]);
    expect(Math.max(...waits)).toBe(cfg.backoffMaxMs);
  });
  it('hält den Jitter innerhalb der Grenzen', () => {
    for (const random of [0, 0.5, 0.999999]) {
      const state = recordResult(
        initialSyncState,
        { status: 'unknown', reason: 'x' },
        T0,
        cfg,
        () => random,
      );
      const wait = state.nextAllowedAt! - T0;
      expect(wait).toBeGreaterThanOrEqual(30_000 * 0.8 - 1);
      expect(wait).toBeLessThanOrEqual(30_000 * 1.2 + 1);
    }
  });
  it('beachtet Retry-After beim Rate Limit', () => {
    const state = recordResult(
      initialSyncState,
      { status: 'rate_limited', retryAfterSeconds: 600 },
      T0,
      cfg,
      noJitter,
    );
    expect(state.nextAllowedAt).toBe(T0 + 600_000);
    expect(decideRefresh(state, T0 + 599_000, 'manual')).toMatchObject({
      allowed: false,
      reason: 'backoff',
    });
  });
  it('behandelt skipped/not_found nicht als Verbindungsfehler', () => {
    for (const outcome of [
      { status: 'skipped', skippedCount: 1 },
      { status: 'not_found' },
    ] as const) {
      const state = recordResult(initialSyncState, outcome, T0, cfg);
      expect(state.consecutiveFailures).toBe(0);
      expect(state.lastSuccessAt).toBeNull();
      expect(state.nextAllowedAt).toBe(T0 + cfg.minManualIntervalMs);
    }
  });
  it('merkt sich abgelaufene Anmeldung und löst sie nach Erfolg', () => {
    let state = recordResult(
      initialSyncState,
      { status: 'auth_expired' },
      T0,
      cfg,
    );
    expect(state.needsReauth).toBe(true);
    state = recordResult(
      { ...state, needsReauth: false },
      { status: 'unchanged' },
      T0 + 5,
      cfg,
    );
    expect(state.needsReauth).toBe(false);
    expect(state.lastSuccessAt).toBe(T0 + 5);
  });
});

describe('staleness', () => {
  it('unterscheidet nie, frisch und veraltet', () => {
    expect(staleness(initialSyncState, T0)).toBe('never');
    const state: SyncState = { ...initialSyncState, lastSuccessAt: T0 };
    expect(staleness(state, T0 + cfg.staleAfterMs)).toBe('fresh');
    expect(staleness(state, T0 + cfg.staleAfterMs + 1)).toBe('stale');
  });
});
