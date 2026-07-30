import { expect, test } from '@playwright/test';
import { TOOLS } from '../src/config/site.js';

/** Smoke tests: each tool boots, renders and does the one thing it exists for. */

test.describe('hub', () => {
  test('lists every tool and links to it', async ({ page }) => {
    await page.goto('');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dimis Webtools');
    await expect(page.locator('.tool-card')).toHaveCount(TOOLS.length);

    for (const tool of TOOLS) {
      await expect(page.locator(`.tool-card[href="${tool.id}/"]`)).toBeVisible();
    }
  });

  test('switches language and remembers the choice', async ({ page }) => {
    await page.goto('');
    await page.getByLabel('Language').selectOption('de');

    await expect(page.locator('[data-hub="tagline"]')).toContainText('Alltag');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');

    await page.reload();
    await expect(page.locator('[data-hub="tagline"]')).toContainText('Alltag');
  });

  test('switches theme and remembers it', async ({ page }) => {
    await page.goto('');
    const toggle = page.locator('.appbar button').first();

    await toggle.click();
    const afterFirst = await page.locator('html').getAttribute('data-theme');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', afterFirst ?? '');
  });
});

test.describe('rice cup converter', () => {
  test('converts cups of rice to cups of water', async ({ page }) => {
    await page.goto('rice/');

    await page.getByLabel('Cups of rice').fill('2');
    await expect(page.locator('#rice-water')).toHaveText('2.40');
    await expect(page.locator('[data-rice="total"]')).toContainText('4.40');
  });

  test('the stepper moves in half cups', async ({ page }) => {
    await page.goto('rice/');

    await page.getByRole('button', { name: 'Increase by half a cup' }).click();
    await expect(page.getByLabel('Cups of rice')).toHaveValue('0.5');
  });

  test('a preset changes the ratio and survives a reload', async ({ page }) => {
    await page.goto('rice/');
    await page.getByText('Settings').click();
    await page.getByRole('button', { name: 'Brown rice 1 : 2' }).click();

    await page.getByLabel('Cups of rice').fill('2');
    await expect(page.locator('#rice-water')).toHaveText('4.00');

    await page.reload();
    await page.getByLabel('Cups of rice').fill('2');
    await expect(page.locator('#rice-water')).toHaveText('4.00');
  });
});

test.describe('sugar calculator', () => {
  test('converts grams into cubes and a share of the daily maximum', async ({ page }) => {
    await page.goto('sugar/');

    await page.getByLabel('Amount of sugar in grams').fill('15');
    await expect(page.locator('[data-sugar="cubes"]')).toHaveText('5');
    await expect(page.locator('[data-sugar="percent"]')).toHaveText('30 %');
  });

  test('highlights the closest food', async ({ page }) => {
    await page.goto('sugar/');
    await page.getByLabel('Amount of sugar in grams').fill('11.4');

    await expect(page.locator('.sugar-compare li[data-closest]')).toContainText('Apple');
  });

  test('rejects a negative amount without showing a result', async ({ page }) => {
    await page.goto('sugar/');
    await page.getByLabel('Amount of sugar in grams').fill('-5');

    await expect(page.locator('#sugar-result')).toBeHidden();
    await expect(page.locator('#sugar-hint')).not.toBeEmpty();
  });
});

test.describe('time tracking', () => {
  test('adds an entry and counts time', async ({ page }) => {
    await page.goto('time/');
    await page.getByRole('button', { name: '+ New entry' }).click();

    const entry = page.locator('.time-entry').first();
    await expect(entry).toBeVisible();

    await entry.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(entry).toHaveAttribute('data-running', '');

    await expect(entry.locator('.time-entry__elapsed')).not.toHaveText('00:00:00', {
      timeout: 5000,
    });

    await entry.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(entry).not.toHaveAttribute('data-running', '');
  });

  test('keeps entries across a reload', async ({ page }) => {
    await page.goto('time/');
    await page.getByRole('button', { name: '+ New entry' }).click();
    await expect(page.locator('.time-entry')).toHaveCount(1);

    await page.reload();
    await expect(page.locator('.time-entry')).toHaveCount(1);
  });

  test('exports a real .xlsx file with no network request', async ({ page }) => {
    await page.goto('time/');
    await page.getByRole('button', { name: '+ New entry' }).click();

    const download = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export to Excel' }).click(),
    ]).then(([event]) => event);

    expect(download.suggestedFilename()).toMatch(/^time-entries-\d{4}-\d{2}-\d{2}\.xlsx$/);

    /* A ZIP container, which is what an .xlsx is. The unit tests check the parts. */
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).subarray(0, 2).toString('latin1')).toBe('PK');
  });

  test('refuses to export nothing', async ({ page }) => {
    await page.goto('time/');
    await page.getByRole('button', { name: 'Export to Excel' }).click();
    await expect(page.locator('[data-time="feedback"]')).toContainText('no entries');
  });
});

