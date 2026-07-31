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

/**
 * What happens when a new deploy meets a worker already installed in someone's
 * browser.
 *
 * This is the part of a service worker that actually hurts when it is wrong. A
 * first install is easy and was the only thing the tests above exercise; the
 * upgrade is where a visitor gets stranded on an old version, or where discarded
 * caches pile up in their storage quota forever.
 *
 * These drive the two guarantees directly rather than by orchestrating two real
 * builds: the cache is poisoned with a known value and the worker is made to
 * activate again. That tests the logic in `src/sw.ts` deterministically. It does
 * not test Rollup's hashing or GitHub Pages' cache headers, and it is not meant
 * to.
 */
test.describe('service worker upgrades', () => {
  test('discards caches from an earlier version when it activates', async ({ page }) => {
    await page.goto('recipes/');
    await waitForControl(page);

    /* Stand in for a cache left behind by a previous deploy. */
    await page.evaluate(async () => {
      const stale = await caches.open('dwt-from-an-old-deploy');
      await stale.put(new URL('stale-probe', location.href).href, new Response('old'));
    });

    expect(
      await page.evaluate(() => caches.keys()),
      'the stale cache should exist before the upgrade',
    ).toContain('dwt-from-an-old-deploy');

    /* Unregistering and reloading makes the worker install and activate from
       scratch, which is the same code path a new deploy takes. */
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.unregister();
    });
    await page.reload();
    await waitForControl(page);

    const names = await page.evaluate(() => caches.keys());
    expect(names, 'the old cache must not survive activation').not.toContain(
      'dwt-from-an-old-deploy',
    );
    expect(
      names.filter((name) => name.startsWith('dwt-')).length,
      'exactly one cache should remain',
    ).toBe(1);
  });

  test('never serves a cached page to someone who is online', async ({ page, context }) => {
    await page.goto('recipes/');
    await waitForControl(page);

    /*
     * Replace the cached copy of this page with something unmistakable. If the
     * worker ever preferred its cache over the network, this is what a visitor
     * would see after a deploy — which is the failure that makes service workers
     * infamous, and the whole reason pages here are network-first.
     */
    await page.evaluate(async () => {
      const names = await caches.keys();
      const name = names.find((candidate) => candidate.startsWith('dwt-'));
      if (name === undefined) throw new Error('no cache to poison');
      const cache = await caches.open(name);
      await cache.put(
        location.href,
        new Response(
          '<!doctype html><html><head><title>stale</title></head><body><main><p id="stale-marker">STALE</p></main></body></html>',
          { headers: { 'content-type': 'text/html' } },
        ),
      );
    });

    /* Offline first: this proves the poisoned entry really is what the cache
       would answer with, so the online half below is a meaningful comparison
       rather than a test that could pass on an empty cache. */
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#stale-marker')).toBeVisible();

    /* Back online, the network answer must win. */
    await context.setOffline(false);
    await page.reload();
    await expect(page.locator('#stale-marker')).toHaveCount(0);
    await expect(page.locator('.skip-link')).not.toBeEmpty();
  });

  test('refreshes the cached copy from the network as it goes', async ({ page, context }) => {
    /* The upgrade path only works if a successful navigation writes back to the
       cache; otherwise the offline fallback freezes at whatever was precached at
       install time and drifts further from the site with every deploy. */
    await page.goto('recipes/');
    await waitForControl(page);

    await page.evaluate(async () => {
      const names = await caches.keys();
      const cache = await caches.open(names.find((n) => n.startsWith('dwt-')) ?? '');
      await cache.put(
        location.href,
        new Response('<!doctype html><body><p id="stale-marker">STALE</p>', {
          headers: { 'content-type': 'text/html' },
        }),
      );
    });

    /* One online visit should overwrite it. */
    await page.reload();
    await expect(page.locator('#stale-marker')).toHaveCount(0);

    /* So going offline now serves the real page, not the poisoned one. */
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#stale-marker')).toHaveCount(0);
    await expect(page.locator('.skip-link')).not.toBeEmpty();
  });
});
