/**
 * Sugar Calculator — domain logic.
 *
 * Turns a number of grams into the three things the tool shows: an equivalent
 * number of sugar cubes, a share of the WHO daily maximum, and a window of
 * comparable foods centred on the closest match.
 */

import { FOODS, type Food } from './foods.js';

/** WHO guidance: at most 50 g of free sugars per day for an average adult. */
export const WHO_DAILY_MAX_G = 50;

/** A European sugar cube weighs about 3 g. */
export const CUBE_G = 3;

/** Beyond this, the cube visualisation is summarised rather than drawn. */
export const MAX_CUBE_ICONS = 60;

/** How many foods to show around the closest match. */
export const COMPARISON_WINDOW = 11;

export interface SugarBreakdown {
  readonly grams: number;
  readonly cubes: number;
  /** Share of the WHO daily maximum, as a percentage. */
  readonly percentOfDailyMax: number;
  /** Cubes rounded to a whole number, for the icon strip. */
  readonly wholeCubes: number;
}

export function analyse(grams: number): SugarBreakdown {
  return {
    grams,
    cubes: grams / CUBE_G,
    percentOfDailyMax: (grams / WHO_DAILY_MAX_G) * 100,
    wholeCubes: Math.round(grams / CUBE_G),
  };
}

export interface Comparison {
  /** The window of foods to display, in ascending order of sugar content. */
  readonly window: readonly Food[];
  /** The food in `window` closest to the queried amount. */
  readonly closest: Food;
}

/**
 * Find the foods nearest a given amount of sugar.
 *
 * Selection is by absolute distance rather than "the first food with at least
 * this much sugar", which is what version 1.0 did. That older rule returned no
 * match at all for anything above 99.8 g — the search fell off the end of the
 * list and silently rendered the *lowest*-sugar foods instead.
 */
export function compare(grams: number, foods: readonly Food[] = FOODS): Comparison {
  if (foods.length === 0) {
    throw new Error('compare() needs at least one food to compare against.');
  }

  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < foods.length; index++) {
    const food = foods[index];
    if (food === undefined) continue;
    const distance = Math.abs(food.sugarPer100g - grams);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  }

  /* Centre the window on the match, then slide it back inside the list so the
     window is always full even at either end. */
  const half = Math.floor(COMPARISON_WINDOW / 2);
  const lastPossibleStart = Math.max(0, foods.length - COMPARISON_WINDOW);
  const start = Math.min(Math.max(0, closestIndex - half), lastPossibleStart);

  const closest = foods[closestIndex];
  /* istanbul ignore next -- closestIndex is always a valid index of a non-empty list */
  if (closest === undefined) throw new Error('unreachable');

  return { window: foods.slice(start, start + COMPARISON_WINDOW), closest };
}
