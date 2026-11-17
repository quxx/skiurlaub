import { expect, test } from '@playwright/test';
import { weatherResponse, resortResponse } from '../src/test/fixtures';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', async (route) => {
    if (new URL(route.request().url()).hostname !== '127.0.0.1')
      return route.abort();
    return route.continue();
  });
});

test('alle Routen funktionieren direkt, nach Reload und über die Navigation', async ({
  page,
}) => {
  for (const [path, title] of [
    ['/skitage', 'Skitage'],
    ['/gruppe', 'Gruppe'],
    ['/skipaesse', 'Skipässe'],
    ['/profil', 'Profil'],
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Hauptnavigation' })
        .getByRole('link', { name: title === 'Skipässe' ? 'Profil' : title }),
    ).toHaveAttribute('aria-current', 'page');
  }
  await expect(page.getByRole('navigation').getByRole('link')).toHaveCount(4);
  await page.getByRole('link', { name: /Skipässe Verwaltung/ }).click();
  await expect(page).toHaveURL(/\/skipaesse$/);
  await page.getByRole('link', { name: 'Zurück zum Profil' }).click();
  await expect(page).toHaveURL(/\/profil$/);
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Gruppe', exact: true })
    .click();
  await expect(page).toHaveURL(/\/gruppe$/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('Theme folgt dem System und bleibt bei expliziter Auswahl persistent', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/profil');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByLabel('Darstellung').selectOption('dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('Herunterziehen aktualisiert beide Quellen und respektiert die Mindestpause', async ({
  page,
}) => {
  const now = new Date('2027-01-10T12:00:00Z');
  await page.clock.setFixedTime(now);
  let weatherCalls = 0;
  let resortCalls = 0;
  await page.route('https://api.open-meteo.com/**', (route) => {
    weatherCalls++;
    return route.fulfill({ json: weatherResponse() });
  });
  await page.route('https://status.live/api/**', (route) => {
    resortCalls++;
    return route.fulfill({ json: resortResponse() });
  });
  await page.goto('/');
  await expect(page.locator('.update-line')).toContainText('Aktualisiert');
  await expect(page.locator('.current-weather')).toContainText('Wind');
  const pull = () =>
    page.evaluate(() => {
      const target = document.querySelector('.current-weather')!;
      const touch = (y: number) =>
        new Touch({ identifier: 1, target, clientX: 120, clientY: y });
      target.dispatchEvent(
        new TouchEvent('touchstart', { bubbles: true, touches: [touch(150)] }),
      );
      target.dispatchEvent(
        new TouchEvent('touchmove', {
          bubbles: true,
          cancelable: true,
          touches: [touch(350)],
        }),
      );
      target.dispatchEvent(
        new TouchEvent('touchend', { bubbles: true, touches: [] }),
      );
    });
  await pull();
  await expect(page.locator('.pull-refresh-feedback')).toContainText(
    'Sekunden',
  );
  expect([weatherCalls, resortCalls]).toEqual([1, 1]);
  await page.clock.setFixedTime(new Date(now.getTime() + 61_000));
  await pull();
  await expect(page.locator('.pull-refresh-feedback')).toHaveText(
    'Daten aktualisiert.',
  );
  expect([weatherCalls, resortCalls]).toEqual([2, 2]);
});

test('Dashboard bleibt bei nicht erreichbaren Quellen lesbar', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /Hochkrimml/ }).first(),
  ).toBeVisible();
  await expect(
    page.getByText('Nicht verfügbar', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Hauptnavigation' }),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('link', { name: 'Skitage', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Skitage', exact: true }),
  ).toBeVisible();
});

test('Prognose und Karte bleiben mit gemockten Quellen bedienbar', async ({
  page,
}) => {
  await page.route('https://api.open-meteo.com/**', (route) =>
    route.fulfill({ json: weatherResponse() }),
  );
  await page.route('https://status.live/api/**', (route) =>
    route.fulfill({ json: resortResponse() }),
  );
  await page.route('https://liftradar.eu/**', (route) =>
    route.fulfill({ json: { areas: [], runs: [] } }),
  );
  await page.goto('/');
  const forecastDay = page.locator('.forecast-day button').first();
  await forecastDay.click();
  await expect(forecastDay).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.hourly-panel')).toBeVisible();
  await page.getByRole('link', { name: /Pistenkarte öffnen/ }).click();
  await expect(page.locator('.lift-leaflet-map')).toBeVisible();
  await page.screenshot({
    path: `test-results/dashboard-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test('Cache nach Netzausfall bleibt klar veraltet und nennt alte Tage nicht Heute', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2027-01-10T12:00:00Z'));
  let offline = false;
  await page.route('https://api.open-meteo.com/**', (route) =>
    offline ? route.abort() : route.fulfill({ json: weatherResponse() }),
  );
  await page.route('https://status.live/api/**', (route) =>
    offline ? route.abort() : route.fulfill({ json: resortResponse() }),
  );
  await page.goto('/');
  await expect(
    page.getByRole('heading', {
      name: 'Offizieller Schneebericht',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText('1 / 2 offen', { exact: true })).toBeVisible();
  offline = true;
  await page.clock.setFixedTime(new Date('2027-01-11T12:01:00Z'));
  await page.reload();
  await expect(
    page.getByText('Veraltet', { exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator('.forecast-day button').first()).not.toContainText(
    'Heute',
  );
  await expect(
    page.getByText(/Messwerte im offiziellen Bericht/),
  ).toBeVisible();
  await expect(page.locator('.dashboard-status')).toContainText('10.01.2027');
});

test('kaputte Antworten und manipulierte Caches brechen das Dashboard nicht', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'skiurlaub:resort:zillertal-arena:v5',
      JSON.stringify({ version: 1, storedAt: Date.now(), raw: null }),
    );
  });
  await page.route('https://api.open-meteo.com/**', (route) =>
    route.fulfill({ json: null }),
  );
  await page.route('https://status.live/api/**', (route) =>
    route.fulfill({ json: { lifts: { state: 'source_error' } } }),
  );
  await page.goto('/');
  await expect(page.locator('.dashboard-status')).toContainText(
    'ungültige Daten',
  );
  await expect(page.getByRole('heading', { name: /Hochkrimml/ })).toBeVisible();
  await expect(
    page.getByText('Die Wetterquelle ist derzeit nicht verfügbar.', {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Profil', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Profil', exact: true }),
  ).toBeVisible();
});
