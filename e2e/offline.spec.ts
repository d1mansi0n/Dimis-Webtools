/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import { PAGES } from '../src/config/site.js';

/**
 * Offline support, proven by actually cutting the network.
 *
 * A service worker that is merely registered proves nothing — the interesting
 * question is whether a tool the visitor has never opened still works from a
 * cold cache with the connection gone, which is the situation the feature exists
 * for: a shopping list in a shop with one bar of signal.
 *
 * These run against `vite preview`, which serves the production build, because
 * that is the only place the worker is registered at all. In development it is
 * deliberately not, so it cannot serve yesterday's modules over hot reload.
 */

/** Wait until the worker has installed, activated and taken control of the page. */
const waitForControl = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 20_000,
  });
};

test.describe('offline support', () => {
  test('serves a tool that was never visited, with the network off', async ({ page, context }) => {
    /* Open one tool. Its worker precaches every page, not just this one. */
    await page.goto('recipes/');
    await waitForControl(page);

    await context.setOffline(true);

    /* Sudoku has not been opened in this context, so nothing but the precache
       can be serving it. */
    await page.goto('sudoku/');
    await expect(page.getByRole('button', { name: 'New game' })).toBeVisible();

    /* And the worker it needs is cached too, so a puzzle still generates. */
    await expect(page.locator('.sudoku-cell').first()).toBeVisible();
  });

  test('every page loads offline', async ({ page, context }) => {
    await page.goto('');
    await waitForControl(page);

    await context.setOffline(true);

    for (const path of PAGES) {
      const response = await page.goto(path);
      expect(response?.ok(), `/${path} did not load offline`).toBe(true);

      /*
       * The skip link is empty in the served HTML and gets its text from
       * `boot()`, so a non-empty one proves the modules and the stylesheet
       * arrived and ran — not merely that the document did.
       *
       * This assertion earns its keep: an earlier version checked that `<main>`
       * was visible, which static HTML satisfies on its own. It passed against a
       * build where every script had failed to load.
       */
      await expect(page.locator('.skip-link'), `/${path} loaded but did not boot`).not.toBeEmpty();
    }
  });

  test('the recipes shopping list survives going offline mid-use', async ({ page, context }) => {
    await page.goto('recipes/');
    await waitForControl(page);

    await page.locator('.recipe').first().getByRole('button', { name: 'Add to list' }).click();

    await context.setOffline(true);
    await page.reload();

    await page.getByRole('button', { name: 'Shopping list' }).click();
    await expect(page.locator('.recipes-item', { hasText: 'Rolled oats' })).toBeVisible();
  });

  test('prefers the network when there is one', async ({ page, context }) => {
    /* The whole reason pages are network-first: someone online must never be
       served a version the worker is holding on to. If a navigation were
       answered from cache, no request for it would reach the server. */
    await page.goto('rice/');
    await waitForControl(page);

    const requested: string[] = [];
    context.on('request', (request) => {
      if (request.isNavigationRequest()) requested.push(request.url());
    });

    await page.goto('rice/');
    expect(
      requested.some((url) => url.includes('/rice/')),
      'a navigation while online must still hit the network',
    ).toBe(true);
  });
});
