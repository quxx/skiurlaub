PRAGMA foreign_keys = ON;
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 60),
  created_at INTEGER NOT NULL
);
CREATE TABLE auth_identities (
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY(provider, subject),
  UNIQUE(provider, user_id)
);
CREATE TABLE user_sessions (
  secret_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK(expires_at > created_at)
);
CREATE INDEX session_user ON user_sessions(user_id);
CREATE INDEX session_expiry ON user_sessions(expires_at);
CREATE TABLE auth_challenges (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK(expires_at > created_at),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
  consumed_at INTEGER
);
CREATE INDEX challenge_email ON auth_challenges(email, created_at);
CREATE INDEX challenge_expiry ON auth_challenges(expires_at);
CREATE TABLE auth_rate_limits (
  key_hash TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  count INTEGER NOT NULL CHECK(count > 0),
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(key_hash, bucket)
);
CREATE INDEX rate_expiry ON auth_rate_limits(expires_at);
-- Minimal authorization foundation; group creation/invites remain Phase 7.
CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80)
);
CREATE TABLE group_members (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('admin', 'member')),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY(group_id, user_id)
);
CREATE INDEX member_user ON group_members(user_id, group_id);
