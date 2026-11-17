import type { Env } from './env';
import { isLocal } from './env';
import { hash, randomToken } from './crypto';
import { HttpError, isNativeRequest } from './http';

const day = 24 * 60 * 60_000;
// Idle lifetime: renewed on use (at most once per day) but never beyond
// maxSessionAge after the login that created the session.
export const sessionLifetime = 30 * day;
export const maxSessionAge = 90 * day;
const renewAfter = day;
export async function createSession(
  userId: string,
  request: Request,
  env: Env,
) {
  const token = `${isNativeRequest(request) ? 'skiurlaub_v1_' : ''}${randomToken()}`;
  const now = Date.now();
  const statements = [
    env.DB.prepare(
      'INSERT INTO user_sessions(secret_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)',
    ).bind(await hash(token), userId, now, now + sessionLifetime),
  ];
  const previous = sessionToken(request, env);
  if (previous)
    statements.push(
      env.DB.prepare('DELETE FROM user_sessions WHERE secret_hash = ?').bind(
        await hash(previous),
      ),
    );
  await env.DB.batch(statements);
  return token;
}
function cookieName(env: Env, request: Request) {
  return isLocal(env, request)
    ? 'skiurlaub_local_session'
    : '__Host-skiurlaub_session';
}
export function sessionToken(request: Request, env: Env): string | null {
  const authorization = request.headers.get('authorization');
  if (authorization !== null) {
    if (!isNativeRequest(request)) return null;
    return (
      /^Bearer (skiurlaub_v1_[a-f0-9]{64})$/.exec(authorization)?.[1] ?? null
    );
  }
  const prefix = `${cookieName(env, request)}=`;
  const matches = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((value) => value.trim())
    .filter((value) => value.startsWith(prefix));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(prefix.length);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export function sessionCookie(token: string, request: Request, env: Env) {
  return `${cookieName(env, request)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? sessionLifetime / 1000 : 0}${isLocal(env, request) ? '' : '; Secure'}`;
}
export type CurrentSession = {
  id: string;
  email: string;
  display_name: string;
  expires_at: number;
  created_at: number;
  session_hash: string;
};
export async function requireSession(
  request: Request,
  env: Env,
): Promise<CurrentSession> {
  const token = sessionToken(request, env);
  if (!token)
    throw new HttpError(401, 'LOGIN_REQUIRED', 'Bitte melde dich an.');
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.display_name, s.expires_at, s.created_at, s.secret_hash AS session_hash
    FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.secret_hash = ? AND s.expires_at > ?`,
  )
    .bind(await hash(token), Date.now())
    .first<CurrentSession>();
  if (!row)
    throw new HttpError(
      401,
      'LOGIN_REQUIRED',
      'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.',
    );
  const now = Date.now();
  const renewed = Math.min(
    now + sessionLifetime,
    row.created_at + maxSessionAge,
  );
  if (renewed - row.expires_at >= renewAfter) {
    await env.DB.prepare(
      'UPDATE user_sessions SET expires_at = ? WHERE secret_hash = ? AND expires_at < ?',
    )
      .bind(renewed, row.session_hash, renewed)
      .run();
    row.expires_at = renewed;
  }
  return row;
}
export function userDto(session: CurrentSession) {
  return {
    id: session.id,
    email: session.email,
    displayName: session.display_name,
    sessionExpiresAt: new Date(session.expires_at).toISOString(),
  };
}
export async function requireMembership(
  request: Request,
  env: Env,
  groupId: string,
) {
  const user = await requireSession(request, env);
  const group = await env.DB.prepare(
    `SELECT g.id, g.name, m.role FROM groups g JOIN group_members m ON m.group_id = g.id WHERE g.id = ? AND m.user_id = ?`,
  )
    .bind(groupId, user.id)
    .first<{ id: string; name: string; role: string }>();
  if (!group)
    throw new HttpError(404, 'NOT_FOUND', 'Die Ressource ist nicht verfügbar.');
  return group;
}
