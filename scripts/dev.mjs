import { spawn } from 'node:child_process';
import { runPnpm, stop } from './processes.mjs';
const api = spawn(process.execPath, ['scripts/api-dev.mjs'], {
  stdio: 'inherit',
  env: process.env,
  windowsHide: true,
});
const web = runPnpm(['--filter', '@skiurlaub/mobile', 'dev']);
let shuttingDown = false;
const close = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  stop(api);
  stop(web);
};
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, close);
for (const child of [api, web]) {
  child.on('error', () => {
    process.exitCode = 1;
    close();
  });
  child.on('exit', (code) => {
    if (code && !shuttingDown) process.exitCode = code;
    close();
  });
}
