import { createRemoteJWKSet, jwtVerify } from 'jose';
import { emailSchema } from '@skiurlaub/shared';
import type { Env } from './env';
import { googleLoginEnabled } from './env';
import { hash, randomToken } from './crypto';
import { HttpError, isNativeRequest } from './http';
import { rateLimit } from './auth';
import { createSession } from './sessions';

const keys = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
  { timeoutDuration: 5000 },
);
function enabled(request: Request, env: Env) {
  if (!isNativeRequest(request) || !googleLoginEnabled(env, request))
    throw new HttpError(
      503,
      'GOOGLE_UNAVAILABLE',
      'Die Google-Anmeldung ist noch nicht eingerichtet.',
    );
}
export async function googleChallenge(request: Request, env: Env) {
  enabled(request, env);
  await rateLimit(request, env, 'google-start', 15, 15 * 60_000);
  const now = Date.now();
  const challengeId = crypto.randomUUID();
  const nonce = randomToken();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM user_sessions WHERE expires_at < ?').bind(now),
    env.DB.prepare('DELETE FROM auth_rate_limits WHERE expires_at < ?').bind(
      now,
    ),
    env.DB.prepare(
      'DELETE FROM google_login_challenges WHERE expires_at < ?',
    ).bind(now),
    env.DB.prepare(
      'INSERT INTO google_login_challenges(id,nonce_hash,created_at,expires_at) VALUES(?,?,?,?)',
    ).bind(challengeId, await hash(nonce), now, now + 5 * 60_000),
  ]);
  return { challengeId, nonce };
}
export async function googleVerify(
  challengeId: string,
  idToken: string,
  request: Request,
  env: Env,
) {
  enabled(request, env);
  await rateLimit(request, env, 'google-verify', 30, 15 * 60_000);
  const invalid = () =>
    new HttpError(
      401,
      'GOOGLE_INVALID',
      'Die Google-Anmeldung konnte nicht bestätigt werden. Bitte starte sie erneut.',
    );
  const challenge = await env.DB.prepare(
    'UPDATE google_login_challenges SET attempts = attempts + 1 WHERE id = ? AND consumed_at IS NULL AND expires_at > ? AND attempts < 5 RETURNING nonce_hash',
  )
    .bind(challengeId, Date.now())
    .first<{ nonce_hash: string }>();
  if (!challenge) throw invalid();
  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, keys, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: env.GOOGLE_CLIENT_ID,
      algorithms: ['RS256'],
      requiredClaims: ['sub', 'iat', 'exp', 'email', 'email_verified', 'nonce'],
      maxTokenAge: '10m',
      clockTolerance: 30,
    }));
  } catch {
    throw invalid();
  }
  const email = emailSchema.safeParse(payload.email);
  if (
    !email.success ||
    payload.email_verified !== true ||
    typeof payload.sub !== 'string' ||
    !payload.sub.length ||
    payload.sub.length > 255 ||
    typeof payload.nonce !== 'string' ||
    (await hash(payload.nonce)) !== challenge.nonce_hash
  )
    throw invalid();
  // For automatic email allowlisting, Google must currently own the email domain.
  if (
    !email.data.endsWith('@gmail.com') &&
    !(typeof payload.hd === 'string' && payload.hd.length > 0)
  )
    throw new HttpError(
      403,
      'GOOGLE_EMAIL_PROOF',
      'Bitte verwende ein freigegebenes Gmail- oder Google-Workspace-Konto.',
    );
  if (
    !(env.ALLOWED_EMAILS ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .includes(email.data)
  )
    throw new HttpError(
      403,
      'ACCOUNT_NOT_ALLOWED',
      'Dieses Konto ist für die App nicht freigegeben.',
    );
  const consumed = await env.DB.prepare(
    'UPDATE google_login_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL AND expires_at > ? RETURNING id',
  )
    .bind(Date.now(), challengeId, Date.now())
    .first();
  if (!consumed) throw invalid();
  let identity = await env.DB.prepare(
    'SELECT user_id FROM auth_identities WHERE provider = ? AND subject = ?',
  )
    .bind('google', payload.sub)
    .first<{ user_id: string }>();
  if (!identity) {
    // Never merge an existing account merely because another provider supplied the same email.
    const existing = await env.DB.prepare(
      'SELECT id FROM users WHERE email = ?',
    )
      .bind(email.data)
      .first();
    if (existing)
      throw new HttpError(
        409,
        'ACCOUNT_LINK_REQUIRED',
        'Zu dieser Adresse gibt es bereits ein App-Konto. Eine Verknüpfung ist erforderlich.',
      );
    const userId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO users(id,email,display_name,created_at) VALUES(?,?,?,?)',
      ).bind(userId, email.data, 'Skifreund', Date.now()),
      env.DB.prepare(
        'INSERT INTO auth_identities(provider,subject,user_id) VALUES(?,?,?)',
      ).bind('google', payload.sub, userId),
    ]);
    identity = { user_id: userId };
  }
  return createSession(identity.user_id, request, env);
}
