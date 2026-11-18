import { gpsStatsSchema, gpsTrackUploadSchema } from '@skiurlaub/shared';
import type { GpsTrackSummary } from '@skiurlaub/shared';
import { rateLimit } from './auth';
import type { Env } from './env';
import { body, HttpError, json } from './http';
import type { CurrentSession } from './sessions';

const MAX_UPLOAD_BYTES = 1_500_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// gzip magic (1f 8b 08) in base64 starts with "H4sI"; the rest must be plain base64.
const GZIP_BASE64 = /^H4sI[A-Za-z0-9+/]*={0,2}$/;

const notFound = () =>
  new HttpError(404, 'NOT_FOUND', 'Die Ressource ist nicht verfügbar.');

type Row = {
  id: string;
  client_track_id: string;
  started_at: number;
  ended_at: number | null;
  point_count: number;
  stats_json: string;
  created_at: number;
  revision: number;
};
const summary = (row: Row): GpsTrackSummary => ({
  id: row.id,
  clientTrackId: row.client_track_id,
  startedAt: row.started_at,
  endedAt: row.ended_at,
  pointCount: row.point_count,
  stats: gpsStatsSchema.parse(JSON.parse(row.stats_json)),
  createdAt: new Date(row.created_at).toISOString(),
  revision: row.revision,
});
const columns =
  'id, client_track_id, started_at, ended_at, point_count, stats_json, created_at, revision';

// The Worker stores the compressed track as an opaque base64 text and does NOT unpack it:
// the Free plan allows only 10 ms CPU per request (decoding a full ski day exceeded that
// budget). Consequently point count and stats are as claimed by the owner's device, and
// whoever reads a track later (the owner now, group members in a later phase) must decode it
// defensively - the codec in packages/gps enforces size and point limits.
// Idempotent per (user, clientTrackId): identical content returns the stored row.
export async function uploadGpsTrack(
  request: Request,
  env: Env,
  user: CurrentSession,
  clientTrackId: string,
): Promise<GpsTrackSummary> {
  if (!UUID.test(clientTrackId)) throw notFound();
  await rateLimit(request, env, 'gps-upload', 30, 60 * 60_000, user.id);
  const input = gpsTrackUploadSchema.parse(
    await body(request, MAX_UPLOAD_BYTES),
  );
  if (!GZIP_BASE64.test(input.data))
    throw new HttpError(400, 'INVALID_TRACK', 'Die Aufzeichnung ist ungültig.');
  await env.DB.prepare(
    `INSERT INTO gps_tracks(id, user_id, client_track_id, started_at, ended_at, point_count, format_version, algorithm_version, alt_ref, data_b64, stats_json, stats_source, created_at, revision)
    VALUES(?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 'client', ?, 1)
    ON CONFLICT(user_id, client_track_id) DO UPDATE SET
      started_at = excluded.started_at, ended_at = excluded.ended_at, point_count = excluded.point_count,
      algorithm_version = excluded.algorithm_version, alt_ref = excluded.alt_ref, data_b64 = excluded.data_b64,
      stats_json = excluded.stats_json, revision = gps_tracks.revision + 1
    WHERE gps_tracks.data_b64 <> excluded.data_b64 OR gps_tracks.stats_json <> excluded.stats_json`,
  )
    .bind(
      crypto.randomUUID(),
      user.id,
      clientTrackId,
      input.startedAt,
      input.endedAt,
      input.pointCount,
      input.algorithmVersion,
      input.altRef,
      input.data,
      JSON.stringify(input.stats),
      Date.now(),
    )
    .run();
  const row = await env.DB.prepare(
    `SELECT ${columns} FROM gps_tracks WHERE user_id = ? AND client_track_id = ?`,
  )
    .bind(user.id, clientTrackId)
    .first<Row>();
  return summary(row!);
}

// Strictly the caller's own tracks. Sharing with a group is a later, explicit step.
export async function listGpsTracks(env: Env, user: CurrentSession) {
  const rows = await env.DB.prepare(
    `SELECT ${columns} FROM gps_tracks WHERE user_id = ? ORDER BY started_at DESC LIMIT 100`,
  )
    .bind(user.id)
    .all<Row>();
  return { tracks: rows.results.map(summary) };
}

export async function readGpsTrackData(
  env: Env,
  user: CurrentSession,
  id: string,
): Promise<Response> {
  if (!UUID.test(id)) throw notFound();
  const row = await env.DB.prepare(
    'SELECT data_b64 FROM gps_tracks WHERE id = ? AND user_id = ?',
  )
    .bind(id, user.id)
    .first<{ data_b64: string }>();
  if (!row) throw notFound();
  return json({ data: row.data_b64 });
}

export async function deleteGpsTrack(
  env: Env,
  user: CurrentSession,
  id: string,
): Promise<void> {
  if (!UUID.test(id)) throw notFound();
  const result = await env.DB.prepare(
    'DELETE FROM gps_tracks WHERE id = ? AND user_id = ?',
  )
    .bind(id, user.id)
    .run();
  if (!result.meta.changes) throw notFound();
}
