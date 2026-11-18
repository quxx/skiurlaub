import { readFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { URL } from 'node:url';
import {
  analyzeTrack,
  bytesToBase64,
  compressTrack,
  decompressTrack,
  skiDayLegs,
  synthesizeTrack,
  uploadStats,
} from '@skiurlaub/gps';
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
    d1Databases: { DB: 'gps-tracks-test' },
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
      'DELETE FROM gps_tracks',
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

const trackId = () => crypto.randomUUID();
async function makeUpload(seed = 1, laps = 2) {
  const points = synthesizeTrack(skiDayLegs(laps), { withBaro: true, seed });
  const analysis = analyzeTrack(points);
  const bytes = await compressTrack(points);
  return {
    upload: {
      startedAt: points[0].t,
      endedAt: points[points.length - 1].t,
      pointCount: points.length,
      altRef: 'msl',
      algorithmVersion: analysis.algorithmVersion,
      stats: uploadStats(analysis.stats),
      data: bytesToBase64(bytes),
    },
    points,
    bytes,
  };
}
const put = (cookie: string, id: string, data: unknown) =>
  call(`/gps-tracks/${id}`, { method: 'PUT', cookie, data });

describe('GPS-Tracks (Upload)', () => {
  it('verlangt eine Anmeldung', async () => {
    const id = trackId();
    expect((await call('/gps-tracks')).status).toBe(401);
    expect(
      (await call(`/gps-tracks/${id}`, { method: 'PUT', data: {} })).status,
    ).toBe(401);
    expect((await call(`/gps-tracks/${id}/data`)).status).toBe(401);
    expect((await call(`/gps-tracks/${id}`, { method: 'DELETE' })).status).toBe(
      401,
    );
  });

  it('lädt eine Aufzeichnung hoch, listet sie und liefert die Rohdaten unverändert zurück', async () => {
    const cookie = await login();
    const { upload, points, bytes } = await makeUpload();
    const id = trackId();
    const response = await put(cookie, id, upload);
    expect(response.status).toBe(200);
    const summary = (await response.json()) as Record<string, unknown>;
    expect(summary).toMatchObject({
      clientTrackId: id,
      pointCount: points.length,
      revision: 1,
      stats: { liftCount: 2, runCount: 2 },
    });
    expect(JSON.stringify(summary)).not.toMatch(/data|checksum/);
    const list = (await (await call('/gps-tracks', { cookie })).json()) as {
      tracks: Array<{ id: string }>;
    };
    expect(list.tracks).toHaveLength(1);
    const data = await call(`/gps-tracks/${list.tracks[0].id}/data`, {
      cookie,
    });
    expect(data.headers.get('content-type')).toBe('application/octet-stream');
    const back = new Uint8Array(await data.arrayBuffer());
    expect(Array.from(back)).toEqual(Array.from(bytes));
    expect(await decompressTrack(back)).toHaveLength(points.length);
  });

  it('ist idempotent und erhöht die Revision nur bei geändertem Inhalt', async () => {
    const cookie = await login();
    const id = trackId();
    const first = await makeUpload(1);
    await put(cookie, id, first.upload);
    const again = (await (await put(cookie, id, first.upload)).json()) as {
      revision: number;
    };
    expect(again.revision).toBe(1);
    const changed = await makeUpload(2, 3);
    const updated = (await (await put(cookie, id, changed.upload)).json()) as {
      revision: number;
      pointCount: number;
    };
    expect(updated.revision).toBe(2);
    expect(updated.pointCount).toBe(changed.points.length);
    const rows = await db
      .prepare('SELECT COUNT(*) c FROM gps_tracks')
      .first<{ c: number }>();
    expect(rows?.c).toBe(1);
  });

  it('weist ungültige Uploads ab, ohne etwas zu speichern', async () => {
    const cookie = await login();
    const { upload } = await makeUpload();
    const id = trackId();
    const bad: Array<[string, unknown, number]> = [
      ['kein Base64', { ...upload, data: '***' }, 400],
      [
        'kein gzip',
        { ...upload, data: bytesToBase64(new Uint8Array([1, 2, 3, 4])) },
        400,
      ],
      [
        'falsche Punktzahl',
        { ...upload, pointCount: upload.pointCount + 1 },
        400,
      ],
      [
        'Statistik außerhalb der Grenzen',
        { ...upload, stats: { ...upload.stats, liftAscentM: 1e9 } },
        400,
      ],
      ['zusätzliche Felder', { ...upload, userId: 'x' }, 400],
      ['fehlende Felder', { startedAt: 1 }, 400],
      [
        'Zip-Bombe',
        {
          ...upload,
          data: bytesToBase64(
            new Uint8Array(gzipSync(Buffer.alloc(20_000_000))),
          ),
        },
        400,
      ],
    ];
    for (const [name, data, status] of bad)
      expect((await put(cookie, id, data)).status, name).toBe(status);
    expect((await put(cookie, 'kein-uuid', upload)).status).toBe(404);
    const count = await db
      .prepare('SELECT COUNT(*) c FROM gps_tracks')
      .first<{ c: number }>();
    expect(count?.c).toBe(0);
  });

  it('begrenzt die Größe', async () => {
    const cookie = await login();
    const { upload } = await makeUpload();
    const huge = await put(cookie, trackId(), {
      ...upload,
      data: 'A'.repeat(1_450_000),
    });
    expect(huge.status).toBe(400); // über dem Schema-Limit
    const tooBig = await call(`/gps-tracks/${trackId()}`, {
      method: 'PUT',
      cookie,
      data: { filler: 'x'.repeat(1_600_000) },
    });
    expect(tooBig.status).toBe(413);
  });

  it('trennt Nutzer: fremde Tracks sind weder les- noch löschbar', async () => {
    const a = await login('a@example.invalid');
    const b = await login('b@example.invalid');
    const shared = trackId();
    const { upload } = await makeUpload();
    await put(a, shared, upload);
    await put(b, shared, upload); // gleiche Client-ID bei anderem Nutzer ist erlaubt
    const listA = (await (await call('/gps-tracks', { cookie: a })).json()) as {
      tracks: Array<{ id: string }>;
    };
    const listB = (await (await call('/gps-tracks', { cookie: b })).json()) as {
      tracks: Array<{ id: string }>;
    };
    expect(listA.tracks).toHaveLength(1);
    expect(listB.tracks).toHaveLength(1);
    expect(listA.tracks[0].id).not.toBe(listB.tracks[0].id);
    const idA = listA.tracks[0].id;
    expect((await call(`/gps-tracks/${idA}/data`, { cookie: b })).status).toBe(
      404,
    );
    expect(
      (await call(`/gps-tracks/${idA}`, { method: 'DELETE', cookie: b }))
        .status,
    ).toBe(404);
    expect(
      (await call(`/gps-tracks/${idA}`, { method: 'DELETE', cookie: a }))
        .status,
    ).toBe(200);
    expect(
      (
        (await (await call('/gps-tracks', { cookie: a })).json()) as {
          tracks: unknown[];
        }
      ).tracks,
    ).toHaveLength(0);
    expect(
      (
        (await (await call('/gps-tracks', { cookie: b })).json()) as {
          tracks: unknown[];
        }
      ).tracks,
    ).toHaveLength(1);
  });

  it('limitiert Uploads pro Stunde und Nutzer', async () => {
    const cookie = await login();
    const { upload } = await makeUpload(1, 1);
    for (let i = 0; i < 30; i++)
      expect((await put(cookie, trackId(), upload)).status).toBe(200);
    const limited = await put(cookie, trackId(), upload);
    expect(limited.status).toBe(429);
  });

  it('erzwingt die Größen- und Fremdschlüssel-Regeln der Datenbank', async () => {
    const insert = (userId: string, size: number) =>
      db
        .prepare(
          "INSERT INTO gps_tracks(id,user_id,client_track_id,started_at,point_count,format_version,algorithm_version,data,checksum,stats_json,created_at) VALUES('x',?,'11111111-1111-1111-1111-111111111111',1,2,1,1,zeroblob(?),'c','{}',1)",
        )
        .bind(userId, size)
        .run();
    await expect(insert('gibt-es-nicht', 10)).rejects.toThrow();
    const cookie = await login();
    const me = (await (await call('/me', { cookie })).json()) as { id: string };
    await expect(insert(me.id, 1_000_001)).rejects.toThrow();
  });
});
