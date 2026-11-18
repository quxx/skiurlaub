import type { RefreshOutcome } from './results';

// Pure scheduling rules for refresh requests. All intervals are configurable
// starting points, not verified provider limits; they must be checked against
// the real rate limits before live activation.
export type SyncConfig = {
  minManualIntervalMs: number;
  openIntervalMs: number;
  periodicIntervalMs: number | null; // null = periodic refresh disabled (default)
  backoffBaseMs: number;
  backoffMaxMs: number;
  jitterRatio: number;
  staleAfterMs: number;
};
export const defaultSyncConfig: SyncConfig = {
  minManualIntervalMs: 60_000,
  openIntervalMs: 5 * 60_000,
  periodicIntervalMs: null,
  backoffBaseMs: 30_000,
  backoffMaxMs: 60 * 60_000,
  jitterRatio: 0.2,
  staleAfterMs: 3 * 60 * 60_000,
};

// Last attempt and last success are tracked separately so the UI can say
// "last synced 14:02" even while the latest attempt failed.
export type SyncState = {
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  consecutiveFailures: number;
  nextAllowedAt: number | null;
  needsReauth: boolean;
};
export const initialSyncState: SyncState = {
  lastAttemptAt: null,
  lastSuccessAt: null,
  consecutiveFailures: 0,
  nextAllowedAt: null,
  needsReauth: false,
};

export type SyncTrigger = 'manual' | 'open' | 'periodic';
export type SyncDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: 'needs_reauth' | 'backoff' | 'too_soon' | 'periodic_disabled';
      retryAt: number | null;
    };

export function decideRefresh(
  state: SyncState,
  now: number,
  trigger: SyncTrigger,
  config: SyncConfig = defaultSyncConfig,
): SyncDecision {
  if (state.needsReauth)
    return { allowed: false, reason: 'needs_reauth', retryAt: null };
  if (trigger === 'periodic' && config.periodicIntervalMs == null)
    return { allowed: false, reason: 'periodic_disabled', retryAt: null };
  if (state.nextAllowedAt != null && now < state.nextAllowedAt)
    return {
      allowed: false,
      reason: state.consecutiveFailures > 0 ? 'backoff' : 'too_soon',
      retryAt: state.nextAllowedAt,
    };
  const interval =
    trigger === 'manual'
      ? config.minManualIntervalMs
      : trigger === 'open'
        ? config.openIntervalMs
        : (config.periodicIntervalMs ?? config.openIntervalMs);
  if (state.lastAttemptAt != null && now - state.lastAttemptAt < interval)
    return {
      allowed: false,
      reason: 'too_soon',
      retryAt: state.lastAttemptAt + interval,
    };
  return { allowed: true };
}

function backoff(
  failures: number,
  config: SyncConfig,
  random: () => number,
): number {
  const base = Math.min(
    config.backoffMaxMs,
    config.backoffBaseMs * 2 ** Math.max(0, failures - 1),
  );
  const jitter = base * config.jitterRatio * (random() * 2 - 1);
  return Math.max(0, Math.round(base + jitter));
}

export function recordResult(
  state: SyncState,
  outcome: RefreshOutcome,
  now: number,
  config: SyncConfig = defaultSyncConfig,
  random: () => number = Math.random,
): SyncState {
  const next: SyncState = { ...state, lastAttemptAt: now };
  switch (outcome.status) {
    case 'refreshed':
    case 'unchanged':
      return {
        ...next,
        lastSuccessAt: now,
        consecutiveFailures: 0,
        nextAllowedAt: now + config.minManualIntervalMs,
        needsReauth: false,
      };
    case 'skipped':
    case 'not_found':
      // Not a failure of the connection; just do not hammer the provider.
      return { ...next, nextAllowedAt: now + config.minManualIntervalMs };
    case 'rate_limited': {
      const failures = state.consecutiveFailures + 1;
      const wait = Math.max(
        (outcome.retryAfterSeconds ?? 0) * 1000,
        backoff(failures, config, random),
      );
      return {
        ...next,
        consecutiveFailures: failures,
        nextAllowedAt: now + wait,
      };
    }
    case 'auth_expired':
      return { ...next, needsReauth: true, nextAllowedAt: null };
    case 'unknown': {
      const failures = state.consecutiveFailures + 1;
      return {
        ...next,
        consecutiveFailures: failures,
        nextAllowedAt: now + backoff(failures, config, random),
      };
    }
  }
}

export type Staleness = 'never' | 'fresh' | 'stale';
export function staleness(
  state: SyncState,
  now: number,
  config: SyncConfig = defaultSyncConfig,
): Staleness {
  if (state.lastSuccessAt == null) return 'never';
  return now - state.lastSuccessAt > config.staleAfterMs ? 'stale' : 'fresh';
}
