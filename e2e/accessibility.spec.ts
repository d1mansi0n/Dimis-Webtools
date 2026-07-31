import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PAGES } from '../src/config/site.js';

/**
 * Automated accessibility sweep over every page the site ships.
 *
 * This derives from `PAGES` for the same reason the Content Security Policy
 * sweep does: adding a tool to `src/config/site.ts` should enrol it in the
 * checks automatically, rather than relying on whoever adds it to remember that
 * the checks exist.
 *
 * What this can and cannot do is worth being honest about. Automated rules catch
 * perhaps half of what matters — a control with no accessible name, a missing
 * landmark, a broken heading order, an unlabelled form field. They cannot tell
 * whether a label makes sense, whether focus order matches reading order, or
 * whether a live region announces at a useful moment. A clean run here is a
 * floor, not a certificate.
 *
 * Colour contrast is deliberately included even though `core/color.ts` already
 * derives the accent palette against the WCAG figures: that code proves the
 * generated accents are legible, while this proves the result of combining them
 * with the rest of the stylesheet actually is.
 */

/** WCAG 2.1 A and AA, which is the level the palette code already targets. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const scan = (page: Page): AxeBuilder => new AxeBuilder({ page }).withTags(TAGS);

/** Render an axe violation as something that names the element and the fix. */
const describeViolations = (
  violations: readonly {
    id: string;
    help: string;
    helpUrl: string;
    nodes: readonly { html: string; target: unknown[] }[];
  }[],
): string =>
  violations
    .map((violation) => {
      const nodes = violation.nodes
        .map((node) => `      ${JSON.stringify(node.target)}\n        ${node.html}`)
        .join('\n');
      return `  [${violation.id}] ${violation.help}\n    ${violation.helpUrl}\n${nodes}`;
    })
    .join('\n\n');

test.describe('accessibility', () => {
  for (const path of PAGES) {
    test(`/${path} has no automatically detectable violation`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const results = await scan(page).analyze();

      expect(
        results.violations.length,
        `accessibility violations on /${path}:\n\n${describeViolations(results.violations)}`,
      ).toBe(0);
    });
  }

  /**
   * The dialog replaced `window.confirm`, so it carries the weight of every
   * destructive confirmation on the site. A modal that traps focus incorrectly
   * is worse than no modal, and the native `<dialog>` only behaves if it is
   * opened with `showModal()` — which is the kind of thing that survives a
   * refactor only when something checks.
   */
  test('the confirmation dialog is a real modal and takes focus', async ({ page }) => {
    /* Time tracking is the shortest route to a confirmation: one entry, then
       the button that would throw it away. */
    await page.goto('time/');
    await page.getByRole('button', { name: '+ New entry' }).click();
    await page.getByRole('button', { name: 'Clear all entries' }).click();

    const dialog = page.locator('dialog[open]');
    await expect(dialog).toBeVisible();

    /* `showModal()` renders everything outside the dialog inert; a plain
       `show()` or a hand-rolled overlay would not. `:modal` matches only the
       former, and is asked for as a selector rather than through `evaluate` so
       no DOM lib is needed in this project's TypeScript config. */
    await expect(
      page.locator('dialog:modal'),
      'the dialog must be opened with showModal()',
    ).toHaveCount(1);

    /* Focus starts on the safe choice, so a stray Return cannot confirm. */
    await expect(page.getByRole('button', { name: 'No' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  /**
   * The skip link is the first focusable thing on every page, and it is the
   * whole keyboard-accessibility story for the app bar: without it, reaching a
   * tool's controls means tabbing through the header on every page.
   */
  test('every page starts with a working skip link', async ({ page }) => {
    for (const path of PAGES) {
      await page.goto(path);
      await page.keyboard.press('Tab');

      const focused = page.locator('.skip-link:focus');
      await expect(focused, `no skip link focused first on /${path}`).toHaveCount(1);
      await expect(focused).toHaveAttribute('href', '#main');
    }
  });
});
