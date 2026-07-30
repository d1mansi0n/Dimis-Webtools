import { describe, expect, it } from 'vitest';
import { FOODS, type Food } from './foods.js';
import { analyse, compare, COMPARISON_WINDOW, CUBE_G, WHO_DAILY_MAX_G } from './sugar.js';
import { LOCALES } from '../../i18n/index.js';

describe('food data', () => {
  it('is sorted by sugar content, which the comparison window relies on', () => {
    const values = FOODS.map((food) => food.sugarPer100g);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });

  it('has a unique id per food', () => {
    expect(new Set(FOODS.map((food) => food.id)).size).toBe(FOODS.length);
  });

  it('names every food in every supported language', () => {
    for (const food of FOODS) {
      for (const locale of LOCALES) {
        expect(food.name[locale].trim(), `${food.id} in ${locale}`).toBeTruthy();
      }
    }
  });

  it('holds enough foods to fill a comparison window', () => {
    expect(FOODS.length).toBeGreaterThanOrEqual(COMPARISON_WINDOW);
  });
});

describe('analyse', () => {
  it('converts grams to cubes', () => {
    expect(analyse(15).cubes).toBe(5);
    expect(analyse(CUBE_G).cubes).toBe(1);
  });

  it('expresses the amount as a share of the WHO daily maximum', () => {
    expect(analyse(WHO_DAILY_MAX_G).percentOfDailyMax).toBe(100);
    expect(analyse(25).percentOfDailyMax).toBe(50);
  });

  it('rounds the cube count for the icon strip', () => {
    expect(analyse(10).wholeCubes).toBe(3);
    expect(analyse(11).wholeCubes).toBe(4);
  });

  it('handles zero', () => {
    expect(analyse(0)).toMatchObject({ cubes: 0, percentOfDailyMax: 0, wholeCubes: 0 });
  });
});

describe('compare', () => {
  it('finds the closest food', () => {
    expect(compare(11.5).closest.id).toBe('apple');
  });

  it('returns a full window', () => {
    expect(compare(11.5).window).toHaveLength(COMPARISON_WINDOW);
  });

  it('includes the closest food in the window', () => {
    for (const grams of [0, 3, 12, 47, 99.8]) {
      const { window, closest } = compare(grams);
      expect(window, `window for ${String(grams)} g`).toContain(closest);
    }
  });

  it('keeps the window inside the list at the low end', () => {
    const { window } = compare(0);
    expect(window[0]?.id).toBe(FOODS[0]?.id);
  });

  it('keeps the window inside the list at the high end', () => {
    const { window } = compare(1000);
    expect(window.at(-1)?.id).toBe(FOODS.at(-1)?.id);
  });

  it('picks the highest-sugar food for an amount above everything in the list', () => {
    /* Version 1.0 searched for the first food with *at least* this much sugar and
       found none, then rendered the window starting at index 0 — the least sugary
       foods in the table. This is the regression test for that. */
    expect(compare(500).closest.id).toBe('table-sugar');
  });

  it('picks the lowest-sugar food for a negative amount', () => {
    expect(compare(-5).closest.sugarPer100g).toBe(0);
  });

  it('prefers the earlier of two equally distant foods, deterministically', () => {
    const foods: Food[] = [
      { id: 'a', sugarPer100g: 10, name: { de: 'A', en: 'A' } },
      { id: 'b', sugarPer100g: 20, name: { de: 'B', en: 'B' } },
    ];
    expect(compare(15, foods).closest.id).toBe('a');
  });

  it('returns a short window when the list is smaller than the window', () => {
    const foods: Food[] = [{ id: 'only', sugarPer100g: 5, name: { de: 'X', en: 'X' } }];
    expect(compare(5, foods).window).toHaveLength(1);
  });

  it('refuses an empty list rather than returning something meaningless', () => {
    expect(() => compare(5, [])).toThrow();
  });
});
