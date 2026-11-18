import { normalizeExport } from '@skiurlaub/skiline';
import type { ImportReport, SkiingDaysResponse } from '@skiurlaub/shared';
import { rateLimit } from './auth';
import { hash } from './crypto';
import type { Env } from './env';
import { body, HttpError } from './http';
import type { CurrentSession } from './sessions';

// Resort time zones are not part of the provider data we know. Europe/Vienna is
// the zone of the first trip; other resorts need their own zone before live use.
export const DEFAULT_RESORT_TIME_ZONE = 'Europe/Vienna';
// D1 allows a limited number of queries per Worker invocation, so one import is
// bounded and written in chunks of at most 20 days (40 statements) per batch.
export const MAX_DAYS_PER_IMPORT = 366;
const MAX_IMPORT_BYTES = 4 * 1024 * 1024;
const DAYS_PER_BATCH = 20;

// Resort names come from user-supplied imports: drop control characters.
const cleanName = (value: string) =>
  Array.from(value, (char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : char;
  })
    .join('')
    .trim()
    .slice(0, 120);

function declaredDayCount(input: unknown): number {
  const days = Array.isArray(input)
    ? input
    : (input as { skiingDays?: unknown } | null)?.skiingDays;
  return Array.isArray(days) ? days.length : 0;
}

export async function importSkilineExport(
  request: Request,
  env: Env,
  user: CurrentSession,
): Promise<ImportReport> {
  await rateLimit(request, env, 'skiline-import', 10, 60 * 60_000, user.id);
  const input = await body(request, MAX_IMPORT_BYTES);
  if (declaredDayCount(input) > MAX_DAYS_PER_IMPORT)
    throw new HttpError(
      413,
      'TOO_MANY_DAYS',
      `Pro Import sind höchstens ${MAX_DAYS_PER_IMPORT} Skitage erlaubt.`,
    );
  const normalized = normalizeExport(input, {
    defaultTimeZone: DEFAULT_RESORT_TIME_ZONE,
  });
  if (!normalized.ok)
    throw new HttpError(
      400,
      'INVALID_EXPORT',
      'Die Datei hat nicht das erwartete Skiline-Format.',
    );
  const { days, resorts, rejected, duplicatesInPayload } = normalized.report;

  const hashed = await Promise.all(
    days.map(async (day) => ({
      day,
      contentHash: await hash(
        `${day.localDate}|${day.resortExternalId ?? ''}|${day.rawData}`,
      ),
    })),
  );
  const existing = new Map(
    (
      await env.DB.prepare(
        "SELECT external_id, content_hash FROM skiing_days WHERE user_id = ? AND source = 'import'",
      )
        .bind(user.id)
        .all<{ external_id: string; content_hash: string }>()
    ).results.map((row) => [row.external_id, row.content_hash]),
  );
  const changed = hashed.filter(
    ({ day, contentHash }) => existing.get(day.externalId) !== contentHash,
  );
  const created = changed.filter(
    ({ day }) => !existing.has(day.externalId),
  ).length;
  const updated = changed.length - created;
  const unchanged = hashed.length - changed.length;

  const now = Date.now();
  const resortNames = new Map(resorts.map((r) => [r.externalId, r.name]));
  const resortIds = [
    ...new Set(
      changed.flatMap(({ day }) =>
        day.resortExternalId ? [day.resortExternalId] : [],
      ),
    ),
  ];
  // Create each referenced resort once, only if no mapping exists yet.
  const resortStatements = resortIds.flatMap((externalId) => {
    const resortId = crypto.randomUUID();
    const name =
      cleanName(resortNames.get(externalId) ?? '') ||
      `Skiline-Gebiet ${externalId}`;
    const missing = `NOT EXISTS (SELECT 1 FROM resort_provider_ids WHERE provider = 'skiline' AND external_id = ?)`;
    return [
      env.DB.prepare(
        `INSERT OR IGNORE INTO ski_resorts(id, name, time_zone, created_at) SELECT ?, ?, ?, ? WHERE ${missing}`,
      ).bind(resortId, name, DEFAULT_RESORT_TIME_ZONE, now, externalId),
      env.DB.prepare(
        `INSERT OR IGNORE INTO resort_provider_ids(resort_id, provider, external_id) SELECT ?, 'skiline', ? WHERE ${missing}`,
      ).bind(resortId, externalId, externalId),
    ];
  });
  for (let i = 0; i < resortStatements.length; i += 40)
    await env.DB.batch(resortStatements.slice(i, i + 40));

  for (let i = 0; i < changed.length; i += DAYS_PER_BATCH) {
    const statements = changed
      .slice(i, i + DAYS_PER_BATCH)
      .flatMap(({ day, contentHash }) => [
        env.DB.prepare(
          `INSERT INTO skiing_days(id, user_id, resort_id, local_date, source, external_id, content_hash, raw_payload, synced_at, revision)
          VALUES(?, ?, (SELECT resort_id FROM resort_provider_ids WHERE provider = 'skiline' AND external_id = ?), ?, 'import', ?, ?, ?, ?, 1)
          ON CONFLICT(user_id, source, external_id) DO UPDATE SET
            resort_id = excluded.resort_id, local_date = excluded.local_date,
            content_hash = excluded.content_hash, raw_payload = excluded.raw_payload,
            synced_at = excluded.synced_at, revision = skiing_days.revision + 1`,
        ).bind(
          crypto.randomUUID(),
          user.id,
          day.resortExternalId,
          day.localDate,
          day.externalId,
          contentHash,
          day.rawData,
          now,
        ),
        env.DB.prepare(
          `INSERT INTO skiing_day_statistics(id, day_id, source, vertical_m, lift_count, slope_distance_raw, slope_distance_unit, quality)
          SELECT ?, id, 'import', ?, ?, ?, 'unknown', 'unverified' FROM skiing_days
          WHERE user_id = ? AND source = 'import' AND external_id = ?
          ON CONFLICT(day_id) DO UPDATE SET
            vertical_m = excluded.vertical_m, lift_count = excluded.lift_count,
            slope_distance_raw = excluded.slope_distance_raw`,
        ).bind(
          crypto.randomUUID(),
          day.verticalMeters,
          day.liftCount,
          day.slopeDistanceRaw,
          user.id,
          day.externalId,
        ),
      ]);
    await env.DB.batch(statements);
  }

  // Same content -> same idempotency key -> the same job row is reused.
  const key = await hash(
    'import:' +
      hashed
        .map(({ day, contentHash }) => `${day.externalId}=${contentHash}`)
        .sort()
        .join(','),
  );
  const summary = {
    created,
    updated,
    unchanged,
    rejected: rejected.length,
    duplicatesInPayload,
  };
  const job = await env.DB.prepare(
    `INSERT INTO sync_jobs(id, user_id, kind, idempotency_key, state, attempts, last_attempt_at, last_success_at, summary_json)
    VALUES(?, ?, 'import', ?, 'succeeded', 1, ?, ?, ?)
    ON CONFLICT(user_id, idempotency_key) DO UPDATE SET
      attempts = sync_jobs.attempts + 1, last_attempt_at = excluded.last_attempt_at,
      last_success_at = excluded.last_success_at, state = 'succeeded', summary_json = excluded.summary_json
    RETURNING id`,
  )
    .bind(crypto.randomUUID(), user.id, key, now, now, JSON.stringify(summary))
    .first<{ id: string }>();
  return {
    jobId: job!.id,
    total: days.length + rejected.length,
    created,
    updated,
    unchanged,
    duplicatesInPayload,
    rejected,
  };
}

