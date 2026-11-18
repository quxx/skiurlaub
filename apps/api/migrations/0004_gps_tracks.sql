-- GPS tracks (optional module). One row per uploaded recording and owner.
-- `data` is the compressed, versioned track (see packages/gps codec), bounded to 1 MB so a
-- row stays far below D1's 2 MB limit. D1 holds metadata, summary values and the blob;
-- no row per GPS fix. Raw data and derived stats are kept apart (stats can be recomputed
-- from `data` when algorithm_version changes).
PRAGMA foreign_keys = ON;

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
  data BLOB NOT NULL CHECK(length(data) <= 1000000),
  checksum TEXT NOT NULL,
  stats_json TEXT NOT NULL CHECK(length(stats_json) <= 4096),
-- stats_source: stats come from the uploading device (the Worker CPU budget does not allow recomputing).
  stats_source TEXT NOT NULL DEFAULT 'client' CHECK(stats_source IN ('client', 'server')),
  created_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  UNIQUE(user_id, client_track_id)
);
CREATE INDEX gps_track_user_time ON gps_tracks(user_id, started_at);
