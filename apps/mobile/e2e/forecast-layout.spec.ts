import { expect, test } from '@playwright/test';
import { resortResponse, weatherResponse } from '../src/test/fixtures';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) =>
    new URL(route.request().url()).hostname !== '127.0.0.1'
      ? route.abort()
      : route.continue(),
  );
});

// Every day row is its own grid. Content-sized columns made the icons drift from row to row;
// with fixed columns all rows must line up exactly, whatever the text widths are.
test('Prognose-Zeilen stehen spaltengenau untereinander', async ({ page }) => {
  await page.route('https://api.open-meteo.com/**', (route) => {
    const w = weatherResponse();
    w.daily.weather_code = [0, 3, 61, 71, 45, 95, 2];
    w.daily.temperature_2m_max = [-12, 3, 10, 0, -1, 12, 5];
    w.daily.temperature_2m_min = [-18, -1, 2, -7, -3, 9, -20];
    w.daily.snowfall_sum = [0, 5.5, 12.5, 0.4, 100, 1, 33.3];
    return route.fulfill({ json: w });
  });
  await page.route('https://status.live/api/**', (route) =>
    route.fulfill({ json: resortResponse() }),
  );
  await page.clock.setFixedTime(new Date('2027-01-10T12:00:00Z'));
  await page.goto('/');
  const rows = page.locator('.forecast-row');
  await expect(rows).toHaveCount(7);

  const measure = await rows.evaluateAll((elements) =>
    elements.map((row) => {
      const box = (selector: string) => {
        const element = row.querySelector(selector)!;
        const r = element.getBoundingClientRect();
        return { left: r.left, right: r.right };
      };
      return {
        icon: box(':scope > svg'),
        snow: box('.forecast-snow'),
        temp: box('strong'),
        high: box('strong > span'),
        low: box('strong > small'),
        chevron: box('.forecast-chevron'),
        date: box('.forecast-date'),
      };
    }),
  );
  const same = (pick: (m: (typeof measure)[number]) => number) => {
    const values = measure.map(pick);
    return Math.max(...values) - Math.min(...values);
  };
  expect(same((m) => m.icon.left)).toBeLessThan(0.5);
  expect(same((m) => m.snow.left)).toBeLessThan(0.5);
  expect(same((m) => m.snow.right)).toBeLessThan(0.5);
  expect(same((m) => m.temp.right)).toBeLessThan(0.5);
  expect(same((m) => m.high.right)).toBeLessThan(0.5);
  expect(same((m) => m.low.right)).toBeLessThan(0.5);
  expect(same((m) => m.chevron.left)).toBeLessThan(0.5);
  expect(same((m) => m.date.left)).toBeLessThan(0.5);
  // Nothing overlaps: each column ends before the next one starts.
  for (const m of measure) {
    expect(m.date.right).toBeLessThanOrEqual(m.icon.left + 0.5);
    expect(m.icon.right).toBeLessThanOrEqual(m.snow.left + 0.5);
    expect(m.snow.right).toBeLessThanOrEqual(m.temp.left + 0.5);
    expect(m.temp.right).toBeLessThanOrEqual(m.chevron.left + 0.5);
  }
});
