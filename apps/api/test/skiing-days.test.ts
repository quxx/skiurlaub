import { readFile, readdir } from 'node:fs/promises';
import { URL } from 'node:url';
import { syntheticExport } from '@skiurlaub/skiline';
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
async function login(email = 'test@example.invalid') {
  const request = await call('/auth/request-code', { data: { email } });
  const { challengeId } = (await request.json()) as { challengeId: string };
  const preview = await call('/dev/code', { data: { challengeId } });
  const { code } = (await preview.json()) as { code: string };
  const response = await call('/auth/verify-code', {
    data: { challengeId, code },
  });
  expect(response.status).toBe(200);
  return response.headers.get('set-cookie')!.split(';')[0];
}

beforeAll(async () => {
  runtime = new Miniflare({
    modules: true,
    script: await readFile(
      new URL('../dist/index.js', import.meta.url),
      'utf8',
    ),
    compatibilityDate: '2026-07-30',
    d1Databases: { DB: 'skiing-days-test' },
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
      'DELETE FROM sync_jobs',
      'DELETE FROM skiing_days',
      'DELETE FROM ski_resorts',
      'DELETE FROM user_sessions',
      'DELETE FROM users',
      'DELETE FROM auth_challenges',
      'DELETE FROM auth_rate_limits',
    ].map((sql) => db.prepare(sql)),
  );
});
afterAll(async () => {
  await runtime?.dispose();
});

const importCall = (cookie: string, data: unknown) =>
  call('/skiline/import', { cookie, data });
type DayList = {
  days: Array<Record<string, unknown> & { id: string }>;
  lastImport: { state: string } | null;
};
const days = async (cookie: string) =>
  (await (await call('/skiing-days', { cookie })).json()) as DayList;
const dayRecord = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  date: '2027-01-10',
  resortId: '9001',
  data: JSON.stringify({
    verticalMeters: 1000,
    liftCount: 5,
    slopeDistance: 20000,
  }),
  ...over,
});

