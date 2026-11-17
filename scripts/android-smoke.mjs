import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireMobile = createRequire(
  path.join(root, 'apps/mobile/package.json'),
);
const { chromium, expect } = requireMobile('@playwright/test');
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
const runAdb = async (...args) =>
  (await exec(adb, [...device, ...args], { windowsHide: true })).stdout.trim();
const appId = 'cc.quxx.skiurlaub.debug';
await runAdb(
  'shell',
  'am',
  'start',
  '-W',
  '-n',
  `${appId}/cc.quxx.skiurlaub.MainActivity`,
);
const pid = await runAdb('shell', 'pidof', appId);
assert.match(pid, /^\d+$/, 'Die Debug-App muss bereits geöffnet sein.');
await expect
  .poll(() => runAdb('shell', 'cat', '/proc/net/unix'), { timeout: 10_000 })
  .toContain(`webview_devtools_remote_${pid}`);
const port = await runAdb(
  'forward',
  'tcp:0',
  `localabstract:webview_devtools_remote_${pid}`,
);
const browser = await chromium
  .connectOverCDP(`http://127.0.0.1:${port}`)
  .catch(async (error) => {
    await runAdb('forward', '--remove', `tcp:${port}`);
    throw error;
  });
const page = browser
  .contexts()[0]
  .pages()
  .find((p) => p.url().startsWith('https://localhost/'));
assert.ok(page, 'Lokales App-Bundle nicht gefunden.');
const artifacts = path.join(root, 'artifacts');
await mkdir(artifacts, { recursive: true });
const checks = [];
const back = () => runAdb('shell', 'input', 'keyevent', '4');
const nav = (label) =>
  page.getByRole('navigation').getByRole('link', { name: label, exact: true });
