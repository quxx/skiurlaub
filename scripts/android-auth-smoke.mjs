// Synthetic login against the loopback-only test Worker via adb reverse.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium, expect } = createRequire(
  path.join(root, 'apps/mobile/package.json'),
)('@playwright/test');
const sdk =
  process.env.ANDROID_SDK_ROOT ||
  process.env.ANDROID_HOME ||
  path.join(process.env.LOCALAPPDATA ?? '', 'Android/Sdk');
const adb = path.join(
  sdk,
  'platform-tools',
  process.platform === 'win32' ? 'adb.exe' : 'adb',
);
const exec = promisify(execFile);
const device = process.env.ANDROID_SERIAL
  ? ['-s', process.env.ANDROID_SERIAL]
  : [];
const run = async (...args) =>
  (await exec(adb, [...device, ...args], { windowsHide: true })).stdout.trim();
const app = 'cc.quxx.skiurlaub.debug';
let browser;
let port;
let page;
async function disconnect() {
  if (browser) {
    await browser.close();
    browser = null;
  }
  if (port) {
    await run('forward', '--remove', `tcp:${port}`);
    port = null;
  }
}
async function connect() {
  await run(
    'shell',
    'am',
    'start',
    '-W',
    '-n',
    `${app}/cc.quxx.skiurlaub.MainActivity`,
  );
  const pid = await run('shell', 'pidof', app);
  await expect
    .poll(() => run('shell', 'cat', '/proc/net/unix'))
    .toContain(`webview_devtools_remote_${pid}`);
  port = await run(
    'forward',
    'tcp:0',
    `localabstract:webview_devtools_remote_${pid}`,
  );
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  page = browser
    .contexts()[0]
    .pages()
    .find((value) => value.url().startsWith('https://localhost/'));
  assert.ok(page);
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Profil', exact: true })
    .click();
}
await run('reverse', 'tcp:8787', 'tcp:8787');
try {
  await connect();
  await expect(
    page.getByText('Lokaler Testmodus:', { exact: false }),
  ).toBeVisible();
  const email = `android-${crypto.randomUUID()}@example.invalid`;
  await page.getByLabel('E-Mail-Adresse').fill(email);
  await page
    .getByRole('button', { name: 'Code anfordern', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Lokalen Testcode übernehmen' })
    .click();
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Dein Profil', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.getByLabel('Anzeigename').fill('Android im Schnee');
  await page
    .getByRole('button', { name: 'Profil speichern', exact: true })
    .click();
  await expect(
    page.getByText('Profil gespeichert.', { exact: true }),
  ).toBeVisible();
  const bridgeResult = await page.evaluate(async () => {
    const cap = window.Capacitor;
    const result = await cap.nativePromise('SkiurlaubApi', 'request', {
      path: '/me',
      method: 'GET',
    });
    return {
      response: JSON.stringify(result),
      cookie: document.cookie,
      storage: JSON.stringify({ ...localStorage }),
    };
  });
  assert.ok(
    !JSON.stringify(bridgeResult).includes('skiurlaub_v1_'),
    'App-session secret crossed the JS boundary',
  );
  assert.ok(!bridgeResult.cookie.includes('session'));
  const encrypted = await run(
    'shell',
    'run-as',
    app,
    'cat',
    `shared_prefs/skiurlaub-session.xml`,
  );
  assert.ok(
    encrypted.includes('encrypted') && !encrypted.includes('skiurlaub_v1_'),
  );
  await disconnect();
  await run('shell', 'am', 'force-stop', app);
  await connect();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await expect(page.getByLabel('Anzeigename')).toHaveValue('Android im Schnee');
  await page.getByRole('button', { name: 'Abmelden', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Anmelden', exact: true }),
  ).toBeVisible();
  await disconnect();
  await run('shell', 'am', 'force-stop', app);
  await connect();
  await expect(
    page.getByRole('heading', { name: 'Anmelden', exact: true }),
  ).toBeVisible();
  console.log(
    'Native login, profile update, encrypted storage, process restart, logout and no JS session exposure: passed.',
  );
} finally {
  if (page && !page.isClosed()) {
    const logout = page.getByRole('button', { name: 'Abmelden', exact: true });
    if (await logout.count()) await logout.click().catch(() => {});
  }
  await disconnect();
  await run('reverse', '--remove', 'tcp:8787');
}
