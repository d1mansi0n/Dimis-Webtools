/**
 * Rice Cup Converter — domain logic.
 *
 * Kept apart from the DOM so the arithmetic and the persistence rules can be
 * tested without a browser, and so the interesting part of the tool is readable
 * in one screen.
 */

import { defineStore, type Store } from '../../core/storage.js';
import { inRange, number } from '../../core/schema.js';

export const DEFAULT_RATIO = 1.2;
export const MIN_RATIO = 0.1;
export const MAX_RATIO = 10;

/** Cups added or removed by the stepper buttons. */
export const CUP_STEP = 0.5;

export const MAX_CUPS = 100;

export interface Preset {
  /** Translation key for the button label. */
  readonly labelKey:
    'rice.preset.sushi' | 'rice.preset.white' | 'rice.preset.basmati' | 'rice.preset.brown';
  readonly ratio: number;
}

export const PRESETS: readonly Preset[] = [
  { labelKey: 'rice.preset.sushi', ratio: 1 },
  { labelKey: 'rice.preset.white', ratio: 1.2 },
  { labelKey: 'rice.preset.basmati', ratio: 1.5 },
  { labelKey: 'rice.preset.brown', ratio: 2 },
];

export interface Conversion {
  /** Cups of water needed. */
  readonly water: number;
  /** Cups of rice and water together, i.e. what ends up in the pot. */
  readonly total: number;
}

export function convert(cups: number, ratio: number): Conversion {
  const water = cups * ratio;
  return { water, total: cups + water };
}

/** True when a ratio is one the tool will accept and store. */
export function isValidRatio(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_RATIO && value <= MAX_RATIO;
}

/**
 * The stored water-to-rice ratio.
 *
 * The bound is not decoration: the ratio is multiplied by a user-supplied cup
 * count and rendered, so an out-of-range value stored by hand would produce
 * nonsense rather than a number. Anything outside the range is rejected at the
 * decode boundary and the default is used instead.
 *
 * `waterToRiceRatio` is the unprefixed key both 1.0 and 2.0 wrote, as a bare
 * JSON number, so existing settings carry over untouched.
 */
export function createRatioStore(): Store<number> {
  return defineStore({
    key: 'rice.ratio',
    decoder: inRange(number, MIN_RATIO, MAX_RATIO),
    fallback: () => DEFAULT_RATIO,
    legacy: {
      key: 'waterToRiceRatio',
      decoder: inRange(number, MIN_RATIO, MAX_RATIO),
    },
  });
}