let originalTheme;
try {
  await nav('Profil').click();
  await expect(
    page.getByRole('heading', { name: 'Profil', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Lokalen Testcode übernehmen' }),
  ).toHaveCount(0);
  checks.push('Native profile: no local test login exposed');
  const config = JSON.parse(
    await readFile(
      path.join(
        root,
        'apps/mobile/android/app/src/main/assets/capacitor.config.json',
      ),
      'utf8',
    ),
  );
  if (
    config.plugins?.SkiurlaubApi?.baseUrl &&
    config.plugins?.SkiurlaubApi?.googleClientId
  ) {
    await expect(
      page
        .getByRole('button', { name: 'Mit Google anmelden' })
        .or(page.getByRole('heading', { name: 'Dein Profil', exact: true })),
    ).toBeVisible();
    checks.push(
      'Configured Google sign-in or existing account available in the native profile',
    );
  } else {
    await expect(
      page.getByRole('button', { name: 'Mit Google anmelden' }),
    ).toHaveCount(0);
    const googleUnavailable = await page.evaluate(async () => {
      try {
        await window.Capacitor.Plugins.SkiurlaubApi.googleSignIn();
        return false;
      } catch (error) {
        return /noch nicht eingerichtet/.test(error.message);
      }
    });
    assert.ok(
      googleUnavailable,
      'Unconfigured Google login must fail before opening an account picker.',
    );
    checks.push('Google login rejects safely without OAuth configuration');
  }
  await expect(page.getByRole('navigation').getByRole('link')).toHaveCount(4);
  await page.getByRole('link', { name: /Skipässe Verwaltung/ }).click();
  await page.waitForURL('https://localhost/skipaesse');
  await back();
  await page.waitForURL('https://localhost/profil');
  checks.push(
    'Four destinations; passes open from profile and Android Back returns there',
  );
  originalTheme = await page.getByLabel('Darstellung').inputValue();
  for (const theme of ['dark', 'light']) {
    await page.getByLabel('Darstellung').selectOption(theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.screenshot({
      path: path.join(artifacts, `android-profile-${theme}.png`),
    });
  }
  checks.push('Light/dark theme selectable on device');
  await page.getByLabel('Darstellung').selectOption(originalTheme);
  await back();
  await page.waitForURL('https://localhost/');
  checks.push('Android Back: profile → home');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(
    page.getByRole('heading', { name: /Hochkrimml/ }).first(),
  ).toBeVisible();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: path.join(artifacts, 'android-home-webview.png'),
  });
  checks.push('Home renders without horizontal overflow');
  const weatherBounds = await page.locator('.current-weather').boundingBox();
  assert.ok(weatherBounds);
  const ratio = await page.evaluate(() => devicePixelRatio);
  const swipeX = Math.round(
    (weatherBounds.x + weatherBounds.width / 2) * ratio,
  );
  const swipeY = Math.round((weatherBounds.y + 24) * ratio);
  await runAdb(
    'shell',
    'input',
    'swipe',
    String(swipeX),
    String(swipeY),
    String(swipeX),
    String(swipeY + Math.round(180 * ratio)),
    '600',
  );
  await expect(page.locator('.pull-refresh-feedback')).toHaveAttribute(
    'data-visible',
    'true',
  );
  await expect(page.locator('.pull-refresh-feedback')).toContainText(
    /aktualisiert|Sekunden|offline/,
  );
  checks.push('Real Android swipe at the top triggers refresh feedback');
  const summary = page.locator('.dashboard-status summary');
  const animationSession = await page.context().newCDPSession(page);
  await animationSession.send('Animation.enable');
  await animationSession.send('Animation.setPlaybackRate', {
    playbackRate: 0.1,
  });
  await summary.click();
  await expect(page.locator('.dashboard-status')).toHaveAttribute('open', '');
  await page.waitForTimeout(100);
  await page.screenshot({
    path: path.join(artifacts, 'android-disclosure-slow.png'),
  });
  await animationSession.send('Animation.setPlaybackRate', { playbackRate: 1 });
  await animationSession.detach();
  checks.push('Disclosure inspected at 10% animation speed');
  await back();
  await expect(page.locator('.dashboard-status')).not.toHaveAttribute(
    'open',
    '',
  );
  checks.push('Android Back closes data details');
  const day = page.locator('.forecast-day button').first();
  if ((await day.count()) && (await day.isEnabled())) {
    await day.click();
    await expect(day).toHaveAttribute('aria-expanded', 'true');
    await back();
    await expect(day).toHaveAttribute('aria-expanded', 'false');
    checks.push('Android Back closes forecast details');
  }
  await page.getByRole('link', { name: /Pistenkarte öffnen/ }).click();
  await expect(page.locator('.lift-leaflet-map')).toBeVisible();
  await back();
  await page.waitForURL('https://localhost/');
  checks.push('Map opens as a separate Android screen; Back returns home');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await runAdb('shell', 'screencap', '-p', '/sdcard/skiurlaub-review.png');
  await runAdb(
    'pull',
    '/sdcard/skiurlaub-review.png',
    path.join(artifacts, 'android-home-device.png'),
  );
  await back();
  const activities = await runAdb('shell', 'dumpsys', 'activity', 'activities');
  assert.ok(
    !activities
      .split('\n')
      .some((line) => /topResumedActivity/.test(line) && line.includes(appId)),
  );
  checks.push('Android Back on home minimizes app');
  await runAdb(
    'shell',
    'am',
    'start',
    '-n',
    `${appId}/cc.quxx.skiurlaub.MainActivity`,
  );
  await writeFile(
    path.join(artifacts, 'android-smoke.json'),
    JSON.stringify({ checks }, null, 2),
  );
  console.log(checks.join('\n'));
} finally {
  if (originalTheme && (await page.getByLabel('Darstellung').count()))
    await page
      .getByLabel('Darstellung')
      .selectOption(originalTheme)
      .catch(() => {});
  await browser.close();
  await runAdb('forward', '--remove', `tcp:${port}`);
}
