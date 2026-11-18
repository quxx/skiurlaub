import { decompressTrack, TrackCodecError } from '@skiurlaub/gps';
import { gpsStatsSchema, gpsTrackUploadSchema } from '@skiurlaub/shared';
import type { GpsTrackSummary } from '@skiurlaub/shared';
import { rateLimit } from './auth';
import type { Env } from './env';
import { body, HttpError } from './http';
import type { CurrentSession } from './sessions';

const MAX_BLOB_BYTES = 1_000_000;
const MAX_UPLOAD_BYTES = 1_500_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const notFound = () =>
  new HttpError(404, 'NOT_FOUND', 'Die Ressource ist nicht verfügbar.');

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

function toBytes(value: unknown): Uint8Array {
  // D1 returns BLOBs as ArrayBuffer or number[] depending on the runtime.
  if (Array.isArray(value)) return new Uint8Array(value as number[]);
  return new Uint8Array(value as ArrayBuffer);
}

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

// Idempotent per (user, clientTrackId): the same recording uploaded again with the same
// content returns the stored row; changed content raises the revision.
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
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(input.data), (char) => char.charCodeAt(0));
  } catch {
    throw new HttpError(400, 'INVALID_TRACK', 'Die Aufzeichnung ist ungültig.');
  }
  if (bytes.length > MAX_BLOB_BYTES)
    throw new HttpError(
      413,
      'TRACK_TOO_LARGE',
      'Die Aufzeichnung ist zu groß.',
    );
  // The blob must really be a track in our format (bounded decompression) and agree
  // with the declared metadata.
  let points;
  try {
    points = await decompressTrack(bytes);
  } catch (error) {
    if (error instanceof TrackCodecError)
      throw new HttpError(
        400,
        'INVALID_TRACK',
        'Die Aufzeichnung ist ungültig.',
      );
    throw error;
  }
  if (points.length !== input.pointCount || points.length < 2)
    throw new HttpError(400, 'INVALID_TRACK', 'Die Aufzeichnung ist ungültig.');
  const checksum = await sha256(bytes);
  const now = Date.now();
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  await env.DB.prepare(
    `INSERT INTO gps_tracks(id, user_id, client_track_id, started_at, ended_at, point_count, format_version, algorithm_version, alt_ref, data, checksum, stats_json, stats_source, created_at, revision)
    VALUES(?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'client', ?, 1)
    ON CONFLICT(user_id, client_track_id) DO UPDATE SET
      started_at = excluded.started_at, ended_at = excluded.ended_at, point_count = excluded.point_count,
      algorithm_version = excluded.algorithm_version, alt_ref = excluded.alt_ref, data = excluded.data,
      checksum = excluded.checksum, stats_json = excluded.stats_json,
      revision = gps_tracks.revision + 1
    WHERE gps_tracks.checksum <> excluded.checksum OR gps_tracks.stats_json <> excluded.stats_json`,
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
      arrayBuffer,
      checksum,
      JSON.stringify(input.stats),
      now,
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
    `SELECT ${columns} FROM gps_tracks WHERE user_id = ? ORDER BY started_at DESC LIMIT 200`,
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
    'SELECT data FROM gps_tracks WHERE id = ? AND user_id = ?',
  )
    .bind(id, user.id)
    .first<{ data: unknown }>();
  if (!row) throw notFound();
  return new Response(toBytes(row.data), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
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
