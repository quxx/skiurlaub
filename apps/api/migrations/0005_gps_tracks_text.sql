-- The Worker Free plan allows only 10 ms CPU per request. Decoding, decompressing and hashing a
-- track on upload measured too close to that limit, so the Worker now stores the compressed track
-- as an opaque base64 text and does not unpack it. The owner device validates on read.
-- Rebuild of gps_tracks: the table was created only minutes before and held test data.
DROP TABLE gps_tracks;

CREATE TABLE gps_tracks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_track_id TEXT NOT NULL CHECK(length(client_track_id) = 36),
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  point_count INTEGER NOT NULL CHECK(point_count BETWEEN 2 AND 200000),
  format_version INTEGER NOT NULL CHECK(format_version >= 1),
  algorithm_version INTEGER NOT NULL CHECK(algorithm_version >= 1),
  alt_ref TEXT CHECK(alt_ref IS NULL OR alt_ref IN ('msl', 'ellipsoid')),
  data_b64 TEXT NOT NULL CHECK(length(data_b64) <= 1400000),
  stats_json TEXT NOT NULL CHECK(length(stats_json) <= 4096),
-- stats_source: stats come from the uploading device, the Worker does not recompute them.
  stats_source TEXT NOT NULL DEFAULT 'client' CHECK(stats_source IN ('client', 'server')),
  created_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  UNIQUE(user_id, client_track_id)
);
CREATE INDEX gps_track_user_time ON gps_tracks(user_id, started_at);
