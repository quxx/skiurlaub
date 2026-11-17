import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

const origin = 'http://127.0.0.1:5173';
const clientId = '123456-testclient.apps.googleusercontent.com';
let runtime: Miniflare;
let db: D1Database;
let key: CryptoKey;
let wrongKey: CryptoKey;
async function call(
  path: string,
  data?: unknown,
  token?: string,
  headers = {},
) {
  return runtime.dispatchFetch(`${origin}/api/v1${path}`, {
    method: data === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Skiurlaub-Request': '1',
      'X-Skiurlaub-Client': 'android',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}
async function challenge() {
  const response = await call('/auth/google/challenge', {});
  expect(response.status).toBe(200);
  return (await response.json()) as { challengeId: string; nonce: string };
}
async function proof(
  nonce: string,
  claims: Record<string, unknown> = {},
  signingKey = key,
) {
  return new SignJWT({
    email: 'skier@workspace.example.invalid',
    email_verified: true,
    hd: 'workspace.example.invalid',
    nonce,
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer('https://accounts.google.com')
    .setAudience(clientId)
    .setSubject('google-stable-subject')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(signingKey);
}
async function verify(
  input: { challengeId: string; nonce: string },
  claims = {},
  signingKey = key,
) {
  return call('/auth/google/verify', {
    challengeId: input.challengeId,
    idToken: await proof(input.nonce, claims, signingKey),
  });
}
beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  key = pair.privateKey;
  wrongKey = (await generateKeyPair('RS256')).privateKey;
  const jwk = {
    ...(await exportJWK(pair.publicKey)),
    kid: 'test-key',
    alg: 'RS256',
    use: 'sig',
  };
  runtime = new Miniflare({
    modules: true,
    script: await readFile(
      new URL('../dist/index.js', import.meta.url),
      'utf8',
    ),
    compatibilityDate: '2026-07-30',
    d1Databases: { DB: 'google-test' },
    bindings: {
      ENVIRONMENT: 'local',
      ENABLE_LOCAL_AUTH: 'true',
      APP_ORIGIN: origin,
      GOOGLE_CLIENT_ID: clientId,
      ALLOWED_EMAILS:
        'skier@workspace.example.invalid,thirdparty@example.invalid',
    },
    // Substitute only the external JWKS response; the production JWT verifier remains unchanged.
    outboundService: async (request: { url: string }) => {
      expect(request.url).toBe('https://www.googleapis.com/oauth2/v3/certs');
      return new Response(JSON.stringify({ keys: [jwk] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  db = (await runtime.getD1Database('DB')) as unknown as D1Database;
  for (const file of ['0001_identity.sql', '0002_google_login.sql']) {
    const migration = await readFile(
      new URL(`../migrations/${file}`, import.meta.url),
      'utf8',
    );
    for (const sql of migration.replace(/^--.*$/gm, '').split(';'))
      if (sql.trim()) await db.prepare(sql).run();
  }
});
beforeEach(async () => {
  await db.batch(
    [
      'user_sessions',
      'auth_identities',
      'users',
      'google_login_challenges',
      'auth_rate_limits',
    ].map((table) => db.prepare(`DELETE FROM ${table}`)),
  );
});
afterAll(async () => {
  await runtime?.dispose();
});

it('issues only an own hashed native session, preserves identity and revokes logout', async () => {
  expect(await (await call('/auth/status')).json()).toMatchObject({
    google: true,
  });
  const response = await verify(await challenge());
  expect(response.status).toBe(200);
  expect(response.headers.get('set-cookie')).toBeNull();
  const result = (await response.json()) as { sessionToken: string };
  expect(result.sessionToken).toMatch(/^skiurlaub_v1_[a-f0-9]{64}$/);
  const stored = await db
    .prepare('SELECT secret_hash FROM user_sessions')
    .first<{ secret_hash: string }>();
  expect(stored?.secret_hash).not.toBe(result.sessionToken);
  const user = (await (
    await call('/me', undefined, result.sessionToken)
  ).json()) as { id: string; email: string; displayName: string };
  const again = await verify(await challenge());
  expect(again.status).toBe(200);
  const next = (await again.json()) as { sessionToken: string };
  expect(
    await (await call('/me', undefined, next.sessionToken)).json(),
  ).toMatchObject({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  });
  expect((await call('/auth/logout', {}, next.sessionToken)).status).toBe(200);
  expect((await call('/me', undefined, next.sessionToken)).status).toBe(401);
});

it('rejects replay and consumes one challenge only once under concurrent verification', async () => {
  const input = await challenge();
  const responses = await Promise.all([verify(input), verify(input)]);
  expect(responses.map((response) => response.status).sort()).toEqual([
    200, 401,
  ]);
  expect((await verify(input)).status).toBe(401);
});

it('rejects a forged signature, wrong nonce, unverified email and unapproved accounts', async () => {
  expect((await verify(await challenge(), {}, wrongKey)).status).toBe(401);
  expect(
    (await verify(await challenge(), { nonce: 'other-nonce' })).status,
  ).toBe(401);
  expect(
    (await verify(await challenge(), { email_verified: false })).status,
  ).toBe(401);
  expect(
    (
      await verify(await challenge(), {
        email: 'other@workspace.example.invalid',
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await verify(await challenge(), {
        email: 'thirdparty@example.invalid',
        hd: undefined,
      })
    ).status,
  ).toBe(403);
});

it.each(['aud', 'iss', 'exp'])('rejects invalid %s claims', async (claim) => {
  const input = await challenge();
  const idToken = await new SignJWT({
    email: 'skier@workspace.example.invalid',
    email_verified: true,
    hd: 'workspace.example.invalid',
    nonce: input.nonce,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(
      claim === 'iss'
        ? 'https://attacker.example.invalid'
        : 'https://accounts.google.com',
    )
    .setAudience(claim === 'aud' ? 'another-client' : clientId)
    .setSubject('google-stable-subject')
    .setIssuedAt()
    .setExpirationTime(
      claim === 'exp' ? Math.floor(Date.now() / 1000) - 60 : '5m',
    )
    .sign(key);
  expect(
    (
      await call('/auth/google/verify', {
        challengeId: input.challengeId,
        idToken,
      })
    ).status,
  ).toBe(401);
});

it('expires challenges, bounds attempts and never links by email alone', async () => {
  const input = await challenge();
  for (let attempt = 0; attempt < 5; attempt++)
    expect((await verify(input, { nonce: 'wrong' })).status).toBe(401);
  expect((await verify(input)).status).toBe(401);
  const expired = await challenge();
  await db
    .prepare(
      'UPDATE google_login_challenges SET created_at = ?, expires_at = ? WHERE id = ?',
    )
    .bind(Date.now() - 2000, Date.now() - 1000, expired.challengeId)
    .run();
  expect((await verify(expired)).status).toBe(401);
  await db
    .prepare(
      'INSERT INTO users(id,email,display_name,created_at) VALUES(?,?,?,?)',
    )
    .bind(
      crypto.randomUUID(),
      'skier@workspace.example.invalid',
      'Existing',
      Date.now(),
    )
    .run();
  expect((await verify(await challenge())).status).toBe(409);
  expect(await db.prepare('SELECT * FROM auth_identities').first()).toBeNull();
});

it('blocks browser transport and provider tokens used directly as app sessions', async () => {
  expect(
    await (
      await call('/auth/status', undefined, undefined, { Origin: origin })
    ).json(),
  ).toMatchObject({ google: false });
  expect(
    (await call('/auth/google/challenge', {}, undefined, { Origin: origin }))
      .status,
  ).toBe(503);
  expect((await call('/me', undefined, await proof('unused'))).status).toBe(
    401,
  );
});