describe('Skitage-Import (Phase 4)', () => {
  it('verlangt eine Anmeldung für Import, Liste und Löschen', async () => {
    expect((await call('/skiline/import', { data: {} })).status).toBe(401);
    expect((await call('/skiing-days')).status).toBe(401);
    expect(
      (
        await call('/skiing-days/00000000-0000-4000-8000-000000000000', {
          method: 'DELETE',
        })
      ).status,
    ).toBe(401);
  });

  it('importiert synthetische Skitage und liefert nur sichere Felder', async () => {
    const cookie = await login();
    const response = await importCall(cookie, syntheticExport());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      total: 3,
      created: 3,
      updated: 0,
      unchanged: 0,
      rejected: [],
    });
    const list = await days(cookie);
    expect(list.days.map((d) => d.localDate)).toEqual([
      '2027-01-12',
      '2027-01-11',
      '2027-01-10',
    ]);
    expect(list.lastImport?.state).toBe('succeeded');
    expect(list.days[2]).toMatchObject({
      source: 'import',
      verticalMeters: 12450,
      liftCount: 18,
      slopeDistance: { value: 42300, unit: 'unknown' },
      resort: { name: 'Beispielgebiet Nord' },
    });
    expect(JSON.stringify(list)).not.toMatch(
      /"d-1"|"T-1"|externalId|raw|graphData|content_hash/,
    );
  });

  it('ist idempotent: gleicher Import ändert nichts und nutzt denselben Job', async () => {
    const cookie = await login();
    const first = (await (
      await importCall(cookie, syntheticExport())
    ).json()) as { jobId: string };
    const second = (await (
      await importCall(cookie, syntheticExport())
    ).json()) as Record<string, unknown>;
    expect(second).toMatchObject({ created: 0, updated: 0, unchanged: 3 });
    expect(second.jobId).toBe(first.jobId);
    const counts = await db
      .prepare(
        'SELECT (SELECT COUNT(*) FROM skiing_days) d, (SELECT COUNT(*) FROM skiing_day_statistics) s, (SELECT COUNT(*) FROM sync_jobs) j, (SELECT attempts FROM sync_jobs) a',
      )
      .first<{ d: number; s: number; j: number; a: number }>();
    expect(counts).toEqual({ d: 3, s: 3, j: 1, a: 2 });
  });

  it('aktualisiert geänderte Tage und erhöht die Revision', async () => {
    const cookie = await login();
    await importCall(cookie, [dayRecord('x1')]);
    const changed = dayRecord('x1', {
      data: JSON.stringify({
        verticalMeters: 2000,
        liftCount: 9,
        slopeDistance: 1,
      }),
    });
    const report = (await (await importCall(cookie, [changed])).json()) as {
      updated: number;
    };
    expect(report.updated).toBe(1);
    const row = await db
      .prepare(
        'SELECT d.revision, s.vertical_m, s.lift_count FROM skiing_days d JOIN skiing_day_statistics s ON s.day_id = d.id',
      )
      .first<{ revision: number; vertical_m: number; lift_count: number }>();
    expect(row).toEqual({ revision: 2, vertical_m: 2000, lift_count: 9 });
  });

  it('weist kaputte Datensätze einzeln ab und speichert die übrigen', async () => {
    const cookie = await login();
    const response = await importCall(cookie, {
      skiingDays: [
        dayRecord('ok'),
        dayRecord('bad-json', { data: '{kaputt' }),
        dayRecord('bad-date', { date: '2027-02-30' }),
        dayRecord('negative', {
          data: JSON.stringify({
            verticalMeters: -1,
            liftCount: 1,
            slopeDistance: 1,
          }),
        }),
        'nur ein String',
      ],
    });
    expect(response.status).toBe(200);
    const report = (await response.json()) as {
      created: number;
      rejected: Array<{ index: number; reason: string }>;
    };
    expect(report.created).toBe(1);
    expect(report.rejected).toEqual([
      { index: 1, reason: 'data_invalid_json' },
      { index: 2, reason: 'invalid_date' },
      { index: 3, reason: 'data_invalid_shape' },
      { index: 4, reason: 'invalid_record' },
    ]);
    expect((await days(cookie)).days).toHaveLength(1);
  });

  it('trennt Nutzer strikt: keine fremden Tage lesen oder löschen, gleiche IDs kollidieren nicht', async () => {
    const a = await login('a@example.invalid');
    const b = await login('b@example.invalid');
    await importCall(a, syntheticExport());
    await importCall(b, [dayRecord('d-1')]); // gleiche externe ID wie bei A
    const listA = await days(a);
    const listB = await days(b);
    expect(listA.days).toHaveLength(3);
    expect(listB.days).toHaveLength(1);
    expect(new Set(listA.days.map((d) => d.id)).has(listB.days[0].id)).toBe(
      false,
    );
    // B darf As Tag weder löschen noch erkennen (404 wie bei unbekannter ID).
    const foreign = await call(`/skiing-days/${listA.days[0].id}`, {
      method: 'DELETE',
      cookie: b,
    });
    expect(foreign.status).toBe(404);
    expect((await days(a)).days).toHaveLength(3);
    const own = await call(`/skiing-days/${listA.days[0].id}`, {
      method: 'DELETE',
      cookie: a,
    });
    expect(own.status).toBe(200);
    expect((await days(a)).days).toHaveLength(2);
    const orphans = await db
      .prepare(
        'SELECT COUNT(*) c FROM skiing_day_statistics WHERE day_id NOT IN (SELECT id FROM skiing_days)',
      )
      .first<{ c: number }>();
    expect(orphans?.c).toBe(0);
  });

  it('überschreibt Gebietsnamen nicht und entfernt Steuerzeichen', async () => {
    const a = await login('a@example.invalid');
    const b = await login('b@example.invalid');
    await importCall(a, {
      resorts: [{ id: '5', name: 'Erster\u0007Name' }],
      skiingDays: [dayRecord('r1', { resortId: '5' })],
    });
    await importCall(b, {
      resorts: [{ id: '5', name: 'Anderer Name' }],
      skiingDays: [dayRecord('r2', { resortId: '5' })],
    });
    const rows = await db
      .prepare('SELECT name FROM ski_resorts')
      .all<{ name: string }>();
    expect(rows.results).toEqual([{ name: 'Erster Name' }]);
    const mapping = await db
      .prepare('SELECT COUNT(*) c FROM resort_provider_ids')
      .first<{ c: number }>();
    expect(mapping?.c).toBe(1);
  });

  it('begrenzt Größe, Anzahl, Format und Content-Type', async () => {
    const cookie = await login();
    const many = await importCall(
      cookie,
      Array.from({ length: 367 }, (_, i) => dayRecord(`d${i}`)),
    );
    expect(many.status).toBe(413);
    expect(
      ((await many.json()) as { error: { code: string } }).error.code,
    ).toBe('TOO_MANY_DAYS');
    const big = await importCall(cookie, {
      filler: 'x'.repeat(4.5 * 1024 * 1024),
    });
    expect(big.status).toBe(413);
    expect((await importCall(cookie, { hallo: 'welt' })).status).toBe(400);
    expect((await importCall(cookie, 'text')).status).toBe(400);
    const wrongType = await call('/skiline/import', {
      cookie,
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
    });
    expect(wrongType.status).toBe(415);
    expect((await days(cookie)).days).toHaveLength(0);
  });

  it('limitiert Importe pro Stunde und Nutzer', async () => {
    const cookie = await login();
    for (let i = 0; i < 10; i++)
      expect((await importCall(cookie, [dayRecord(`r${i}`)])).status).toBe(200);
    const limited = await importCall(cookie, [dayRecord('r11')]);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
  });

  it('speichert Rohdaten begrenzt und erzwingt Fremdschlüssel', async () => {
    const cookie = await login();
    await importCall(cookie, [dayRecord('x1')]);
    const stored = await db
      .prepare('SELECT raw_payload, source FROM skiing_days')
      .first<{ raw_payload: string; source: string }>();
    expect(JSON.parse(stored!.raw_payload)).toMatchObject({ liftCount: 5 });
    expect(stored!.source).toBe('import');
    await expect(
      db
        .prepare(
          "INSERT INTO skiing_days(id,user_id,local_date,source,external_id,content_hash,raw_payload,synced_at) VALUES('x','nope','2027-01-01','import','e','h','{}',1)",
        )
        .run(),
    ).rejects.toThrow();
  });
});
