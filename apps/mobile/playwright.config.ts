import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1024, height: 768 },
      },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @skiurlaub/api test:serve',
      url: 'http://127.0.0.1:8787/api/v1/health',
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command:
        'node node_modules/vite/bin/vite.js build --mode test && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort',
      env: { VITE_API_BASE_URL: '', VITE_GOOGLE_WEB_CLIENT_ID: '' },
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
    },
  ],
});
