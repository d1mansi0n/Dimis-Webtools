import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';
import { PAGES, TOOLS } from '../src/config/site.js';

/**
 * These run against the production build served by `vite preview`, which is the
 * only place the strict Content Security Policy and the real worker bundle exist.
 */

/** Collect anything that looks like a CSP or Trusted Types refusal. */
function watchForViolations(page: Page): string[] {
  const violations: string[] = [];

  const inspect = (text: string): void => {
    if (
      /content security policy/i.test(text) ||
      /refused to (load|execute|connect|apply)/i.test(text) ||
      /trusted ?types/i.test(text)
    ) {
      violations.push(text);
    }
  };

  page.on('console', (message: ConsoleMessage) => {
    inspect(message.text());
  });
  page.on('pageerror', (error) => {
    inspect(error.message);
  });

  return violations;
}

test.describe('content security policy', () => {
  for (const path of PAGES) {
    test(`/${path} declares the strict policy and triggers no violation`, async ({ page }) => {
      const violations = watchForViolations(page);

      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const policy = await page
        .locator('meta[http-equiv="Content-Security-Policy"]')
        .getAttribute('content');

      expect(policy, 'every page must carry a policy').not.toBeNull();
      expect(policy).toContain("default-src 'none'");
      expect(policy).toContain("script-src 'self'");
      expect(policy).toContain("object-src 'none'");
      expect(policy).toContain("base-uri 'none'");
      expect(policy).toContain("require-trusted-types-for 'script'");
      /* `blob:` must never be allowed for workers: that is the loophole the old
         Sudoku needed, and closing it is the point of the real worker bundle. */
      expect(policy).toContain("worker-src 'self'");
      expect(policy).not.toContain('worker-src blob:');
      expect(policy).not.toContain("script-src 'unsafe-inline'");
      expect(policy).not.toContain('unsafe-eval');
      /* Header-only directives are stripped from the meta policy: a browser that
         meets one here ignores it and logs an error, which is strictly worse than
         leaving it out. */
      expect(policy).not.toContain('frame-ancestors');

      expect(violations, `CSP violations on /${path}`).toEqual([]);
    });
  }

  test('no page ships an inline script or style', async ({ page }) => {
    for (const path of PAGES) {
      await page.goto(path);
      const inlineScripts = await page.locator('script:not([src])').count();
      const inlineStyles = await page.locator('style').count();

      expect(inlineScripts, `inline <script> on /${path}`).toBe(0);
      expect(inlineStyles, `inline <style> on /${path}`).toBe(0);
    }
  });

  test('every page declares no-referrer', async ({ page }) => {
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
    }
  });

  test('the charset stays inside the first 1024 bytes', async ({ request, baseURL }) => {
    /* The policy is a long meta tag; if it were inserted before the charset
       declaration it could push it past the limit browsers actually scan. */
    const response = await request.get(baseURL ?? '/');
    const html = await response.text();
    const charsetAt = html.toLowerCase().indexOf('charset=');

    expect(charsetAt).toBeGreaterThan(-1);
    expect(Buffer.byteLength(html.slice(0, charsetAt), 'utf8')).toBeLessThan(1024);
  });
});

test.describe('no third-party requests', () => {
  test('every page loads exclusively from its own origin', async ({ page, baseURL }) => {
    const foreign: string[] = [];
    page.on('request', (request) => {
      if (!request.url().startsWith(baseURL ?? '')) foreign.push(request.url());
    });

    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }

    /* The 1.0 and 2.0 time trackers fetched xlsx from cdnjs on every visit. */
    expect(foreign).toEqual([]);
  });
});

test.describe('legacy URLs', () => {
  for (const tool of TOOLS) {
    for (const legacy of tool.legacyPaths) {
      test(`${legacy} still resolves, and redirects to /${tool.id}/`, async ({ page }) => {
        /* Relative to `baseURL`, which already ends in a slash. A leading `../`
           would climb out of the deployment base entirely. */
        await page.goto(legacy);
        await page.waitForURL(new RegExp(`/${tool.id}/$`));
        expect(page.url()).toMatch(new RegExp(`/${tool.id}/$`));
      });
    }
  }
});
