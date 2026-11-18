import { z } from 'zod';

export type SkilineErrorKind =
  | 'not_approved' // live access has not been approved/enabled
  | 'auth_expired'
  | 'rate_limited'
  | 'invalid_code'
  | 'invalid_response'
  | 'unknown';

export type SkilineError = {
  kind: SkilineErrorKind;
  message: string;
  retryAfterSeconds?: number;
};
export type SkilineResult<T> =
  { ok: true; value: T } | { ok: false; error: SkilineError };

export const ok = <T>(value: T): SkilineResult<T> => ({ ok: true, value });
export const fail = (
  kind: SkilineErrorKind,
  message: string,
  retryAfterSeconds?: number,
): SkilineResult<never> => ({
  ok: false,
  error: { kind, message, retryAfterSeconds },
});

// Outcomes of refreshing one ticket. An empty or null response is never
// reported as a success: the observed all-null answer is `unknown`.
export type RefreshOutcome =
  | { status: 'refreshed'; refreshedCount: number }
  | { status: 'unchanged' }
  | { status: 'not_found' }
  | { status: 'skipped'; skippedCount: number }
  | { status: 'rate_limited'; retryAfterSeconds?: number }
  | { status: 'auth_expired' }
  | { status: 'unknown'; reason: string };

const count = z.number().int().nonnegative().nullable().optional();
export const refreshResponseSchema = z.looseObject({
  matchingTicketCount: count,
  refreshedCount: count,
  refreshedTickets: z.array(z.unknown()).nullable().optional(),
  skippedFastRefreshCount: count,
});

// Interpretation of the response fields is NOT verified against the live API.
// It only encodes the conservative rules documented in docs/phase-4-skiline.md.
export function classifyRefresh(value: unknown): RefreshOutcome {
  const parsed = refreshResponseSchema.safeParse(value);
  if (!parsed.success)
    return { status: 'unknown', reason: 'unexpected_response_shape' };
  const matching = parsed.data.matchingTicketCount;
  const refreshed = parsed.data.refreshedCount;
  const skipped = parsed.data.skippedFastRefreshCount;
  const list = parsed.data.refreshedTickets;
  if (matching == null && refreshed == null && skipped == null && !list?.length)
    return { status: 'unknown', reason: 'empty_response' };
  if (matching === 0) return { status: 'not_found' };
  if ((refreshed ?? 0) > 0)
    return { status: 'refreshed', refreshedCount: refreshed ?? 0 };
  if ((skipped ?? 0) > 0)
    return { status: 'skipped', skippedCount: skipped ?? 0 };
  if ((matching ?? 0) > 0) return { status: 'unchanged' };
  return { status: 'unknown', reason: 'inconsistent_counts' };
}