// Strictly the caller's own data; group sharing is a later phase.
export async function listSkiingDays(
  env: Env,
  user: CurrentSession,
): Promise<SkiingDaysResponse> {
  const rows = await env.DB.prepare(
    `SELECT d.id, d.local_date, d.source, d.synced_at, r.id AS resort_id, r.name AS resort_name,
      s.vertical_m, s.lift_count, s.slope_distance_raw, s.slope_distance_unit
    FROM skiing_days d
    LEFT JOIN ski_resorts r ON r.id = d.resort_id
    JOIN skiing_day_statistics s ON s.day_id = d.id
    WHERE d.user_id = ?
    ORDER BY d.local_date DESC, d.id LIMIT 400`,
  )
    .bind(user.id)
    .all<{
      id: string;
      local_date: string;
      source: 'skiline' | 'import';
      synced_at: number;
      resort_id: string | null;
      resort_name: string | null;
      vertical_m: number;
      lift_count: number;
      slope_distance_raw: number;
      slope_distance_unit: 'unknown' | 'm' | 'km';
    }>();
  const last = await env.DB.prepare(
    `SELECT last_attempt_at, state FROM sync_jobs WHERE user_id = ? AND kind = 'import'
    ORDER BY last_attempt_at DESC LIMIT 1`,
  )
    .bind(user.id)
    .first<{
      last_attempt_at: number;
      state: 'queued' | 'running' | 'succeeded' | 'failed';
    }>();
  return {
    days: rows.results.map((row) => ({
      id: row.id,
      localDate: row.local_date,
      source: row.source,
      resort:
        row.resort_id && row.resort_name
          ? { id: row.resort_id, name: row.resort_name }
          : null,
      verticalMeters: row.vertical_m,
      liftCount: row.lift_count,
      slopeDistance: {
        value: row.slope_distance_raw,
        unit: row.slope_distance_unit,
      },
      syncedAt: new Date(row.synced_at).toISOString(),
    })),
    lastImport: last
      ? {
          at: new Date(last.last_attempt_at).toISOString(),
          state: last.state,
        }
      : null,
  };
}

// 404 for missing and foreign ids alike, so ids of other users are not revealed.
export async function deleteSkiingDay(
  env: Env,
  user: CurrentSession,
  id: string,
): Promise<void> {
  const result = await env.DB.prepare(
    'DELETE FROM skiing_days WHERE id = ? AND user_id = ?',
  )
    .bind(id, user.id)
    .run();
  if (!result.meta.changes)
    throw new HttpError(404, 'NOT_FOUND', 'Die Ressource ist nicht verfügbar.');
}
