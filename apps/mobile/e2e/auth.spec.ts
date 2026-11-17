import { expect, test } from '@playwright/test';

test('lokale App-Anmeldung, Profiländerung, Neustart und Logout', async ({
  page,
}) => {
  await page.goto('/profil');
  await expect(
    page.getByText('Lokaler Testmodus:', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Mit Skiline anmelden/ }),
  ).toHaveCount(0);
  const email = `e2e-${crypto.randomUUID()}@example.invalid`;
  await page.getByLabel('E-Mail-Adresse').fill(email);
  await page
    .getByRole('button', { name: 'Code anfordern', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Lokalen Testcode übernehmen', exact: true })
    .click();
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Dein Profil', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.getByLabel('Anzeigename').fill('Test im Schnee');
  await page
    .getByRole('button', { name: 'Profil speichern', exact: true })
    .click();
  await expect(
    page.getByText('Profil gespeichert.', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Anzeigename')).toHaveValue('Test im Schnee');
  const cookies = await page.context().cookies();
  expect(
    cookies.find((cookie) => cookie.name === 'skiurlaub_local_session')
      ?.httpOnly,
  ).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    'skiurlaub_local_session',
  );
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).some((key) => /session|token/i.test(key)),
    ),
  ).toBe(false);
  await page.getByRole('button', { name: 'Abmelden', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Anmelden', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Anmelden', exact: true }),
  ).toBeVisible();
});

test('falscher Einmalcode meldet einen Fehler statt Zugang zu gewähren', async ({
  page,
}) => {
  await page.goto('/profil');
  await page
    .getByLabel('E-Mail-Adresse')
    .fill(`invalid-${crypto.randomUUID()}@example.invalid`);
  await page
    .getByRole('button', { name: 'Code anfordern', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Lokalen Testcode übernehmen', exact: true })
    .click();
  const actual = await page.getByLabel('Einmalcode').inputValue();
  await page
    .getByLabel('Einmalcode')
    .fill(actual === '00000000' ? '11111111' : '00000000');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'ungültig oder abgelaufen',
  );
  await expect(
    page.getByRole('heading', { name: 'Dein Profil', exact: true }),
  ).toHaveCount(0);
});
