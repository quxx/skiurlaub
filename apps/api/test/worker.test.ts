import { readFile, readdir } from 'node:fs/promises';
import { URL } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

let runtime: Miniflare;
let db: D1Database;
const origin = 'http://127.0.0.1:5173';
async function call(
  path: string,
  options: {
    method?: string;
    data?: unknown;
    cookie?: string;
    headers?: Record<string, string>;
  } = {},
) {
  const method =
    options.method ?? (options.data === undefined ? 'GET' : 'POST');
  return runtime.dispatchFetch(`${origin}/api/v1${path}`, {
    method,
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      'X-Skiurlaub-Request': '1',
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...options.headers,
    },
    body: options.data === undefined ? undefined : JSON.stringify(options.data),
  });
}
async function challenge(email = 'test@example.invalid') {
  const result = await call('/auth/request-code', { data: { email } });
  expect(result.status).toBe(202);
  const value = (await result.json()) as { challengeId: string };
  const preview = await call('/dev/code', {
    data: { challengeId: value.challengeId },
  });
  expect(preview.status).toBe(200);
  return {
    challengeId: value.challengeId,
    code: ((await preview.json()) as { code: string }).code,
  };
}
async function login(email = 'test@example.invalid') {
  const input = await challenge(email);
  const response = await call('/auth/verify-code', { data: input });
  expect(response.status).toBe(200);
  return {
    cookie: response.headers.get('set-cookie')!.split(';')[0],
    header: response.headers.get('set-cookie')!,
    input,
  };
}
beforeAll(async () => {
  runtime = new Miniflare({
    modules: true,
    script: await readFile(
      new URL('../dist/index.js', import.meta.url),
      'utf8',
    ),
    compatibilityDate: '2026-07-30',
    d1Databases: { DB: 'identity-test' },
    bindings: {
      ENVIRONMENT: 'local',
      APP_ORIGIN: origin,
      ENABLE_LOCAL_AUTH: 'true',
    },
  });
  db = (await runtime.getD1Database('DB')) as unknown as D1Database;
  for (const file of (await readdir(new URL('../migrations/', import.meta.url)))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const migration = await readFile(
      new URL('../migrations/' + file, import.meta.url),
      'utf8',
    );
    for (const sql of migration.replace(/^--.*$/gm, '').split(';'))
      if (sql.trim()) await db.prepare(sql).run();
  }
});
beforeEach(async () => {
  await db.batch(
    [
      'DELETE FROM group_members',
      'DELETE FROM groups',
      'DELETE FROM auth_identities',
      'DELETE FROM user_sessions',
      'DELETE FROM users',
      'DELETE FROM ski_resorts',
      'DELETE FROM auth_challenges',
      'DELETE FROM auth_rate_limits',
    ].map((sql) => db.prepare(sql)),
  );
});
afterAll(async () => {
  await runtime?.dispose();
});

