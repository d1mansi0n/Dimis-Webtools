import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the *production build* served by `vite preview`,
 * not against the dev server. That matters: the strict Content Security Policy
 * and the real worker bundle only exist in the built output, and one of the
 * tests asserts that no page triggers a CSP violation.
 */
const PORT = 4173;
const BASE_PATH = process.env['BASE_PATH'] ?? '/Dimis-Webtools/';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  /* Spread rather than `undefined`, which `exactOptionalPropertyTypes` rejects:
     omitting the key is what makes Playwright pick its own default locally. */
  ...(process.env['CI'] === undefined ? {} : { workers: 1 }),
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: `http://localhost:${String(PORT)}${BASE_PATH}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],

  webServer: {
    command: `npm run build && npx vite preview --port ${String(PORT)} --strictPort`,
    url: `http://localhost:${String(PORT)}${BASE_PATH}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
