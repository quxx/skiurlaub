// Isolated E2E runtime: same Worker and D1 engine as the integration tests.
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare } from 'miniflare';

const runtime = new Miniflare({
  host: '127.0.0.1',
  port: 8787,
  modules: true,
  script: await readFile(new URL('../dist/index.js', import.meta.url), 'utf8'),
  compatibilityDate: '2026-07-30',
  d1Databases: { DB: 'e2e-identity' },
  bindings: {
    ENVIRONMENT: 'local',
    APP_ORIGIN: 'http://127.0.0.1:4173',
    ENABLE_LOCAL_AUTH: 'true',
  },
});
const db = await runtime.getD1Database('DB');
for (const file of (await readdir(new URL('../migrations/', import.meta.url)))
  .filter((name) => name.endsWith('.sql'))
  .sort()) {
  const migration = await readFile(
    new URL('../migrations/' + file, import.meta.url),
    'utf8',
  );
  for (const sql of migration.replace(/^--.*$/gm, '').split(';')) {
    if (sql.trim()) await db.prepare(sql).run();
  }
}
await runtime.ready;
console.log('Isolated E2E Worker ready on 127.0.0.1:8787');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    void runtime.dispose().then(() => process.exit(0));
  });
}