describe('App-Identität und Sitzung', () => {
  it('supports native app sessions without cookies and rejects browser or provider token substitution', async () => {
    const native = (
      path: string,
      data?: unknown,
      token?: string,
      extra: Record<string, string> = {},
    ) =>
      runtime.dispatchFetch(`${origin}/api/v1${path}`, {
        method: data === undefined ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Skiurlaub-Request': '1',
          'X-Skiurlaub-Client': 'android',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...extra,
        },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
    const input = await challenge();
    const response = await native('/auth/verify-code', input);
    expect(response.status).toBe(200);
    expect(response.headers.has('set-cookie')).toBe(false);
    const session = (await response.json()) as {
      sessionToken: string;
      expiresAt: number;
    };
    expect(session.sessionToken).toMatch(/^skiurlaub_v1_[a-f0-9]{64}$/);
    expect(session.expiresAt).toBeGreaterThan(Date.now());
    expect((await native('/me', undefined, session.sessionToken)).status).toBe(
      200,
    );
    const stored = await db
      .prepare('SELECT secret_hash FROM user_sessions')
      .first<{ secret_hash: string }>();
    expect(stored!.secret_hash).not.toBe(session.sessionToken);
    expect(
      (
        await native('/me', undefined, session.sessionToken, {
          Origin: 'https://attacker.invalid',
        })
      ).status,
    ).toBe(401);
    expect(
      (await native('/me', undefined, 'provider-not-an-app-session')).status,
    ).toBe(401);
    expect(
      (
        await call('/me', {
          cookie: `skiurlaub_local_session=${session.sessionToken}`,
        })
      ).status,
    ).toBe(401);
    const browser = await login('browser@example.invalid');
    expect(
      (await native('/me', undefined, browser.cookie.split('=')[1])).status,
    ).toBe(401);
    expect(
      (
        await native('/auth/logout', {}, session.sessionToken, {
          Origin: origin,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await native('/auth/logout', {}, session.sessionToken, {
          Cookie: browser.cookie,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await native(
          '/auth/request-code',
          { email: 'test@example.invalid' },
          undefined,
          { Origin: 'https://attacker.invalid' },
        )
      ).status,
    ).toBe(403);
    expect(
      (await native('/auth/logout', {}, session.sessionToken)).status,
    ).toBe(200);
    expect((await native('/me', undefined, session.sessionToken)).status).toBe(
      401,
    );
  });
  it('widerruft alle eigenen Sitzungen und erzwingt Foreign Keys und eindeutige E-Mails', async () => {
    const first = await login();
    const second = await login();
    expect((await call('/me', { cookie: first.cookie })).status).toBe(200);
    expect(
      (await call('/auth/logout-all', { cookie: second.cookie, data: {} }))
        .status,
    ).toBe(200);
    expect((await call('/me', { cookie: first.cookie })).status).toBe(401);
    expect((await call('/me', { cookie: second.cookie })).status).toBe(401);
    await expect(
      db
        .prepare(
          'INSERT INTO group_members(group_id,user_id,role,joined_at) VALUES(?,?,?,?)',
        )
        .bind(crypto.randomUUID(), crypto.randomUUID(), 'member', Date.now())
        .run(),
    ).rejects.toThrow();
    await expect(
      db
        .prepare(
          'INSERT INTO users(id,email,display_name,created_at) VALUES(?,?,?,?)',
        )
        .bind(
          crypto.randomUUID(),
          'test@example.invalid',
          'Duplicate',
          Date.now(),
        )
        .run(),
    ).rejects.toThrow();
  });
  it('meldet sich unabhängig von Skiline an, speichert nur Hashes und aktualisiert das Profil', async () => {
    const { cookie, header, input } = await login();
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Strict');
    expect(header).not.toContain('Secure');
    const response = await call('/me', { cookie });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      email: 'test@example.invalid',
      displayName: 'Skifreund',
    });
    const session = await db
      .prepare('SELECT secret_hash FROM user_sessions')
      .first<{ secret_hash: string }>();
    expect(cookie).not.toContain(session!.secret_hash);
    const stored = await db
      .prepare('SELECT code_hash FROM auth_challenges WHERE id = ?')
      .bind(input.challengeId)
      .first<{ code_hash: string }>();
    expect(stored!.code_hash).not.toBe(input.code);
    expect(stored!.code_hash).toHaveLength(64);
    const updated = await call('/me', {
      cookie,
      method: 'PATCH',
      data: { displayName: 'Bergfreund' },
    });
    expect(await updated.json()).toMatchObject({ displayName: 'Bergfreund' });
    expect(
      (
        await call('/me', {
          cookie,
          method: 'PATCH',
          data: { displayName: ' ', id: crypto.randomUUID() },
        })
      ).status,
    ).toBe(400);
  });
  it('verhindert Wiederverwendung und Session Fixation, Logout entzieht Zugriff', async () => {
    const first = await login();
    expect(
      (await call('/auth/verify-code', { data: first.input })).status,
    ).toBe(401);
    const second = await call('/auth/verify-code', {
      data: await challenge(),
      cookie: first.cookie,
    });
    const newCookie = second.headers.get('set-cookie')!.split(';')[0];
    expect(newCookie).not.toBe(first.cookie);
    expect((await call('/me', { cookie: first.cookie })).status).toBe(401);
    expect(
      (await call('/auth/logout', { cookie: newCookie, data: {} })).status,
    ).toBe(200);
    expect((await call('/me', { cookie: newCookie })).status).toBe(401);
  });
  it('weist abgelaufene Codes und Sitzungen zurück', async () => {
    const input = await challenge();
    await db
      .prepare(
        'UPDATE auth_challenges SET created_at = ?, expires_at = ? WHERE id = ?',
      )
      .bind(Date.now() - 2000, Date.now() - 1000, input.challengeId)
      .run();
    expect((await call('/auth/verify-code', { data: input })).status).toBe(401);
    const { cookie } = await login();
    await db
      .prepare('UPDATE user_sessions SET created_at = ?, expires_at = ?')
      .bind(Date.now() - 2000, Date.now() - 1000)
      .run();
    expect((await call('/me', { cookie })).status).toBe(401);
  });
  it('verlängert Sitzungen höchstens täglich und nie über 90 Tage seit dem Login', async () => {
    const day = 86400000;
    const { cookie } = await login();
    const row = () =>
      db
        .prepare('SELECT created_at, expires_at FROM user_sessions')
        .first<{ created_at: number; expires_at: number }>();
    // Frisch angemeldet: kein Schreibvorgang, Ablauf bleibt unverändert.
    const fresh = (await row())!;
    expect((await call('/me', { cookie })).status).toBe(200);
    expect((await row())!.expires_at).toBe(fresh.expires_at);
    // Zuletzt vor mehr als einem Tag erneuert: wird wieder auf ca. 30 Tage gesetzt.
    await db
      .prepare('UPDATE user_sessions SET expires_at = ?')
      .bind(Date.now() + 20 * day)
      .run();
    const response = await call('/me', { cookie });
    const dto = (await response.json()) as { sessionExpiresAt: string };
    const renewed = (await row())!.expires_at;
    expect(renewed).toBeGreaterThan(Date.now() + 29 * day);
    expect(renewed).toBeLessThanOrEqual(Date.now() + 30 * day);
    expect(Date.parse(dto.sessionExpiresAt)).toBe(renewed);
    // Absolute Obergrenze: 90 Tage nach Erstellung.
    await db
      .prepare('UPDATE user_sessions SET created_at = ?, expires_at = ?')
      .bind(Date.now() - 85 * day, Date.now() + 1 * day)
      .run();
    expect((await call('/me', { cookie })).status).toBe(200);
    const capped = (await row())!;
    expect(capped.expires_at).toBe(capped.created_at + 90 * day);
    // Nach der Obergrenze ist die Sitzung abgelaufen und wird nicht wiederbelebt.
    await db
      .prepare('UPDATE user_sessions SET created_at = ?, expires_at = ?')
      .bind(Date.now() - 91 * day, Date.now() - 1000)
      .run();
    expect((await call('/me', { cookie })).status).toBe(401);
  });
  it('sperrt einen Code nach fünf Fehlversuchen und widerruft alte Codes beim Neuanfordern', async () => {
    const input = await challenge();
    const wrong = input.code === '00000000' ? '11111111' : '00000000';
    for (let i = 0; i < 5; i++)
      expect(
        (await call('/auth/verify-code', { data: { ...input, code: wrong } }))
          .status,
      ).toBe(401);
    expect((await call('/auth/verify-code', { data: input })).status).toBe(401);
    const old = await challenge();
    await challenge();
    expect((await call('/auth/verify-code', { data: old })).status).toBe(401);
  });
  it('verwendet bei paralleler Einlösung denselben Code nur einmal', async () => {
    const input = await challenge();
    const results = await Promise.all([
      call('/auth/verify-code', { data: input }),
      call('/auth/verify-code', { data: input }),
    ]);
    expect(results.map((value) => value.status).sort()).toEqual([200, 401]);
    expect(
      (await db
        .prepare('SELECT COUNT(*) AS count FROM user_sessions')
        .first<{ count: number }>())!.count,
    ).toBe(1);
  });
  it('limitiert Codeanfragen und verrät unbekannte Adressen nicht', async () => {
    for (let i = 0; i < 3; i++)
      expect(
        (
          await call('/auth/request-code', {
            data: { email: 'unknown@example.invalid' },
          })
        ).status,
      ).toBe(202);
    const limited = await call('/auth/request-code', {
      data: { email: 'unknown@example.invalid' },
    });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
    const unknown = await call('/auth/request-code', {
      data: { email: 'not-allowed@example.org' },
    });
    expect(unknown.status).toBe(202);
    const id = (await unknown.json()) as { challengeId: string };
    expect(
      (await call('/dev/code', { data: { challengeId: id.challengeId } }))
        .status,
    ).toBe(404);
  });
});

describe('Serverseitige Berechtigungen', () => {
  it('verwendet den Mail-Servicevertrag und setzt produktive Cookies sicher', async () => {
    let delivered: { to: string; code: string } | null = null;
    const production = new Miniflare({
      modules: true,
      script: await readFile(
        new URL('../dist/index.js', import.meta.url),
        'utf8',
      ),
      compatibilityDate: '2026-07-30',
      d1Databases: { DB: 'mail-contract-test' },
      bindings: {
        ENVIRONMENT: 'production',
        APP_ORIGIN: 'https://ski.example.invalid',
        AUTH_HMAC_SECRET: 'synthetic-test-hmac-key-not-for-production',
        ALLOWED_EMAILS: 'mail@example.invalid',
      },
      serviceBindings: {
        AUTH_MAILER: async (request: { json: () => Promise<unknown> }) => {
          delivered = (await request.json()) as { to: string; code: string };
          return new Response(null, { status: 204 });
        },
      },
    });
    try {
      const database = await production.getD1Database('DB');
      const sql = await readFile(
        new URL('../migrations/0001_identity.sql', import.meta.url),
        'utf8',
      );
      for (const statement of sql
        .replace(/^--.*$/gm, '')
        .split(';')
        .map((value) => value.trim())
        .filter(Boolean))
        await database.prepare(statement).run();
      const post = (path: string, data: unknown, cookie?: string) =>
        production.dispatchFetch(`https://ski.example.invalid/api/v1${path}`, {
          method: 'POST',
          headers: {
            Origin: 'https://ski.example.invalid',
            'Content-Type': 'application/json',
            'X-Skiurlaub-Request': '1',
            ...(cookie ? { Cookie: cookie } : {}),
          },
          body: JSON.stringify(data),
        });
      const challenge = (await (
        await post('/auth/request-code', { email: 'mail@example.invalid' })
      ).json()) as { challengeId: string };
      expect(delivered).toMatchObject({ to: 'mail@example.invalid' });
      const result = await post('/auth/verify-code', {
        challengeId: challenge.challengeId,
        code: delivered!.code,
      });
      expect(result.status).toBe(200);
      const header = result.headers.get('set-cookie')!;
      expect(header).toContain('__Host-skiurlaub_session=');
      expect(header).toContain('Secure');
      expect(header).toContain('HttpOnly');
      expect(header).toContain('SameSite=Strict');
      expect(
        (await post('/dev/code', { challengeId: challenge.challengeId }))
          .status,
      ).toBe(404);
      expect(
        (await post('/auth/logout', {}, header.split(';')[0])).status,
      ).toBe(200);
    } finally {
      await production.dispose();
    }
  });
  it('weist fehlende Sitzung, fremde Gruppen und ehemalige Mitglieder zurück', async () => {
    expect((await call('/me')).status).toBe(401);
    const a = await login('a@example.invalid');
    const b = await login('b@example.invalid');
    const user = (await (await call('/me', { cookie: a.cookie })).json()) as {
      id: string;
    };
    const group = crypto.randomUUID();
    await db
      .prepare('INSERT INTO groups(id,name) VALUES(?,?)')
      .bind(group, 'Testgruppe')
      .run();
    await db
      .prepare(
        'INSERT INTO group_members(group_id,user_id,role,joined_at) VALUES(?,?,?,?)',
      )
      .bind(group, user.id, 'member', Date.now())
      .run();
    const own = await call(`/groups/${group}`, { cookie: a.cookie });
    expect(own.status).toBe(200);
    expect(await own.json()).toEqual({
      id: group,
      name: 'Testgruppe',
      role: 'member',
    });
    expect((await call(`/groups/${group}`, { cookie: b.cookie })).status).toBe(
      404,
    );
    await db
      .prepare('DELETE FROM group_members WHERE group_id = ?')
      .bind(group)
      .run();
    expect((await call(`/groups/${group}`, { cookie: a.cookie })).status).toBe(
      404,
    );
  });
  it('weist Cross-Origin, fremde Tokens, manipulierte Eingaben und zu große Bodies zurück', async () => {
    expect(
      (
        await call('/auth/request-code', {
          data: { email: 'test@example.invalid' },
          headers: { Origin: 'https://attacker.invalid' },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call('/me', {
          headers: { Authorization: 'Bearer synthetic-not-a-real-token' },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await call('/auth/verify-code', {
          data: { authToken: 'synthetic-not-a-real-token' },
        })
      ).status,
    ).toBe(400);
    expect(
      (await call('/auth/request-code', { data: { email: 'x'.repeat(5000) } }))
        .status,
    ).toBe(413);
    expect(
      (
        await call('/auth/request-code', {
          data: { email: 'test@example.invalid' },
          headers: { 'X-Skiurlaub-Request': '' },
        })
      ).status,
    ).toBe(403);
    expect((await call('/auth/skiline/start', { data: {} })).status).toBe(503);
  });
  it('lässt den lokalen Testmodus in Produktionskonfiguration nicht zu', async () => {
    const production = new Miniflare({
      modules: true,
      script: await readFile(
        new URL('../dist/index.js', import.meta.url),
        'utf8',
      ),
      compatibilityDate: '2026-07-30',
      d1Databases: { DB: 'production-test' },
      bindings: {
        ENVIRONMENT: 'production',
        APP_ORIGIN: 'https://ski.example.invalid',
        ENABLE_LOCAL_AUTH: 'true',
      },
    });
    try {
      const status = await production.dispatchFetch(
        'https://ski.example.invalid/api/v1/auth/status',
      );
      expect(await status.json()).toEqual({
        skiline: 'unavailable',
        google: false,
        appEmailCode: false,
        localTestMode: false,
      });
      const dev = await production.dispatchFetch(
        'https://ski.example.invalid/api/v1/dev/code',
        {
          method: 'POST',
          headers: {
            Origin: 'https://ski.example.invalid',
            'Content-Type': 'application/json',
            'X-Skiurlaub-Request': '1',
          },
          body: JSON.stringify({ challengeId: crypto.randomUUID() }),
        },
      );
      expect(dev.status).toBe(404);
    } finally {
      await production.dispose();
    }
  });
});
