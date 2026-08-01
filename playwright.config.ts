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

  /*
   * Four projects are defined, but `npm run e2e` runs two of them.
   *
   * All four together take about sixteen minutes, and paying that on every
   * change is not worth it for a site of six small tools. `npm run e2e` is
   * therefore Chromium plus the mobile viewport — around four minutes — and
   * `npm run e2e:all` is the full sweep, which is what CI and the deploy run.
   *
   * They stay defined here rather than being added conditionally under `CI`, so
   * that `--project=webkit` works locally when something needs debugging on it.
   * That happens: WebKit is where `localStorage` actually throws on access —
   * private browsing and the lockdown profiles, the path `core/storage.ts`
   * exists for — and it is the engine furthest from Chromium on Trusted Types,
   * service workers and `<dialog>`. Firefox catches the other direction.
   *
   * The mobile project stays on Chromium: touch emulation is what it is for, and
   * it is where the radial picker's synthesised-click behaviour is reproducible.
   */
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],

  webServer: {
    command: `npm run build && npx vite preview --port ${String(PORT)} --strictPort`,
    url: `http://localhost:${String(PORT)}${BASE_PATH}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
