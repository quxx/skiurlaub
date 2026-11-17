import { runPnpm, completed, stop } from './processes.mjs';
const persistence = process.env.SKIURLAUB_STATE_PATH
  ? ['--persist-to', process.env.SKIURLAUB_STATE_PATH]
  : [];
await completed(
  runPnpm([
    '--filter',
    '@skiurlaub/api',
    'exec',
    'wrangler',
    'd1',
    'migrations',
    'apply',
    'DB',
    '--local',
    '--env',
    'local',
    ...persistence,
  ]),
);
const origin = process.env.SKIURLAUB_APP_ORIGIN ?? 'http://127.0.0.1:5173';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))
  throw new Error('Lokale Origin muss 127.0.0.1 verwenden.');
const worker = runPnpm([
  '--filter',
  '@skiurlaub/api',
  'exec',
  'wrangler',
  'dev',
  '--env',
  'local',
  '--ip',
  '127.0.0.1',
  '--port',
  '8787',
  '--var',
  `APP_ORIGIN:${origin}`,
  ...persistence,
]);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    stop(worker);
    process.exitCode = 0;
  });
await completed(worker).catch(() => {
  process.exitCode = 1;
});
