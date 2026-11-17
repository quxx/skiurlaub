import { spawn } from 'node:child_process';

export function runPnpm(args) {
  if (!process.env.npm_execpath) throw new Error('Bitte über pnpm starten.');
  return spawn(process.execPath, [process.env.npm_execpath, ...args], {
    stdio: 'inherit',
    windowsHide: true,
  });
}
export function completed(child) {
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Unterprozess beendet: ${code}`)),
    );
  });
}
export function stop(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32')
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  else child.kill('SIGTERM');
}
