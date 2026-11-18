import { z } from 'zod';
import type { DataEnvelope } from '@/types/data';

export type RefreshOptions = { force?: boolean };
const timeoutMs = 12_000;
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly retryAt?: number,
  ) {
    super(message);
  }
}

export async function fetchJson(
  url: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(url, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    const header = response.headers.get('Retry-After');
    const seconds = header === null ? NaN : Number(header);
    const retryAt = Number.isFinite(seconds)
      ? Date.now() + Math.max(60, seconds) * 1000
      : Date.parse(header ?? '');
    throw new ProviderError(
      response.status === 429
        ? 'Zu viele Anfragen. Bitte später erneut versuchen.'
        : `Die Datenquelle antwortet mit HTTP ${response.status}.`,
      response.status === 429
        ? Number.isFinite(retryAt)
          ? Math.max(Date.now() + 60_000, retryAt)
          : Date.now() + 300_000
        : undefined,
    );
  }
  return response.json();
}

function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Network use remains possible without storage. */
  }
}

export function sourceFreshness(
  observedAt: string | null,
  maxAgeMs: number,
  now = Date.now(),
) {
  const observed = observedAt ? Date.parse(observedAt) : NaN;
  return Number.isFinite(observed) &&
    observed <= now + 5 * 60_000 &&
    now - observed <= maxAgeMs
    ? ('fresh' as const)
    : ('stale' as const);
}

export function createRemoteProvider<S extends z.ZodType, T>(config: {
  key: string;
  url: () => string;
  schema: S;
  ttl: number;
  maxCacheAge: number;
  normalize: (raw: z.output<S>, fetchedAt: string) => DataEnvelope<T>;
}) {
  const cachedSchema = z.object({
    version: z.literal(1),
    storedAt: z.number().finite(),
    raw: z.unknown(),
  });
  // In-memory backoff also works when browser storage is blocked.
  let memoryRetryAt = 0;
  let inFlight: Promise<DataEnvelope<T>> | null = null;
  return async (
    signal?: AbortSignal,
    options: RefreshOptions = {},
  ): Promise<DataEnvelope<T>> => {
    const now = Date.now();
    const parsed = cachedSchema.safeParse(read(config.key));
    const rawCache = config.schema.safeParse(
      parsed.success ? parsed.data.raw : undefined,
    );
    const cached =
      parsed.success &&
      rawCache.success &&
      parsed.data.storedAt <= now &&
      now - parsed.data.storedAt <= config.maxCacheAge
        ? { storedAt: parsed.data.storedAt, raw: rawCache.data }
        : null;
    const envelope = cached
      ? config.normalize(cached.raw, new Date(cached.storedAt).toISOString())
      : null;
    const fallback = (message: string, until?: number) => {
      if (envelope)
        return {
          ...envelope,
          freshness: 'stale' as const,
          refreshError: message,
        };
      // Keep the rate-limit deadline so callers can tell "wait" apart from "broken".
      throw new ProviderError(message, until);
    };
    if (!options.force && cached && now - cached.storedAt < config.ttl)
      return envelope!;
    const savedRetryAt = z
      .number()
      .finite()
      .safeParse(read(`${config.key}:retry`));
    const retryAt = Math.max(
      memoryRetryAt,
      savedRetryAt.success ? savedRetryAt.data : 0,
    );
    if (retryAt > now)
      return fallback(
        'Die Datenquelle begrenzt Anfragen. Bitte später erneut versuchen.',
        retryAt,
      );
    // AbortSignals are per caller; TanStack Query deduplicates UI requests.
    if (inFlight && !signal) return inFlight;
    const request = async () => {
      try {
        const raw = config.schema.parse(await fetchJson(config.url(), signal));
        if (signal?.aborted) throw signal.reason;
        const fetchedAt = new Date().toISOString();
        const result = config.normalize(raw, fetchedAt);
        write(config.key, { version: 1, storedAt: Date.now(), raw });
        return result;
      } catch (error) {
        if (signal?.aborted) throw error;
        if (error instanceof ProviderError && error.retryAt) {
          memoryRetryAt = error.retryAt;
          write(`${config.key}:retry`, error.retryAt);
        }
        return fallback(
          error instanceof z.ZodError
            ? 'Die Datenquelle liefert unvollständige oder ungültige Daten.'
            : typeof error === 'object' &&
                error !== null &&
                'name' in error &&
                error.name === 'TimeoutError'
              ? 'Die Datenquelle antwortet nicht rechtzeitig.'
              : error instanceof Error
                ? error.message
                : 'Daten konnten nicht geladen werden.',
          error instanceof ProviderError ? error.retryAt : undefined,
        );
      } finally {
        inFlight = null;
      }
    };
    inFlight = request();
    return inFlight;
  };
}
