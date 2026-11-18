-- Phase 4: provider-independent skiing days (from Skiline import/mock), resorts and sync jobs.
-- Ski passes, group sharing and GPS tracks follow in later phases.
PRAGMA foreign_keys = ON;

-- Shared master data. Names come from imports and are only used when a resort is
-- first created; they are never overwritten by later imports.
CREATE TABLE ski_resorts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  time_zone TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE resort_provider_ids (
  resort_id TEXT NOT NULL REFERENCES ski_resorts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('skiline')),
  external_id TEXT NOT NULL CHECK(length(external_id) BETWEEN 1 AND 64),
  PRIMARY KEY(provider, external_id)
);
CREATE INDEX resort_provider_resort ON resort_provider_ids(resort_id);

-- One row per skiing day and owner. Dedup: UNIQUE(user_id, source, external_id).
-- raw_payload keeps the provider's untouched inner JSON (bounded); calculated and
-- accepted values live in skiing_day_statistics.
CREATE TABLE skiing_days (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resort_id TEXT REFERENCES ski_resorts(id) ON DELETE SET NULL,
  local_date TEXT NOT NULL CHECK(local_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  source TEXT NOT NULL CHECK(source IN ('skiline', 'import')),
  external_id TEXT NOT NULL CHECK(length(external_id) BETWEEN 1 AND 64),
  content_hash TEXT NOT NULL,
  raw_payload TEXT NOT NULL CHECK(length(raw_payload) <= 524288),
  synced_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  UNIQUE(user_id, source, external_id)
);
CREATE INDEX skiing_day_user_date ON skiing_days(user_id, local_date);
CREATE INDEX skiing_day_resort ON skiing_days(resort_id);

-- slope_distance_unit stays 'unknown' until the provider unit is verified.
CREATE TABLE skiing_day_statistics (
  id TEXT PRIMARY KEY,
  day_id TEXT NOT NULL UNIQUE REFERENCES skiing_days(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK(source IN ('skiline', 'import')),
  vertical_m REAL NOT NULL CHECK(vertical_m >= 0),
  lift_count INTEGER NOT NULL CHECK(lift_count >= 0),
  slope_distance_raw REAL NOT NULL CHECK(slope_distance_raw >= 0),
  slope_distance_unit TEXT NOT NULL DEFAULT 'unknown' CHECK(slope_distance_unit IN ('unknown', 'm', 'km')),
  quality TEXT NOT NULL DEFAULT 'unverified' CHECK(quality IN ('unverified', 'verified'))
);

-- Idempotent job log. A repeated identical import reuses the same job row.
CREATE TABLE sync_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('import', 'fetch', 'refresh')),
  idempotency_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('queued', 'running', 'succeeded', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 1 CHECK(attempts >= 1),
  last_attempt_at INTEGER NOT NULL,
  last_success_at INTEGER,
  summary_json TEXT CHECK(summary_json IS NULL OR length(summary_json) <= 8192),
  UNIQUE(user_id, idempotency_key)
);
CREATE INDEX sync_job_user_time ON sync_jobs(user_id, kind, last_attempt_at);
