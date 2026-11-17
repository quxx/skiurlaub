import { randomCode, randomToken, mac, verifyMac } from './crypto';
import type { Env } from './env';
import { isLocal, appLoginEnabled } from './env';
import { HttpError } from './http';
import { createSession } from './sessions';

let localSecret: string | undefined;
const outbox = new Map<string, { code: string; expiresAt: number }>();
const secret = (env: Env, request: Request) =>
  isLocal(env, request)
    ? env.AUTH_HMAC_SECRET || (localSecret ??= randomToken())
    : env.AUTH_HMAC_SECRET!;
function allowed(email: string, env: Env, request: Request) {
  if (isLocal(env, request)) return email.endsWith('@example.invalid');
  return (env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .includes(email);
}

export async function rateLimit(
  request: Request,
  env: Env,
  kind: string,
  limit: number,
  windowMs: number,
  subject?: string,
) {
  const now = Date.now();
  // CF-Connecting-IP is set by Cloudflare, not trusted from an arbitrary proxy in production.
  const client =
    subject ?? request.headers.get('cf-connecting-ip') ?? 'unknown';
  const key = await mac(secret(env, request), `rate:${kind}:${client}`);
  const bucket = Math.floor(now / windowMs);
  const result = await env.DB.prepare(
    `INSERT INTO auth_rate_limits(key_hash, bucket, count, expires_at) VALUES(?, ?, 1, ?)
    ON CONFLICT(key_hash, bucket) DO UPDATE SET count = count + 1 RETURNING count`,
  )
    .bind(key, bucket, (bucket + 1) * windowMs)
    .first<{ count: number }>();
  if (!result || result.count > limit)
    throw new HttpError(
      429,
      'RATE_LIMIT',
      'Zu viele Versuche. Bitte versuche es später erneut.',
      Math.max(1, Math.ceil(((bucket + 1) * windowMs - now) / 1000)),
    );
}

export async function requestCode(email: string, request: Request, env: Env) {
  if (!appLoginEnabled(env, request))
    throw new HttpError(
      503,
      'LOGIN_UNAVAILABLE',
      'Der App-Login ist noch nicht eingerichtet.',
    );
  await rateLimit(request, env, 'request-ip', 20, 60 * 60_000);
  await rateLimit(request, env, 'request-email', 3, 15 * 60_000, email);
  await rateLimit(request, env, 'daily-budget', 80, 24 * 60 * 60_000, 'all');
  const now = Date.now();
  const challengeId = crypto.randomUUID();
  const expiresAt = now + 10 * 60_000;
  // Same response for unknown and allowed addresses; no open account registration.
  if (allowed(email, env, request)) {
    const code = randomCode();
    const digest = await mac(
      secret(env, request),
      `code:${challengeId}:${email}:${code}`,
    );
    await env.DB.batch([
      env.DB.prepare(
        'UPDATE auth_challenges SET consumed_at = ? WHERE email = ? AND consumed_at IS NULL',
      ).bind(now, email),
      env.DB.prepare(
        'INSERT INTO auth_challenges(id,email,code_hash,created_at,expires_at) VALUES(?,?,?,?,?)',
      ).bind(challengeId, email, digest, now, expiresAt),
    ]);
    if (isLocal(env, request)) {
      for (const [id, value] of outbox)
        if (value.expiresAt < now) outbox.delete(id);
      if (outbox.size >= 50) outbox.delete(outbox.keys().next().value!);
      outbox.set(challengeId, { code, expiresAt });
    } else {
      // Trusted Worker service binding. No public send endpoint or chosen paid vendor.
      try {
        const response = await env.AUTH_MAILER!.fetch(
          'https://auth-mailer.internal/send',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: email, code, expiresInSeconds: 600 }),
            signal: AbortSignal.timeout(10_000),
          },
        );
        if (!response.ok) throw new Error('delivery failed');
      } catch {
        await env.DB.prepare(
          'UPDATE auth_challenges SET consumed_at = ? WHERE id = ?',
        )
          .bind(Date.now(), challengeId)
          .run();
        // Do not disclose delivery/allowlist status, addresses or secrets.
      }
    }
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM auth_challenges WHERE expires_at < ?').bind(
      now - 60 * 60_000,
    ),
    env.DB.prepare('DELETE FROM user_sessions WHERE expires_at < ?').bind(now),
    env.DB.prepare('DELETE FROM auth_rate_limits WHERE expires_at < ?').bind(
      now,
    ),
  ]);
  return {
    challengeId,
    expiresIn: 600,
    message: 'Falls die Adresse zugelassen ist, wurde ein Code angefordert.',
  };
}

export async function verifyCode(
  challengeId: string,
  code: string,
  request: Request,
  env: Env,
) {
  if (!appLoginEnabled(env, request))
    throw new HttpError(
      503,
      'LOGIN_UNAVAILABLE',
      'Der App-Login ist noch nicht eingerichtet.',
    );
  await rateLimit(request, env, 'verify-ip', 60, 15 * 60_000);
  const challenge = await env.DB.prepare(
    `UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = ? AND consumed_at IS NULL AND expires_at > ? AND attempts < 5
    RETURNING email, code_hash`,
  )
    .bind(challengeId, Date.now())
    .first<{ email: string; code_hash: string }>();
  const invalid = () =>
    new HttpError(
      401,
      'INVALID_CODE',
      'Der Code ist ungültig oder abgelaufen. Bitte fordere einen neuen an.',
    );
  if (
    !challenge ||
    !allowed(challenge.email, env, request) ||
    !(await verifyMac(
      secret(env, request),
      `code:${challengeId}:${challenge.email}:${code}`,
      challenge.code_hash,
    ))
  )
    throw invalid();
  const consumed = await env.DB.prepare(
    'UPDATE auth_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL AND expires_at > ? RETURNING email',
  )
    .bind(Date.now(), challengeId, Date.now())
    .first<{ email: string }>();
  if (!consumed) throw invalid();
  outbox.delete(challengeId);
  const userId = crypto.randomUUID();
  const now = Date.now();
  const statements = [
    env.DB.prepare(
      'INSERT INTO users(id,email,display_name,created_at) VALUES(?,?,?,?) ON CONFLICT(email) DO NOTHING',
    ).bind(userId, consumed.email, 'Skifreund', now),
    env.DB.prepare(
      'INSERT INTO auth_identities(provider,subject,user_id) SELECT ?,?,id FROM users WHERE email = ? ON CONFLICT(provider,subject) DO NOTHING',
    ).bind('app-email', consumed.email, consumed.email),
  ];
  await env.DB.batch(statements);
  const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(consumed.email)
    .first<{ id: string }>();
  if (!user)
    throw new HttpError(
      503,
      'LOGIN_FAILED',
      'Anmeldung momentan nicht möglich.',
    );
  return createSession(user.id, request, env);
}

export function localCode(challengeId: string, request: Request, env: Env) {
  if (!isLocal(env, request))
    throw new HttpError(404, 'NOT_FOUND', 'Nicht verfügbar.');
  const value = outbox.get(challengeId);
  if (!value || value.expiresAt <= Date.now())
    throw new HttpError(404, 'NOT_FOUND', 'Kein lokaler Testcode vorhanden.');
  return { code: value.code };
}