test.describe('picture counter', () => {
  test('starts with an empty canvas and a prompt', async ({ page }) => {
    await page.goto('counter/');
    await expect(page.locator('[data-counter="overlay"]')).toBeVisible();
    await expect(page.locator('[data-counter="count"]')).toHaveText('0 markers');
  });

  test('loads an image and places markers where it is tapped', async ({ page }) => {
    await page.goto('counter/');

    /* A tiny PNG, built here rather than committed as a fixture. */
    await page.setInputFiles('#counter-file', {
      name: 'test.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAKklEQVR4nO3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAHwbXsAAAeC0G0oAAAAASUVORK5CYII=',
        'base64',
      ),
    });

    const canvas = page.locator('[data-counter="canvas"]');
    await expect(canvas).toBeVisible();

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (box === null) return;

    /* The two taps are deliberately well apart. A marker's hit area is expressed
       in image pixels, and this 100x100 test image is scaled up several times to
       fit the stage, so a nearby second tap would land inside the first marker
       and be read as picking it up rather than adding another. */
    const centreY = box.y + box.height / 2;
    await page.mouse.click(box.x + box.width / 2 - 80, centreY);
    await expect(page.locator('[data-counter="count"]')).toHaveText('1 marker');

    await page.mouse.click(box.x + box.width / 2 + 80, centreY);
    await expect(page.locator('[data-counter="count"]')).toHaveText('2 markers');

    await page.getByRole('button', { name: 'Undo last' }).click();
    await expect(page.locator('[data-counter="count"]')).toHaveText('1 marker');
  });

  test('ignores a tap on the empty space beside the image', async ({ page }) => {
    await page.goto('counter/');
    await page.setInputFiles('#counter-file', {
      name: 'test.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAKklEQVR4nO3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAHwbXsAAAeC0G0oAAAAASUVORK5CYII=',
        'base64',
      ),
    });

    const box = await page.locator('[data-counter="canvas"]').boundingBox();
    expect(box).not.toBeNull();
    if (box === null) return;

    /* A marker placed in the margin would show in the on-screen count but be
       absent from the exported PNG, because its coordinates lie off the picture.
       The corner is used rather than an edge midpoint: a square image fitted into
       a non-square stage leaves its margin on the wider axis, and which axis that
       is flips between the desktop and mobile viewports. A corner is outside the
       picture either way. */
    await page.mouse.click(box.x + 2, box.y + 2);
    await expect(page.locator('[data-counter="count"]')).toHaveText('0 markers');
  });

  test('rejects a file that is not an image', async ({ page }) => {
    await page.goto('counter/');
    await page.setInputFiles('#counter-file', {
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not an image'),
    });

    await expect(page.locator('[data-counter="error"]')).toContainText('not an image');
  });
});

test.describe('sudoku', () => {
  test('generates a puzzle in a worker and renders it', async ({ page }) => {
    await page.goto('sudoku/');

    await expect(page.locator('.sudoku-cell')).toHaveCount(81);
    /* Generation happens off the main thread; give it a moment to land. */
    await expect(page.locator('.sudoku-cell[data-given]').first()).toBeVisible({
      timeout: 15_000,
    });

    const givens = await page.locator('.sudoku-cell[data-given]').count();
    expect(givens).toBeGreaterThan(16);
    expect(givens).toBeLessThan(81);
  });

  test('accepts a digit from the number pad', async ({ page }) => {
    await page.goto('sudoku/');
    await expect(page.locator('.sudoku-cell[data-given]').first()).toBeVisible({
      timeout: 15_000,
    });

    const empty = page.locator('.sudoku-cell:not([data-given])').first();
    await empty.click();
    await page.locator('.sudoku-pad button', { hasText: /^5$/ }).click();

    await expect(empty.locator('.sudoku-cell__value')).toHaveText('5');
  });

  test('supports the keyboard', async ({ page }) => {
    await page.goto('sudoku/');
    await expect(page.locator('.sudoku-cell[data-given]').first()).toBeVisible({
      timeout: 15_000,
    });

    const empty = page.locator('.sudoku-cell:not([data-given])').first();
    await empty.click();
    await page.keyboard.press('Digit7');
    await expect(empty.locator('.sudoku-cell__value')).toHaveText('7');

    await page.keyboard.press('Delete');
    await expect(empty.locator('.sudoku-cell__value')).toHaveText('');
  });

  test('runs the timer and pauses it', async ({ page }) => {
    await page.goto('sudoku/');
    await expect(page.locator('.sudoku-cell[data-given]').first()).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.locator('[data-sudoku="timer"]')).not.toHaveText('00:00', {
      timeout: 5000,
    });

    await page.locator('[data-sudoku="pause"]').click();
    await expect(page.locator('.sudoku-grid-wrapper')).toHaveAttribute('data-paused', '');
  });

  test('saves and reloads a game', async ({ page }) => {
    await page.goto('sudoku/');
    await expect(page.locator('.sudoku-cell[data-given]').first()).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('[data-sudoku="message"]')).toContainText('saved');

    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await expect(page.locator('.sudoku-save-list li')).toHaveCount(1);
  });
});
