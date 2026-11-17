import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPnpm, completed } from './processes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const android = path.join(root, 'apps', 'mobile', 'android');
const sdk =
  process.env.ANDROID_SDK_ROOT ||
  process.env.ANDROID_HOME ||
  (process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk')
    : '');
const studioJdk = 'C:\\Program Files\\Android\\Android Studio\\jbr';
const javaHome =
  process.env.SKIURLAUB_JAVA_HOME ||
  (process.platform === 'win32' && existsSync(studioJdk)
    ? studioJdk
    : process.env.JAVA_HOME);
if (!sdk || !existsSync(sdk))
  throw new Error('Android-SDK fehlt. ANDROID_SDK_ROOT setzen.');
if (!javaHome)
  throw new Error('JDK 21 fehlt. SKIURLAUB_JAVA_HOME oder JAVA_HOME setzen.');
const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: sdk,
  ANDROID_SDK_ROOT: sdk,
};
await completed(runPnpm(['--filter', '@skiurlaub/mobile', 'build']));
await completed(
  runPnpm(['--filter', '@skiurlaub/mobile', 'exec', 'cap', 'sync', 'android']),
);
const wrapper = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const gradle =
  process.platform === 'win32'
    ? spawn(
        'cmd.exe',
        ['/d', '/s', '/c', 'gradlew.bat --no-daemon assembleDebug'],
        { cwd: android, env, stdio: 'inherit', windowsHide: true },
      )
    : spawn(wrapper, ['--no-daemon', 'assembleDebug'], {
        cwd: android,
        env,
        stdio: 'inherit',
      });
await completed(gradle);
const apk = path.join(
  android,
  'app',
  'build',
  'outputs',
  'apk',
  'debug',
  'app-debug.apk',
);
const artifacts = path.join(root, 'artifacts');
mkdirSync(artifacts, { recursive: true });
copyFileSync(apk, path.join(artifacts, 'skiurlaub-debug.apk'));
console.log('APK: artifacts/skiurlaub-debug.apk');
if (process.argv.includes('--install')) {
  const adb = path.join(
    sdk,
    'platform-tools',
    process.platform === 'win32' ? 'adb.exe' : 'adb',
  );
  await completed(
    spawn(adb, ['install', '-r', apk], { stdio: 'inherit', windowsHide: true }),
  );
  await completed(
    spawn(
      adb,
      [
        'shell',
        'am',
        'start',
        '-n',
        'cc.quxx.skiurlaub.debug/cc.quxx.skiurlaub.MainActivity',
      ],
      { stdio: 'inherit', windowsHide: true },
    ),
  );
}
